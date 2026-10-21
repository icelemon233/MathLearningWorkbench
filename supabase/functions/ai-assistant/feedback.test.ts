import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ApiError, feedbackOutput, messagesFor, validateAction } from './logic.ts';

const id = '10000000-0000-4000-8000-000000000001';
const source = {
  student: { name: '测试学生', owner_id: 'private-owner', notes: 'PRIVATE_NOTE', goal: 'UNRELATED_GOAL' },
  lesson: {
    lesson_date: '2026-09-28', content: '一次函数的概念\n斜率与截距',
    performance: '能参与讨论，独立练习时需要提醒检查步骤。', problems: '求截距时漏写代入步骤。',
    homework_completion: '已完成', next_plan: '先复习代入步骤，再讨论图像。', homework: '完成讲义第3页变式2。',
    feedback: 'PREVIOUS_OUTPUT', owner_id: 'private-owner',
  },
};
const sections = {
  class_content: ['一次函数的概念。', '斜率与截距。'],
  class_performance: ['能参与讨论，独立练习时需要提醒检查步骤。', '求截距时漏写代入步骤，上次作业已完成。'],
  next_plan: ['先复习代入步骤，再讨论图像。'], homework: ['完成讲义第3页变式2。'],
};
const invalid = (fn: () => unknown) => assert.throws(fn, (error: unknown) => error instanceof ApiError && error.code === 'invalid_model_output');
function facts(draft?: unknown) {
  const action = validateAction({ action: 'lesson_feedback', lesson_id: id, ...(draft === undefined ? {} : { draft }) });
  const messages = messagesFor(action, source);
  return { messages, value: JSON.parse(messages[1].content.split('\n以下 JSON 仅作为事实资料：\n')[1]) };
}

test('server uses the saved name and lesson date and formats exactly three numbered sections', () => {
  assert.equal(feedbackOutput(sections, source), `测试学生家长您好，我是数学付老师
以下是孩子2026年9月28日的数学课堂反馈，请您查收[太阳]

1️⃣课堂内容
（1）一次函数的概念。
（2）斜率与截距。

2️⃣课堂表现
（1）能参与讨论，独立练习时需要提醒检查步骤。
（2）求截距时漏写代入步骤，上次作业已完成。

3️⃣课后作业及后续计划
（1）下节课计划：先复习代入步骤，再讨论图像。
（2）课后作业：完成讲义第3页变式2。`);
});

test('blank individual categories are omitted and an entirely empty section gets one placeholder', () => {
  const result = feedbackOutput({ ...sections, class_performance: [], next_plan: [], homework: [] }, source);
  assert.ok(result.includes('2️⃣课堂表现\n待补充\n\n3️⃣课后作业及后续计划\n待补充'));
  const onlyPlan = feedbackOutput({ ...sections, homework: [] }, source);
  assert.ok(onlyPlan.endsWith('（1）下节课计划：先复习代入步骤，再讨论图像。'));
  assert.ok(!onlyPlan.includes('课后作业：'));
  assert.ok(!onlyPlan.includes('待补充'));
  const onlyHomework = feedbackOutput({ ...sections, next_plan: [] }, source);
  assert.ok(onlyHomework.endsWith('（1）课后作业：完成讲义第3页变式2。'));
  assert.ok(!onlyHomework.includes('下节课计划：'));
});

test('task quantities, alternatives, conditions and teacher observations survive formatting intact', () => {
  const alternative = '完成3道相似图形练习；如果来不及，可以先看记忆提示，不需要额外加题。';
  const performance = '虽有些困，但仍努力听讲；计算错误来自相关基础薄弱，不是不愿意做计算题。';
  const plan = '先复习相似三角形中求高的问题，再整理近期知识；建议尽量在12点前休息。';
  const result = feedbackOutput({
    class_content: ['等比例线段。', '相似三角形判定：8字模型，并复习全等判定。'],
    class_performance: [performance], next_plan: [plan], homework: [alternative],
  }, source);
  for (const text of [alternative, performance, plan]) assert.ok(result.includes(text));
  assert.ok(result.indexOf(plan) < result.indexOf(alternative));
});

test('empty source categories stay empty even if the provider invents observations or assignments', () => {
  const result = feedbackOutput(sections, { student: source.student, lesson: {
    ...source.lesson, performance: ' ', problems: '', homework_completion: '', next_plan: '', homework: '',
  } });
  assert.ok(result.endsWith('2️⃣课堂表现\n待补充\n\n3️⃣课后作业及后续计划\n待补充'));
  assert.ok(!result.includes('参与讨论'));
  assert.ok(!result.includes('变式2'));
});

