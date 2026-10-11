import { createClient } from '@supabase/supabase-js';
import { aiErrorMessage } from './lib';
import type { AppData, KnowledgePoint, KnowledgeUpdate, Lesson, MasteryStatus, ReportContent, Student, StudentKnowledge } from './types';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
function validConfig() {
  if (!url || !key || key.startsWith('sb_secret_')) return false;
  try { return new URL(url).protocol === 'https:' && key.startsWith('sb_publishable_'); } catch { return false; }
}
export const db = validConfig() ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
function requiredDb() { if (!db) throw new Error('工作台尚未完成初始化'); return db; }
function unwrap<T>({ data, error }: { data: T; error: unknown }) { if (error) throw error; return data; }
export async function loadData(): Promise<AppData> {
  const client = requiredDb();
  const requests = await Promise.all([
    client.from('students').select('*').order('created_at', { ascending: false }),
    client.from('knowledge_points').select('*').order('sort_order').order('title'),
    client.from('student_knowledge').select('*'),
    client.from('lessons').select('*').order('lesson_date', { ascending: false }).order('created_at', { ascending: false }),
    client.from('monthly_reports').select('*').order('created_at', { ascending: false }),
  ]);
  const [students, knowledgePoints, studentKnowledge, lessons, reports] = requests.map(unwrap);
  return { students, knowledgePoints, studentKnowledge, lessons, reports } as AppData;
}
export async function saveStudent(input: Partial<Student>) {
  const client = requiredDb();
  return unwrap(await (input.id ? client.from('students').update(input).eq('id', input.id) : client.from('students').insert(input)).select().single()) as Student;
}
export async function saveKnowledgePoint(input: Partial<KnowledgePoint>) {
  const client = requiredDb();
  return unwrap(await (input.id ? client.from('knowledge_points').update(input).eq('id', input.id) : client.from('knowledge_points').insert(input)).select().single()) as KnowledgePoint;
}
export async function saveMastery(studentId: string, pointId: string, status: MasteryStatus, note: string, previous?: StudentKnowledge) {
  const client = requiredDb();
  const payload = { student_id: studentId, knowledge_point_id: pointId, status, note, last_lesson_id: null };
  const result = previous
    ? await client.from('student_knowledge').update(payload).eq('id', previous.id).eq('updated_at', previous.updated_at).select().maybeSingle()
    : await client.from('student_knowledge').insert(payload).select().single();
  if (result.error) throw result.error;
  if (!result.data) throw new Error('mastery_conflict');
  return result.data;
}
export async function assignPoints(studentId: string, points: KnowledgePoint[]) {
  if (!points.length) throw new Error('请先在知识目录中添加这个年级的知识点');
  return unwrap(await requiredDb().from('student_knowledge').upsert(points.map(point => ({ student_id: studentId, knowledge_point_id: point.id, status: 'pending' })), { onConflict: 'student_id,knowledge_point_id', ignoreDuplicates: true }).select());
}
export async function saveLesson(input: Partial<Lesson> & { knowledge_updates: KnowledgeUpdate[] }, versions: Record<string, string | null>) {
  return unwrap(await requiredDb().rpc('save_lesson', { p_lesson: input, p_expected_updated_at: input.updated_at ?? null, p_mastery_versions: versions })) as Lesson;
}
export async function saveFeedback(lesson: Lesson, feedback: string) {
  return saveLesson({ ...lesson, feedback, knowledge_updates: [] }, {});
}
export async function saveMonthlyReport(studentId: string, start: string, end: string, content: ReportContent) {
  return unwrap(await requiredDb().rpc('save_monthly_report', { p_student_id: studentId, p_period_start: start, p_period_end: end, p_content: content }));
}
export async function invokeAI(input: Record<string, unknown>) {
  const { data, error } = await requiredDb().functions.invoke('ai-assistant', { body: input });
  if (error) {
    let body;
    try { body = await error.context?.json(); } catch { /* The gateway may return a non-JSON response. */ }
    if (body?.error) throw new Error(aiErrorMessage(body.error));
    throw new Error('AI 服务暂时不可用，请检查连接或稍后重试。');
  }
  if (data?.error) throw new Error(aiErrorMessage(data.error));
  return data as { feedback?: string; report?: AppData['reports'][number]; insights?: string; suggestions?: string[] };
}
