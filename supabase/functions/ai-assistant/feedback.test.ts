import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ApiError, feedbackOutput, messagesFor } from './logic.ts';

const source = {
  student: { name: '测试学生' },
  lesson: {
    lesson_date: '2026-09-28', content: '一次函数的概念\n斜率与截距',
    performance: '能参与讨论，独立练习时需要提醒检查步骤。', problems: '求截距时漏写代入步骤。',
    homework_completion: '已完成', next_plan: '先复习代入步骤，再讨论图像。', homework: '完成讲义第3页变式2。',
  },
};
const draft = {
  content_points: ['一次函数的概念', '斜率与截距'],
  state_summary: '今天能参与讨论，独立练习时仍需要提醒检查步骤。',
  problem_observation: '从课堂练习的完成情况来看，求截距时仍有漏写代入步骤的情况。',
  cause_and_strategy: '可能尚未形成逐步检查的习惯，还需进一步观察确认；后续建议先完整写出代入过程，再检查结果。',
};
const bodyParagraphs = (feedback: string) => feedback.split('二、课堂表现\n')[1].split('\n\n三、课后作业及后续计划')[0].split('\n\n');
const invalid = (fn: () => unknown) => assert.throws(fn, (e: unknown) => e instanceof ApiError && e.code === 'invalid_model_output');

test('parent feedback follows the exact greeting, lesson date, sections, three paragraphs and task order', () => {
  const result = feedbackOutput(draft, source);
  assert.equal(result, `测试学生家长您好！
以下是孩子2026年9月28日的数学课堂反馈，请您查收。

一、课堂内容（2026年9月28日）
一次函数的概念
斜率与截距

二、课堂表现
${draft.state_summary}

${draft.problem_observation}

${draft.cause_and_strategy}

三、课后作业及后续计划
下节课计划：先复习代入步骤，再讨论图像。
课后作业：完成讲义第3页变式2。`);
  assert.equal(bodyParagraphs(result).length, 3);
});

test('line breaks inside model paragraphs cannot add a fourth classroom-performance paragraph', () => {
  const result = feedbackOutput({ ...draft, state_summary: '今天能参与讨论。\r\n独立练习需要提醒。', problem_observation: '求截距时\n\n漏写代入步骤。', cause_and_strategy: '原因还需观察。\r\n\r\n后续建议完整写出代入过程。' }, source);
  assert.deepEqual(bodyParagraphs(result), ['今天能参与讨论； 独立练习需要提醒。', '求截距时 漏写代入步骤。', '原因还需观察。 后续建议完整写出代入过程。']);
});

test('teacher content lines and mathematical numbers are preserved without invented knowledge or tasks', () => {
  const content = '分数运算：3分之2\r\n第2章第3节：2x＋3＝7\n第85页第4题：90°';
  const result = feedbackOutput({ ...draft, content_points: ['模型额外添加的知识点'] }, { ...source, lesson: { ...source.lesson, content, next_plan: '复习分数运算。', homework: '完成第85页第4题。' } });
  assert.ok(result.includes('分数运算：3分之2\n第2章第3节：2x＋3＝7\n第85页第4题：90°'));
  assert.ok(!result.includes('模型额外添加'));
  assert.ok(result.includes('下节课计划：复习分数运算。\n课后作业：完成第85页第4题。'));
});

test('one content line may be split only into complete literal source spans in their original order', () => {
  const content = '一次函数的概念；斜率与截距';
  const data = { ...source, lesson: { ...source.lesson, content } };
  assert.ok(feedbackOutput(draft, data).includes('一次函数的概念\n斜率与截距'));
  for (const points of [['一次函数的概念', '原文中没有的圆锥曲线'], ['斜率与截距', '一次函数的概念'], ['一次函数的概念']]) {
    const result = feedbackOutput({ ...draft, content_points: points }, data);
    assert.ok(result.includes(`一、课堂内容（2026年9月28日）\n${content}\n\n二、课堂表现`));
    assert.ok(!result.includes('圆锥曲线'));
  }
});

