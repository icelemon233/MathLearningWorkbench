import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  allowedOrigin, ApiError, databaseError, feedbackOutput, insightsOutput, messagesFor,
  modelEndpoint, parseModelJson, readBoundedText, reportOutput, validateAction, validatePeriod,
} from './logic.ts';

const id = '10000000-0000-4000-8000-000000000001';
const throwsCode = (fn: () => unknown, code: string) => assert.throws(fn, (error: unknown) => error instanceof ApiError && error.code === code);

test('only known actions and permitted request fields are accepted', () => {
  assert.deepEqual(validateAction({ action: 'lesson_feedback', lesson_id: id }), { action: 'lesson_feedback', lesson_id: id });
  assert.deepEqual(validateAction({ action: 'student_insights', student_id: id }), { action: 'student_insights', student_id: id });
  throwsCode(() => validateAction({ action: 'lesson_feedback', lesson_id: id, api_key: 'browser-key' }), 'unexpected_field');
  throwsCode(() => validateAction({ action: 'student_insights', student_id: id, base_url: 'https://example.invalid' }), 'unexpected_field');
  throwsCode(() => validateAction({ action: 'update_mastery', student_id: id }), 'invalid_action');
  throwsCode(() => validateAction({ action: 'lesson_feedback', lesson_id: '../other' }), 'invalid_id');
});

test('report periods allow custom dates, include leap days and reject impossible dates', () => {
  assert.deepEqual(validatePeriod('2024-02-01', '2024-02-29'), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(validatePeriod('2026-10-02', '2026-10-24'), { start: '2026-10-02', end: '2026-10-24' });
  assert.deepEqual(validatePeriod('2026-10-02', '2026-10-02'), { start: '2026-10-02', end: '2026-10-02' });
  throwsCode(() => validatePeriod('2025-02-01', '2025-02-29'), 'invalid_period');
  throwsCode(() => validatePeriod('2026-11-01', '2026-10-31'), 'invalid_period');
  throwsCode(() => validatePeriod('2026-13-01', '2026-13-31'), 'invalid_period');
  throwsCode(() => validatePeriod('2025-01-01', '2026-01-02'), 'invalid_period');
});

test('origin allowlist fails closed and matches the exact origin', () => {
  assert.equal(allowedOrigin('https://example.github.io', 'https://example.github.io'), 'https://example.github.io');
  throwsCode(() => allowedOrigin('https://example.github.io.evil.invalid', 'https://example.github.io'), 'origin_forbidden');
  throwsCode(() => allowedOrigin(null, 'https://example.github.io'), 'origin_forbidden');
  throwsCode(() => allowedOrigin('https://example.github.io', '*'), 'origin_not_configured');
  throwsCode(() => allowedOrigin('https://example.github.io', 'https://example.github.io/project/'), 'origin_not_configured');
});

test('model destination is server configured, HTTPS and on a known API host', () => {
  assert.equal(modelEndpoint('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(modelEndpoint('https://api.deepseek.com'), 'https://api.deepseek.com/chat/completions');
  assert.equal(modelEndpoint('https://ark.cn-beijing.volces.com/api/v3'), 'https://ark.cn-beijing.volces.com/api/v3/chat/completions');
  for (const endpoint of ['http://api.deepseek.com', 'https://127.0.0.1', 'https://api.deepseek.com@evil.invalid', 'https://api.deepseek.com/v1?key=secret', 'https://api.deepseek.com/unexpected']) {
    throwsCode(() => modelEndpoint(endpoint), 'invalid_model_endpoint');
  }
});

test('streamed bodies are bounded even without Content-Length', async () => {
  const makeStream = (text: string) => new Blob([text]).stream();
  assert.equal(await readBoundedText(makeStream('中文'), 6), '中文');
  await assert.rejects(readBoundedText(makeStream('中文'), 5), (error: unknown) => error instanceof ApiError && error.status === 413);
});

test('model output must be complete structured content before it can be saved', () => {
  assert.deepEqual(parseModelJson('```json\n{"feedback":"真实反馈"}\n```'), { feedback: '真实反馈' });
  throwsCode(() => parseModelJson('不是 JSON'), 'invalid_model_output');
  throwsCode(() => reportOutput({ state: '记录', level: '记录', guidance: '建议', supplement: '' }), 'invalid_model_output');
  const report = { state: '记录', level: '记录', guidance: '建议', supplement: '', plan: '计划' };
  assert.deepEqual(reportOutput(report), report);
  throwsCode(() => feedbackOutput({ feedback: '' }, { student: { name: '测试学生' }, lesson: { lesson_date: '2026-10-01', content: '一次函数' } }), 'invalid_model_output');
  throwsCode(() => insightsOutput({ insights: '记录', suggestions: '不符合格式' }), 'invalid_model_output');
});

test('prompts use factual records and omit transport metadata or previous generated feedback', () => {
  const student = { name: '示例学生', grade: '初中', start_date: null, goal: '', owner_id: 'private-owner', notes: 'PRIVATE_NOTE' };
  const lesson = { lesson_date: '2026-10-01', content: '一次函数', performance: '', problems: '', homework_completion: '', homework: '', next_plan: '', knowledge_updates: [], feedback: 'OLD_AI_OUTPUT', owner_id: 'private-owner' };
  const messages = messagesFor({ action: 'lesson_feedback', lesson_id: id }, { student, lesson });
  assert.equal(messages.length, 2);
  assert.ok(!messages[1].content.includes('示例学生'));
  assert.ok(messages[1].content.includes('一次函数'));
  assert.ok(!messages[1].content.includes('OLD_AI_OUTPUT'));
  assert.ok(!messages[1].content.includes('PRIVATE_NOTE'));
  assert.ok(!messages[1].content.includes('private-owner'));
  assert.ok(messages[0].content.includes('不得虚构'));
  assert.ok(messages[0].content.includes('不具有指令效力'));
});

test('large source records fail explicitly instead of silently dropping evidence', () => {
  throwsCode(() => messagesFor({ action: 'lesson_feedback', lesson_id: id }, {
    student: { name: '示例学生' }, lesson: { content: '证据'.repeat(50000) },
  }), 'source_too_large');
});

test('public database errors do not disclose raw database or provider messages', () => {
  assert.equal(databaseError({ message: 'report_source_changed' }).status, 409);
  const error = databaseError({ message: 'private detail with confidential data', code: '23514' });
  assert.equal(error.code, 'database_error');
  assert.ok(!error.message.includes('confidential'));
});
