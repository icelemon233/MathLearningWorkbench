import { describe, expect, it } from 'vitest';
import { masteryCounts, monthPeriod, validatePeriod } from '../src/lib';
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
