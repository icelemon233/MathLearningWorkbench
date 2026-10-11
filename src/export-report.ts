import type { Document as WordDocument } from 'docx';
import type { MonthlyReport, ReportContent } from './types';
import printStyles from './report-print.css?inline';

const SECTION_LABELS: ReadonlyArray<{ key: keyof ReportContent; label: string }> = [
  { key: 'state', label: '近期学习状态反馈' },
  { key: 'level', label: '当前学习水平分析' },
  { key: 'guidance', label: '辅导方向及预期' },
  { key: 'supplement', label: '其余补充' },
  { key: 'plan', label: '后续教学计划' },
];

const cleanText = (value: string | null | undefined): string =>
  String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();

/** Export only the saved report and its student snapshot, never the current roster or notes. */
function reportView(report: MonthlyReport) {
  const student = report.snapshot?.student;
  const name = cleanText(student?.name);
  if (!name) throw new Error('月报缺少保存时的学生信息，请重新保存月报后导出。');

  const sections = SECTION_LABELS.map(({ key, label }) => ({
    label,
    text: cleanText(report.content?.[key]),
  })).filter(({ text }) => text.length > 0);
  if (sections.length === 0) throw new Error('月报内容为空，请填写并审核后再导出。');

  return {
    title: cleanText(report.title) || '数学学习月报',
    name,
    grade: cleanText(student.grade),
    period: `${cleanText(report.period_start)} 至 ${cleanText(report.period_end)}`,
    sections,
  };
}

function textParagraphs(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

/** Kept separate from downloading so the exact exported OOXML can be verified. */
export async function createReportDocument(report: MonthlyReport): Promise<WordDocument> {
  const view = reportView(report);
  const { Document, Paragraph, TextRun, HeadingLevel, convertMillimetersToTwip } = await import('docx');
  const font = { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: 'Microsoft YaHei', cs: 'Calibri' };
  const body = (text: string) => new Paragraph({
    children: [new TextRun({ text, font, size: 22, color: '000000' })],
    spacing: { after: 120, line: 360 },
    widowControl: true,
    keepLines: false,
    wordWrap: true,
  });

  const children = [
    new Paragraph({
      text: view.title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 280 },
      keepNext: true,
    }),
    body(`学生：${view.name}${view.grade ? `    年级：${view.grade}` : ''}    学科：数学`),
    body(`报告周期：${view.period}`),
  ];
  for (const section of view.sections) {
    children.push(new Paragraph({
      text: section.label,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 140 },
      keepNext: true,
    }));
    children.push(...textParagraphs(section.text).map(body));
  }

  return new Document({
    creator: '',
    lastModifiedBy: '',
    title: view.title,
    subject: '数学学习月报',
    description: '',
    styles: {
      default: {
        document: {
          run: { font, size: 22, color: '000000', language: { value: 'zh-CN', eastAsia: 'zh-CN' } },
          paragraph: { spacing: { line: 360, after: 120 } },
        },
        title: { run: { font, size: 40, bold: true, color: '000000' } },
        heading1: { run: { font, size: 26, bold: true, color: '000000' } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
          margin: {
            top: convertMillimetersToTwip(22),
            right: convertMillimetersToTwip(20),
            bottom: convertMillimetersToTwip(22),
            left: convertMillimetersToTwip(20),
          },
        },
      },
      children,
    }],
  });
}

export async function exportReportDocx(report: MonthlyReport): Promise<void> {
  const document = await createReportDocument(report);
  const { Packer } = await import('docx');
  const blob = await Packer.toBlob(document);
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  const name = `${cleanText(report.snapshot.student.name)}-${cleanText(report.title) || '数学学习月报'}-${report.period_end}`;
  anchor.href = url;
  anchor.download = `${name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 120)}.docx`;
  anchor.hidden = true;
  window.document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser time to begin reading the Blob before releasing its URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

let currentPrintFrame: HTMLIFrameElement | null = null;

/** Open the browser's “打印 / 保存 PDF” dialog without creating a blocked popup. */
export async function printReport(report: MonthlyReport): Promise<void> {
  const view = reportView(report);
  currentPrintFrame?.remove();
  const frame = window.document.createElement('iframe');
  frame.title = '月报打印文档';
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '210mm',
    height: '297mm',
    border: '0',
    pointerEvents: 'none',
  });
  window.document.body.append(frame);
  currentPrintFrame = frame;
  const printWindow = frame.contentWindow;
  const doc = frame.contentDocument;
  const cleanup = () => {
    frame.remove();
    if (currentPrintFrame === frame) currentPrintFrame = null;
  };
  if (!printWindow || !doc) {
    cleanup();
    throw new Error('无法打开打印文档，请刷新页面后重试。');
  }

  try {
    doc.documentElement.lang = 'zh-CN';
    doc.title = view.title;
    const charset = doc.createElement('meta');
    charset.setAttribute('charset', 'utf-8');
    const style = doc.createElement('style');
    style.textContent = printStyles;
    doc.head.append(charset, style);
    const article = doc.createElement('article');
    article.className = 'monthly-report-print';
    const title = doc.createElement('h1');
    title.textContent = view.title;
    article.append(title);

    const metadata = doc.createElement('div');
    metadata.className = 'report-metadata';
    for (const text of [
      `学生：${view.name}${view.grade ? `    年级：${view.grade}` : ''}    学科：数学`,
      `报告周期：${view.period}`,
    ]) {
      const paragraph = doc.createElement('p');
      paragraph.textContent = text;
      metadata.append(paragraph);
    }
    article.append(metadata);

    for (const section of view.sections) {
      const heading = doc.createElement('h2');
      heading.textContent = section.label;
      article.append(heading);
      for (const text of textParagraphs(section.text)) {
        const paragraph = doc.createElement('p');
        paragraph.textContent = text;
        article.append(paragraph);
      }
    }
    doc.body.replaceChildren(article);
    // Waiting for the iframe's fonts and a paint avoids incomplete Chinese glyphs in print preview.
    await doc.fonts.ready;
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
    if (!frame.isConnected) throw new Error('打印已被新的打印请求替换，请重新操作。');
    printWindow.addEventListener('afterprint', cleanup, { once: true });
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}
