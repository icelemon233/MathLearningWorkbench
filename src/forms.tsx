import { useRef, useState } from 'react';
import { Alert, AutoComplete, Button, Checkbox, Col, DatePicker, Form, Input, InputNumber, Row, Segmented, Select, Typography } from 'antd';
import type { AutoCompleteProps } from 'antd';
import { SaveOutlined, ThunderboltOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { monthPeriod, today, validatePeriod } from './lib';
import { STATUS_OPTIONS } from './types';
import { KnowledgePicker } from './knowledge-picker';
import type { KnowledgeOptionActions } from './knowledge-picker';
import type { AppData, KnowledgePoint, KnowledgeUpdate, Lesson, MasteryStatus, ReportContent, Student, StudentKnowledge } from './types';

const DATE_FORMAT = 'YYYY-MM-DD';
const gradeOptions = ['小学一年级', '小学二年级', '小学三年级', '小学四年级', '小学五年级', '小学六年级', '七年级', '八年级', '九年级', '高一', '高二', '高三'].map(value => ({ value }));
const statusOptions = STATUS_OPTIONS.map(option => ({ ...option }));
const trim = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const dateValue = (value?: string | null) => value ? dayjs(value) : null;
const dateText = (value?: Dayjs | null) => value?.isValid() ? value.format(DATE_FORMAT) : '';
const requiredText = (label: string) => [{ required: true, whitespace: true, message: `请填写${label}` }];
const requiredChoice = (label: string) => [{ required: true, message: `请选择${label}` }];

function GradeInput(props: AutoCompleteProps) {
  return <AutoComplete {...props} options={gradeOptions} filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.trim().toLowerCase())}>
    <Input maxLength={40} placeholder="选择或填写年级，如：七年级" />
  </AutoComplete>;
}

type StudentValues = { name: string; grade: string; start_date?: Dayjs | null; goal?: string; notes?: string };
export function StudentForm({ student, busy, save }: { student?: Student; busy: boolean; save: (value: Partial<Student>) => void }) {
  const onFinish = (values: StudentValues) => {
    if (busy) return;
    save({ ...(student ? { id: student.id } : {}), name: trim(values.name), grade: trim(values.grade), start_date: dateText(values.start_date) || null, goal: trim(values.goal), notes: trim(values.notes) });
  };
  return <Form<StudentValues> name="student" layout="vertical" disabled={busy} onFinish={onFinish} scrollToFirstError initialValues={{ name: student?.name ?? '', grade: student?.grade ?? '', start_date: dateValue(student?.start_date), goal: student?.goal ?? '', notes: student?.notes ?? '' }}>
    <Row gutter={[20, 0]}>
      <Col xs={24} sm={12}><Form.Item name="name" label="学生姓名" rules={requiredText('学生姓名')}><Input maxLength={60} placeholder="填写姓名" /></Form.Item></Col>
      <Col xs={24} sm={12}><Form.Item name="grade" label="年级" rules={requiredText('年级')}><GradeInput /></Form.Item></Col>
      <Col xs={24} sm={12}><Form.Item name="start_date" label="开始学习日期"><DatePicker format={DATE_FORMAT} style={{ width: '100%' }} /></Form.Item></Col>
      <Col span={24}><Form.Item name="goal" label="学习目标"><Input.TextArea rows={3} maxLength={2000} placeholder="希望解决哪些问题，达到什么目标" /></Form.Item></Col>
      <Col span={24}><Form.Item name="notes" label="备注"><Input.TextArea rows={2} maxLength={2000} placeholder="其他需要记住的事项（选填）" /></Form.Item></Col>
    </Row>
    <footer className="form-footer"><Typography.Text type="secondary">保存后在你的设备间同步</Typography.Text><Button type="primary" htmlType="submit" loading={busy} disabled={busy} icon={<SaveOutlined />}>保存学生档案</Button></footer>
  </Form>;
}