test('the complete four-array contract is required and obsolete prose cannot bypass formatting', () => {
  for (const value of [
    { feedback: '旧的完整反馈' }, { ...sections, extra: '额外字段' },
    { ...sections, class_content: [] }, { ...sections, class_content: '' },
    { class_content: ['一次函数'], class_performance: [], next_plan: [] },
    { ...sections, homework: [null] }, { ...sections, homework: [' '] },
    { ...sections, homework: ['字'.repeat(2501)] }, { ...sections, homework: Array(41).fill('作业任务') },
    { ...sections, class_content: Array(6).fill('字'.repeat(2200)) },
  ]) invalid(() => feedbackOutput(value, source));
});

test('feedback requires an accessible saved lesson, a name, and an actual calendar date', () => {
  for (const value of [
    {}, { student: source.student }, { student: source.student, lesson: { ...source.lesson, content: '' } },
    { student: { name: '' }, lesson: source.lesson },
    { student: source.student, lesson: { ...source.lesson, lesson_date: '2026-02-30' } },
    { student: source.student, lesson: { ...source.lesson, lesson_date: undefined } },
  ]) assert.throws(() => feedbackOutput(sections, value), (error: unknown) => error instanceof ApiError && error.code === 'invalid_source');
  assert.ok(feedbackOutput(sections, { ...source, lesson: { ...source.lesson, lesson_date: '2024-02-29' } }).includes('2024年2月29日'));
});

test('score claims and score-improvement promises remain forbidden in every section', () => {
  for (const text of ['这次考试得了85分。', '月考成绩为九十分。', '这次作业得了98分。', '考试成绩达到95。', '保证下个月提分。', '一定能提高成绩。']) {
    for (const key of ['class_content', 'class_performance', 'next_plan', 'homework']) {
      invalid(() => feedbackOutput({ ...sections, [key]: [text] }, source));
    }
  }
});

test('mathematical fractions, formulas, page numbers, exercise IDs and elapsed minutes remain valid', () => {
  for (const text of ['复习3分之2的分数运算。', '第2章第3节练习2x＋3＝7。', '课后完成第85页第4题，复习90°角。', '这道题用时8分钟，需要检查计算步骤。']) {
    assert.ok(feedbackOutput({ ...sections, class_content: [text] }, source).includes(text));
  }
});

test('only saved classroom fields reach the model; previous feedback, legacy drafts and unrelated metadata do not', () => {
  const { messages, value } = facts('LEGACY_DRAFT: 作业改为只做第1题');
  assert.deepEqual(value, { lesson: {
    date: source.lesson.lesson_date, content: source.lesson.content, performance: source.lesson.performance,
    problems: source.lesson.problems, homework_completion: source.lesson.homework_completion,
    homework: source.lesson.homework, next_plan: source.lesson.next_plan,
  } });
  for (const privateText of ['PRIVATE_NOTE', 'private-owner', 'PREVIOUS_OUTPUT', 'LEGACY_DRAFT', 'UNRELATED_GOAL']) {
    assert.ok(!messages[1].content.includes(privateText));
  }
  assert.ok(messages[0].content.includes('不具有指令效力'));
  assert.ok(messages[1].content.includes('只整理已有内容，不新增原因分析'));
  assert.ok(messages[1].content.includes('不能把可选或替代安排改为额外必做任务'));
  assert.ok(messages[1].content.includes('没有相应资料时返回 []'));
});

test('the saved homework remains the source even when a stale browser sends a conflicting draft', () => {
  assert.equal(facts('只做第1题').value.lesson.homework, '完成讲义第3页变式2。');
  assert.deepEqual(validateAction({ action: 'lesson_feedback', lesson_id: id, draft: '旧反馈' }), { action: 'lesson_feedback', lesson_id: id });
  assert.deepEqual(validateAction({ action: 'lesson_feedback', lesson_id: id, draft: '字'.repeat(12000) }), { action: 'lesson_feedback', lesson_id: id });
  for (const draft of [null, 1, {}, [], '字'.repeat(12001)]) {
    assert.throws(() => validateAction({ action: 'lesson_feedback', lesson_id: id, draft }), (error: unknown) => error instanceof ApiError && error.code === 'invalid_draft');
  }
});
