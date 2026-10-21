import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeKnowledgeTitle } from '../src/lib';
import type { KnowledgePoint, StudentKnowledge } from '../src/types';

const point: KnowledgePoint = {
  id: '33333333-3333-4333-8333-333333333331', owner_id: '11111111-1111-4111-8111-111111111111',
  grade: '九年级', chapter: '未分类', title: '相似三角形', sort_order: 0, archived: false,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
};
const nextVersion = '2026-10-22T00:00:00Z';
type Reply = { body: unknown; status?: number };
const replies: Reply[] = [];
const calls: Array<{ url: URL; method: string; body: unknown }> = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  const text = await request.text();
  calls.push({ url: new URL(request.url), method: request.method, body: text ? JSON.parse(text) : null });
  const reply = replies.shift();
  if (!reply) throw new Error('Unexpected network request in knowledge option test');
  return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' } });
});
let api: typeof import('../src/api');
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://qa-knowledge.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_qa_knowledge_options_key');
  vi.stubGlobal('fetch', fetchMock);
  api = await import('../src/api');
});
beforeEach(() => { replies.length = 0; calls.length = 0; fetchMock.mockClear(); });
afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('saved knowledge options', () => {
  it('normalizes completed input and rejects invalid titles before contacting the server', async () => {
    expect(normalizeKnowledgeTitle('  相似\n三角形  ')).toBe('相似 三角形');
    for (const title of [' ', '字'.repeat(151)]) await expect(api.ensureKnowledgeOption('九年级', title)).rejects.toThrow('1 至 150');
    expect(calls).toHaveLength(0);
  });

  it('stores a new option immediately using the current grade and a default chapter', async () => {
    replies.push({ body: [] }, { body: point, status: 201 });
    expect(await api.ensureKnowledgeOption(' 九年级 ', ' 相似三角形 ')).toEqual(point);
    expect(calls[0].url.searchParams.get('grade')).toBe('eq.九年级');
    expect(calls[0].url.searchParams.get('title')).toBe('eq.相似三角形');
    expect(calls[1].body).toEqual({ grade: '九年级', chapter: '未分类', title: '相似三角形', sort_order: 0 });
    expect(calls[1].method).toBe('POST');
  });

  it('reuses an existing option without changing its metadata or assessments', async () => {
    replies.push({ body: [point] });
    expect(await api.ensureKnowledgeOption('九年级', point.title)).toEqual(point);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
  });

  it('restores a removed option by stable ID and checks its captured version', async () => {
    replies.push({ body: [{ ...point, archived: true }] }, { body: { ...point, updated_at: nextVersion } });
    const restored = await api.ensureKnowledgeOption('九年级', point.title);
    expect(restored.id).toBe(point.id);
    expect(calls[1].method).toBe('PATCH');
    expect(calls[1].body).toEqual({ archived: false });
    expect(calls[1].url.searchParams.get('updated_at')).toBe('eq.' + point.updated_at);
  });

  it('recovers the winning record when two devices create the same option', async () => {
    replies.push({ body: [] }, { status: 409, body: { code: '23505', message: 'duplicate key' } }, { body: [point] });
    expect((await api.ensureKnowledgeOption('九年级', point.title)).id).toBe(point.id);
    expect(calls.map(call => call.method)).toEqual(['GET', 'POST', 'GET']);
  });

  it('removes only the selectable option, never sends a physical delete, and rejects a stale version', async () => {
    replies.push({ body: { ...point, archived: true, updated_at: nextVersion } });
    expect((await api.deleteKnowledgeOption(point)).archived).toBe(true);
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].body).toEqual({ archived: true });
    expect(calls[0].url.searchParams.get('updated_at')).toBe('eq.' + point.updated_at);
    expect(calls.every(call => !call.url.pathname.includes('student_knowledge') && call.method !== 'DELETE')).toBe(true);
    replies.push({ body: null });
    await expect(api.deleteKnowledgeOption(point)).rejects.toThrow('knowledge_option_conflict');
  });

  it('updates an existing assessment using its selected version rather than creating a duplicate', async () => {
    const assessment: StudentKnowledge = { id: '44444444-4444-4444-8444-444444444441', owner_id: point.owner_id, student_id: '22222222-2222-4222-8222-222222222221', knowledge_point_id: point.id, status: 'weak', note: '原始备注', last_lesson_id: null, updated_at: point.updated_at };
    replies.push({ body: [{ id: point.id, archived: false }] }, { body: { ...assessment, status: 'basic', note: '更新备注' } });
    await api.saveMastery(assessment.student_id, point.id, 'basic', '更新备注', assessment);
    expect(calls[1].method).toBe('PATCH');
    expect(calls[1].url.searchParams.get('updated_at')).toBe('eq.' + assessment.updated_at);
    replies.push({ body: [{ id: point.id, archived: true }] });
    await expect(api.saveMastery(assessment.student_id, point.id, 'basic', '', assessment)).rejects.toThrow('knowledge_option_missing');
    expect(calls).toHaveLength(3);
  });
});