type KnowledgeValues = { grade: string; chapter: string; title: string; sort_order?: number | null };
export function KnowledgeForm({ point, busy, save }: { point?: KnowledgePoint; busy: boolean; save: (value: Partial<KnowledgePoint>) => void }) {
  const onFinish = (values: KnowledgeValues) => {
    if (busy) return;
    save({ ...(point ? { id: point.id } : {}), grade: trim(values.grade), chapter: trim(values.chapter), title: trim(values.title), sort_order: values.sort_order ?? 0 });
  };
  return <Form<KnowledgeValues> name="knowledge" layout="vertical" disabled={busy} onFinish={onFinish} scrollToFirstError initialValues={{ grade: point?.grade ?? '', chapter: point?.chapter ?? '', title: point?.title ?? '', sort_order: point?.sort_order ?? 0 }}>
    <Row gutter={[20, 0]}>
      <Col xs={24} sm={12}><Form.Item name="grade" label="年级" rules={requiredText('年级')}><GradeInput /></Form.Item></Col>
      <Col xs={24} sm={12}><Form.Item name="chapter" label="章节" rules={requiredText('章节')}><Input maxLength={100} placeholder="填写章节名称" /></Form.Item></Col>
      <Col span={24}><Form.Item name="title" label="知识点名称" rules={requiredText('知识点名称')}><Input maxLength={150} placeholder="填写一个可以单独评价掌握情况的知识点" /></Form.Item></Col>
      <Col xs={24} sm={12}><Form.Item name="sort_order" label="显示顺序" rules={[{ type: 'integer', min: 0, max: 9999, message: '显示顺序应为 0 至 9999 的整数' }]}><InputNumber min={0} max={9999} precision={0} style={{ width: '100%' }} /></Form.Item></Col>
    </Row>
    <footer className="form-footer"><Typography.Text type="secondary">目录共用，掌握情况按学生分别记录</Typography.Text><Button type="primary" htmlType="submit" loading={busy} disabled={busy} icon={<SaveOutlined />}>保存知识点</Button></footer>
  </Form>;
}

type MasteryValues = { point: string; status: MasteryStatus; note?: string };
export function MasteryForm({ student, points, assignments, current, busy, save, createPoint, deletePoint }: KnowledgeOptionActions & {
  student: Student; points: KnowledgePoint[]; assignments: StudentKnowledge[]; current?: StudentKnowledge; busy: boolean;
  save: (id: string, status: MasteryStatus, note: string, previous?: StudentKnowledge) => void;
}) {
  const [form] = Form.useForm<MasteryValues>();
  const [baseline, setBaseline] = useState(current);
  const previousSelection = useRef(current?.knowledge_point_id);
  const onFinish = (values: MasteryValues) => {
    if (busy) return;
    save(trim(values.point), values.status, trim(values.note), baseline);
  };
  return <Form<MasteryValues> form={form} name="mastery" layout="vertical" disabled={busy} onFinish={onFinish} scrollToFirstError
    onValuesChange={changed => {
      if (!Object.hasOwn(changed, 'point')) return;
      const existing = assignments.find(item => item.knowledge_point_id === changed.point);
      setBaseline(existing ? { ...existing } : undefined);
      if (existing || previousSelection.current) form.setFieldsValue({ status: existing?.status ?? 'pending', note: existing?.note ?? '' });
      previousSelection.current = changed.point;
    }}
    initialValues={{ point: current?.knowledge_point_id, status: current?.status ?? 'pending', note: current?.note ?? '' }}>
    {student.archived && <Alert type="warning" showIcon title="这位学生已归档，请恢复档案后再保存。" style={{ marginBottom: 16 }} />}
    <Row gutter={[20, 0]}>
      <Col span={24}><Form.Item name="point" label="知识点" rules={requiredChoice('知识点')}><KnowledgePicker points={points} grade={student.grade} disabled={busy || !!current} createPoint={createPoint} deletePoint={deletePoint} /></Form.Item></Col>
      <Col xs={24} sm={12}><Form.Item name="status" label="掌握情况" rules={requiredChoice('掌握情况')}><Select options={statusOptions} /></Form.Item></Col>
      <Col span={24}><Form.Item name="note" label="判断依据 / 备注"><Input.TextArea maxLength={2000} rows={3} placeholder="记录练习表现、常见错误或后续巩固重点" /></Form.Item></Col>
    </Row>
    <footer className="form-footer"><Typography.Text type="secondary">{student.name}的独立掌握记录</Typography.Text><Button type="primary" htmlType="submit" loading={busy} disabled={busy} icon={<SaveOutlined />}>保存掌握情况</Button></footer>
  </Form>;
}

