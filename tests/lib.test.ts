import { describe, expect, it } from 'vitest';
import { aiErrorMessage, errorMessage, masteryCounts, monthPeriod, validatePeriod } from '../src/lib';
import { EMPTY_DATA } from '../src/types';
import type { AppData } from '../src/types';

describe('report date boundaries', () => {
  it('includes the actual last day of leap and ordinary February', () => {
    expect(monthPeriod('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(monthPeriod('2025-02').end).toBe('2025-02-28');
    expect(monthPeriod('2026-12').end).toBe('2026-12-31');
  });
  it('rejects nonexistent dates, reversed dates, and malformed months', () => {
    expect(() => validatePeriod('2026-02-29', '2026-03-10')).toThrow();
    expect(() => validatePeriod('2026-10-10', '2026-10-01')).toThrow();
    expect(() => monthPeriod('2026-13')).toThrow();
    expect(() => validatePeriod('2026-10-08', '2026-11-09')).not.toThrow();
  });
});
describe('mastery summary scope', () => {
  const data = { ...EMPTY_DATA, students: [{ id: 'active', archived: false }, { id: 'archived', archived: true }], knowledgePoints: [{ id: 'open', archived: false }, { id: 'closed', archived: true }], studentKnowledge: [
    { student_id: 'active', knowledge_point_id: 'open', status: 'weak' },
    { student_id: 'archived', knowledge_point_id: 'open', status: 'mastered' },
    { student_id: 'active', knowledge_point_id: 'closed', status: 'basic' },
  ] } as AppData;
  it('counts only active students and active assigned knowledge', () => {
    expect(masteryCounts(data)).toEqual({ pending: 0, weak: 1, basic: 0, mastered: 0 });
    expect(masteryCounts(data, 'archived')).toEqual({ pending: 0, weak: 0, basic: 0, mastered: 0 });
  });
  it('does not infer statuses for missing records', () => {
    expect(masteryCounts(EMPTY_DATA)).toEqual({ pending: 0, weak: 0, basic: 0, mastered: 0 });
  });
});
describe('AI error messages', () => {
  it('uses stable codes when a parsed JSON message has already lost its Chinese text', () => {
    const message = 'AI \uFFFD\uFFFD\uFFFDδ\uFFFD棬\uFFFDԡ\uFFFD';
    expect(aiErrorMessage({ code: 'invalid_model_output', message })).toBe('AI 返回内容格式不符合要求，尚未保存，请重新生成。');
    expect(aiErrorMessage({ code: 'incomplete_model_output', message })).toBe('AI 输出尚未完成，本次内容未保存，请重新生成。');
  });
  it('preserves readable messages and replaces corrupted or missing unknown errors', () => {
    expect(aiErrorMessage({ code: 'model_timeout', message: '模型响应超时，请稍后重试。' })).toBe('模型响应超时，请稍后重试。');
    expect(aiErrorMessage(' AI 服务正在维护。 ')).toBe('AI 服务正在维护。');
    for (const value of [{ code: 'unknown', message: 'AI \uFFFD\uFFFD错误' }, 'AI \uFFFD\uFFFD错误', { code: 'unknown' }, { message: 42 }, null]) {
      expect(aiErrorMessage(value)).toBe('AI 服务暂时不可用，请稍后重试。');
    }
  });
});

describe('lesson deletion errors', () => {
  it('explains a stale confirmation and an already deleted record in Chinese', () => {
    expect(errorMessage({ message: 'lesson_delete_conflict' })).toBe('这节课已在其他设备更新，本次未删除。请取消、刷新后重新确认。');
    expect(errorMessage(new Error('lesson_missing'))).toBe('这节课已被删除或无法访问。请取消并刷新列表。');
    expect(errorMessage({ message: 'lesson_delete_network' })).toBe('删除结果暂时无法确认，请检查网络并刷新列表，核对记录是否仍然存在。');
  });
});

describe('Chinese interface errors', () => {
  it('localizes unknown server errors and knowledge option conflicts', () => {
    expect(errorMessage(new Error('Unexpected server failure'))).toBe('操作失败，请稍后重试。未保存的内容仍在当前页面。');
    expect(errorMessage(new Error('knowledge_option_conflict'))).toBe('这个知识点已在其他设备更新，请刷新后重试。');
    expect(errorMessage(new Error('knowledge_option_missing'))).toBe('这个知识点已从选项中删除，请重新选择或输入名称恢复。');
  });
});