test('missing source observations are not replaced with invented praise, problems or homework', () => {
  const result = feedbackOutput(draft, { ...source, lesson: { ...source.lesson, performance: '', problems: '', homework_completion: '', next_plan: '', homework: '' } });
  const paragraphs = bodyParagraphs(result);
  assert.equal(paragraphs.length, 3);
  assert.ok(paragraphs[0].includes('状态尚未记录'));
  assert.ok(paragraphs[1].includes('具体问题尚未记录'));
  assert.ok(paragraphs[2].includes('尚不能判断原因'));
  assert.ok(!result.includes(draft.state_summary));
  assert.ok(result.endsWith('下节课计划：尚未记录。\n课后作业：尚未记录。'));
});

test('recorded incomplete homework supports a factual observation even without a problem description', () => {
  const result = feedbackOutput({ ...draft, problem_observation: '上次作业部分完成，具体错误尚未记录。' }, { ...source, lesson: { ...source.lesson, problems: '', homework_completion: '部分完成' } });
  assert.equal(bodyParagraphs(result)[1], '上次作业部分完成，具体错误尚未记录。');
});

test('legacy blobs, missing fields and nested headings are rejected rather than passed through', () => {
  invalid(() => feedbackOutput({ feedback: '旧版整段反馈。' }, source));
  invalid(() => feedbackOutput({ ...draft, problem_observation: [] }, source));
  invalid(() => feedbackOutput({ ...draft, cause_and_strategy: '二、课堂表现\n另一整段。' }, source));
});

test('exam scores and promises are rejected without banning fractions, chapter/page numbers or time', () => {
  invalid(() => feedbackOutput({ ...draft, state_summary: '本次月考成绩85分。' }, source));
  invalid(() => feedbackOutput({ ...draft, state_summary: '本次练习85分。' }, source));
  invalid(() => feedbackOutput({ ...draft, state_summary: '这次拿了85分。' }, source));
  invalid(() => feedbackOutput({ ...draft, state_summary: '本次成绩：85。' }, source));
  invalid(() => feedbackOutput({ ...draft, cause_and_strategy: '保证下次考试提高成绩。' }, source));
  const result = feedbackOutput({ ...draft, problem_observation: '第8题用时15分钟，分数运算3分之2的步骤仍需检查。' }, source);
  assert.ok(result.includes('第8题用时15分钟，分数运算3分之2'));
  const shortMinutes = feedbackOutput({ ...draft, problem_observation: '月考试卷第8题用时15分，解题步骤仍需检查。' }, source);
  assert.ok(shortMinutes.includes('第8题用时15分'));
});

test('unsupported definite causes and missing analysis are rejected', () => {
  invalid(() => feedbackOutput({ ...draft, cause_and_strategy: '主要原因是学生不够认真，后续加强练习。' }, source));
  invalid(() => feedbackOutput({ ...draft, cause_and_strategy: '可能需要观察，但原因在于不认真。' }, source));
  invalid(() => feedbackOutput({ ...draft, cause_and_strategy: '后续加强练习。' }, source));
  invalid(() => feedbackOutput({ ...draft, cause_and_strategy: '可能原因是步骤不熟，但主要原因在于不认真。' }, source));
  for (const analysis of ['可能原因是步骤还不熟，后续建议针对代入步骤练习。', '或许的主要原因是检查习惯尚未稳定，还需观察确认。', '具体原因尚不明确，建议继续观察练习过程，再安排针对性巩固。']) {
    assert.equal(bodyParagraphs(feedbackOutput({ ...draft, cause_and_strategy: analysis }, source))[2], analysis);
  }
});

test('feedback prompt separates the required paragraphs and forbids unsupported causes, scores and tasks', () => {
  const prompts = messagesFor({ action: 'lesson_feedback', lesson_id: '10000000-0000-4000-8000-000000000001' }, source);
  const text = prompts[1].content;
  assert.ok(text.includes('state_summary') && text.includes('problem_observation') && text.includes('cause_and_strategy'));
  assert.ok(text.includes('还需进一步观察确认'));
  assert.ok(text.includes('不要提考试成绩或分数'));
  assert.ok(text.includes('你不要新增作业、页码、题号或计划'));
});