type LessonValues = { student: string; lesson_date: Dayjs; content: string; performance?: string; problems?: string; homework_completion?: string; homework?: string; next_plan?: string };
export function LessonForm({ data, studentId, lesson, busy, save }: { data: AppData; studentId?: string; lesson?: Lesson; busy: boolean; save: (value: Partial<Lesson> & { knowledge_updates: KnowledgeUpdate[] }, versions: Record<string, string | null>) => void }) {
  const [selected, setSelected] = useState(lesson?.student_id ?? studentId ?? data.students.find(student => !student.archived)?.id ?? '');
  const [lessonBaseline] = useState(() => lesson ? { id: lesson.id, updated_at: lesson.updated_at } : undefined);
  const [updates, setUpdates] = useState<Record<string, MasteryStatus>>({});
  const [baselines, setBaselines] = useState<Record<string, string | null>>({});
  const student = data.students.find(item => item.id === selected);
  const assigned = new Set(data.studentKnowledge.filter(item => item.student_id === selected).map(item => item.knowledge_point_id));
  const points = data.knowledgePoints.filter(point => !point.archived && (assigned.has(point.id) || (!!student?.grade && point.grade === student.grade)));
  const onFinish = (values: LessonValues) => {
    if (busy) return;
    const problems = trim(values.problems), content = trim(values.content);
    const knowledge_updates: KnowledgeUpdate[] = Object.entries(updates).map(([id, status]) => ({ knowledge_point_id: id, status, note: problems || content }));
    const versions = Object.fromEntries(knowledge_updates.map(update => [update.knowledge_point_id, baselines[update.knowledge_point_id]]));
    save({ ...lessonBaseline, student_id: trim(values.student), lesson_date: dateText(values.lesson_date), content, performance: trim(values.performance), problems, homework_completion: trim(values.homework_completion), homework: trim(values.homework), next_plan: trim(values.next_plan), knowledge_updates }, versions);
  };
  const changeStudent = (id: string) => { setSelected(id); setUpdates({}); setBaselines({}); };
  const toggleKnowledge = (id: string, checked: boolean, current?: StudentKnowledge) => {
    if (busy) return;
    // Capture the current cloud version when checked, never during later renders.
    setBaselines(previous => { const next = { ...previous }; if (checked) next[id] = current?.updated_at ?? null; else delete next[id]; return next; });
    setUpdates(previous => { const next = { ...previous }; if (checked) next[id] = current?.status ?? 'pending'; else delete next[id]; return next; });
  };
  return <Form<LessonValues> name="lesson" layout="vertical" disabled={busy} onFinish={onFinish} scrollToFirstError initialValues={{ student: selected, lesson_date: dateValue(lesson?.lesson_date ?? today()), content: lesson?.content ?? '', performance: lesson?.performance ?? '', problems: lesson?.problems ?? '', homework_completion: lesson?.homework_completion ?? '', homework: lesson?.homework ?? '', next_plan: lesson?.next_plan ?? '' }}>
    <Row gutter={[20, 0]}>
      <Col xs={24} sm={12}><Form.Item name="student" label="学生" rules={requiredChoice('学生')}><Select showSearch optionFilterProp="label" disabled={busy || !!lessonBaseline} placeholder="选择学生" onChange={changeStudent} options={data.students.filter(item => !item.archived || item.id === selected).map(item => ({ value: item.id, label: `${item.name} · ${item.grade || '年级未填写'}` }))} /></Form.Item></Col>
      <Col xs={24} sm={12}><Form.Item name="lesson_date" label="上课日期" rules={requiredChoice('上课日期')}><DatePicker format={DATE_FORMAT} style={{ width: '100%' }} /></Form.Item></Col>
      <Col span={24}><Form.Item name="content" label="本节课内容" rules={requiredText('本节课内容')} extra="可直接写关键词、口语或零散笔记，保存后用 AI 整理为课后反馈。"><Input.TextArea rows={3} maxLength={4000} placeholder="今天讲了什么、复习或练习了哪些知识点，不必提前整理格式" /></Form.Item></Col>
      <Col xs={24} sm={12}><Form.Item name="performance" label="课堂表现"><Input.TextArea rows={2} maxLength={2000} placeholder="状态、专注、互动与做得好的地方" /></Form.Item></Col>
      <Col xs={24} sm={12}><Form.Item name="problems" label="暴露问题"><Input.TextArea rows={2} maxLength={2000} placeholder="卡在哪里，出现了什么错误" /></Form.Item></Col>
      <Col xs={24} sm={12}><Form.Item name="homework_completion" label="上次作业完成情况"><Select options={['', '已完成', '部分完成', '未完成', '本次无作业'].map(value => ({ value, label: value || '未记录' }))} /></Form.Item></Col>
      <Col xs={24} sm={12}><Form.Item name="homework" label="本次课后作业"><Input.TextArea rows={2} maxLength={2000} placeholder="任务、数量，以及来不及完成时的替代安排（选填）" /></Form.Item></Col>
      <Col span={24}><Form.Item name="next_plan" label="下节课计划"><Input.TextArea rows={2} maxLength={2000} placeholder="下一步讲解、复习或练习重点" /></Form.Item></Col>
    </Row>
    <section className="form-section">
      <Typography.Title level={5}>本次掌握情况调整 <Typography.Text type="secondary">（选填）</Typography.Text></Typography.Title>
      <Typography.Paragraph type="secondary">只勾选本次需要变更的知识点，与课堂记录一起保存。</Typography.Paragraph>
      {points.length ? <div className="knowledge-checks">{points.map(point => {
        const current = data.studentKnowledge.find(item => item.student_id === selected && item.knowledge_point_id === point.id);
        return <div className="knowledge-check" key={point.id}>
          <Checkbox disabled={busy} checked={point.id in updates} onChange={event => toggleKnowledge(point.id, event.target.checked, current)}><span>{point.title}<Typography.Text type="secondary" style={{ display: 'block' }}>{point.chapter}</Typography.Text></span></Checkbox>
          {point.id in updates && <Select aria-label={`${point.title}掌握情况`} disabled={busy} value={updates[point.id]} onChange={(status: MasteryStatus) => setUpdates(previous => ({ ...previous, [point.id]: status }))} options={statusOptions} style={{ minWidth: 112 }} />}
        </div>;
      })}</div> : <Typography.Paragraph type="secondary">还没有适用知识点，可先保存课堂记录，之后维护知识目录。</Typography.Paragraph>}
    </section>
    <footer className="form-footer"><Typography.Text type="secondary">保存事实记录后，可单独生成课后反馈</Typography.Text><Button type="primary" htmlType="submit" loading={busy} disabled={busy} icon={<SaveOutlined />}>保存课堂记录</Button></footer>
  </Form>;
}

type ReportValues = { student: string; report_month: Dayjs; period_start: Dayjs; period_end: Dayjs; context?: string } & Partial<ReportContent>;
const reportFields = [['state', '近期学习状态'], ['level', '当前学习水平与薄弱点'], ['guidance', '辅导方向及预期'], ['supplement', '补充事项（选填）'], ['plan', '下月教学计划']] as const;
export function ReportForm({ data, studentId, busy, save, error }: { data: AppData; studentId?: string; busy: boolean; error: string; save: (id: string, start: string, end: string, content?: ReportContent, context?: string) => void }) {
  const [form] = Form.useForm<ReportValues>();
  const [selected, setSelected] = useState(studentId ?? data.students.find(student => !student.archived)?.id ?? '');
  const [period, setPeriod] = useState(() => monthPeriod(today().slice(0, 7)));
  const [manual, setManual] = useState(false);
  const [validation, setValidation] = useState('');
  const lessons = period.start && period.end ? data.lessons.filter(lesson => lesson.student_id === selected && lesson.lesson_date >= period.start && lesson.lesson_date <= period.end) : [];
  const exists = data.reports.find(report => report.student_id === selected && report.period_start === period.start && report.period_end === period.end);
  const onFinish = (values: ReportValues) => {
    if (busy || exists || !lessons.length) return;
    setValidation('');
    const start = dateText(values.period_start), end = dateText(values.period_end);
    try { validatePeriod(start, end); } catch (err) { setValidation((err as Error).message); return; }
    const content = manual ? { state: trim(values.state), level: trim(values.level), guidance: trim(values.guidance), supplement: trim(values.supplement), plan: trim(values.plan) } : undefined;
    save(trim(values.student), start, end, content, trim(values.context));
  };
  const changeMonth = (value: Dayjs | null) => {
    if (!value) return;
    const next = monthPeriod(value.format('YYYY-MM'));
    form.setFieldsValue({ period_start: dateValue(next.start)!, period_end: dateValue(next.end)! });
    setPeriod(next); setValidation('');
  };
  return <Form<ReportValues> form={form} name="report" layout="vertical" disabled={busy} onFinish={onFinish} scrollToFirstError initialValues={{ student: selected, report_month: dayjs(today()), period_start: dateValue(period.start), period_end: dateValue(period.end) }}>
    <Row gutter={[20, 0]}>
      <Col xs={24} sm={12}><Form.Item name="student" label="学生" rules={requiredChoice('学生')}><Select showSearch optionFilterProp="label" onChange={setSelected} options={data.students.filter(student => !student.archived).map(student => ({ value: student.id, label: student.name }))} placeholder="选择学生" /></Form.Item></Col>
      <Col xs={24} sm={12}><Form.Item name="report_month" label="报告月份"><DatePicker picker="month" format="YYYY年MM月" allowClear={false} onChange={changeMonth} style={{ width: '100%' }} /></Form.Item></Col>
      <Col xs={24} sm={12}><Form.Item name="period_start" label="开始日期" rules={requiredChoice('开始日期')}><DatePicker format={DATE_FORMAT} onChange={value => { setPeriod(previous => ({ ...previous, start: dateText(value) })); setValidation(''); }} style={{ width: '100%' }} /></Form.Item></Col>
      <Col xs={24} sm={12}><Form.Item name="period_end" label="结束日期" dependencies={['period_start']} rules={[...requiredChoice('结束日期'), { validator: (_, value: Dayjs | null) => {
        const start = dateText(form.getFieldValue('period_start')), end = dateText(value);
        if (!start || !end) return Promise.resolve();
        try { validatePeriod(start, end); return Promise.resolve(); } catch (err) { return Promise.reject(err); }
      } }]}><DatePicker format={DATE_FORMAT} onChange={value => { setPeriod(previous => ({ ...previous, end: dateText(value) })); setValidation(''); }} style={{ width: '100%' }} /></Form.Item></Col>
    </Row>
    <div className="report-scope"><Typography.Text>已纳入 <strong>{lessons.length}</strong> 次课堂记录</Typography.Text><Typography.Text type="secondary">生成后固定保存</Typography.Text></div>
    {exists && <Alert type="warning" showIcon title="这个周期已生成月报，请在报告列表中查看。" style={{ marginBottom: 20 }} />}
    <Segmented disabled={busy} value={manual ? 'manual' : 'ai'} onChange={value => setManual(value === 'manual')} options={[{ value: 'ai', label: 'AI 生成', icon: <ThunderboltOutlined /> }, { value: 'manual', label: '手动整理' }]} style={{ marginBottom: 20 }} />
    {manual ? <Row gutter={[20, 0]}>{reportFields.map(([key, label]) => <Col span={24} key={key}><Form.Item name={key} label={label} rules={key === 'supplement' ? [] : requiredText(label)}><Input.TextArea rows={3} maxLength={6000} /></Form.Item></Col>)}</Row> : <Form.Item name="context" label="补充指导（选填）" extra="可补充下月目标、重点和家长配合事项。AI 以课堂记录为依据生成报告。"><Input.TextArea rows={3} maxLength={3000} placeholder="需要在月报中强调或补充的内容" /></Form.Item>}
    {(validation || error) && <Alert type="error" showIcon title={validation || error} />}
    <footer className="form-footer"><Typography.Text type="secondary">请确认周期与记录，月报生成后不再修改</Typography.Text><Button type="primary" htmlType="submit" loading={busy} disabled={busy || !lessons.length || !!exists || !selected} icon={manual ? <SaveOutlined /> : <ThunderboltOutlined />}>生成并保存月报</Button></footer>
  </Form>;
}
