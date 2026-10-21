import type { AppData, MasteryStatus, MonthlyReport } from './types';

export const APP_NAME = '数学学习工作台';
export const normalizeKnowledgeTitle = (value: string) => value.trim().replace(/\s+/g, ' ');

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function monthPeriod(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('请选择有效月份');
  const [year, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${last}` };
}
export const displayDate = (date: string) => date?.slice(0, 10).replaceAll('-', '.') ?? '';
export function validatePeriod(start: string, end: string) {
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!valid(start) || !valid(end) || start > end) throw new Error('请检查报告起止日期');
}
export function masteryCounts(data: AppData, studentId?: string) {
  const counts: Record<MasteryStatus, number> = { pending: 0, weak: 0, basic: 0, mastered: 0 };
  const activeStudents = new Set(data.students.filter(x => !x.archived).map(x => x.id));
  const activePoints = new Set(data.knowledgePoints.filter(x => !x.archived).map(x => x.id));
  data.studentKnowledge.filter(x => activeStudents.has(x.student_id) && activePoints.has(x.knowledge_point_id) && (!studentId || x.student_id === studentId)).forEach(x => counts[x.status]++);
  return counts;
}
export const reportName = (report: MonthlyReport) => report.snapshot.student.name;
export function aiErrorMessage(value: unknown): string {
  const detail = typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
  if (detail?.code === 'invalid_model_output') return 'AI 返回内容格式不符合要求，尚未保存，请重新生成。';
  if (detail?.code === 'incomplete_model_output') return 'AI 输出尚未完成，本次内容未保存，请重新生成。';
  const message = typeof value === 'string' ? value : detail?.message;
  return typeof message === 'string' && message.trim() && !message.includes('\uFFFD')
    ? message.trim()
    : 'AI 服务暂时不可用，请稍后重试。';
}
export const errorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : '操作失败，请稍后重试';
  if (/lesson_delete_network/.test(raw)) return '删除结果暂时无法确认，请检查网络并刷新列表，核对记录是否仍然存在。';
  if (/lesson_delete_conflict/.test(raw)) return '这节课已在其他设备更新，本次未删除。请取消、刷新后重新确认。';
  if (/lesson_missing/.test(raw)) return '这节课已被删除或无法访问。请取消并刷新列表。';
  if (/mastery_conflict/.test(raw)) return '这个知识点已在其他记录中更新。请刷新后核对掌握情况，再保存。';
  if (/knowledge_option_conflict/.test(raw)) return '这个知识点已在其他设备更新，请刷新后重试。';
  if (/knowledge_option_missing/.test(raw)) return '这个知识点已从选项中删除，请重新选择或输入名称恢复。';
  if (/lesson_conflict/.test(raw)) return '这节课已在其他设备更新。请关闭表单、刷新后重新编辑。';
  if (/Failed to fetch|NetworkError|fetch failed/.test(raw)) return '网络连接中断，请检查网络后重试。内容尚未保存。';
  if (/Invalid login credentials/.test(raw)) return '邮箱或密码不正确';
  if (/duplicate key|duplicate_knowledge_point/.test(raw)) return '这条记录已存在，请刷新后查看。';
  if (/invalid_report_period/.test(raw)) return '报告日期无效，起止日期之间最多支持 366 天。';
  if (/empty_month/.test(raw)) return '这个周期没有课堂记录，请先记录课堂或调整日期。';
  if (/report_source_changed/.test(raw)) return '生成期间课堂记录发生了变化，本次报告未保存，请核对后重试。';
  if (/owner_required|row-level security/.test(raw)) return '此账户没有保存记录的权限，请重新登录。';
  if (/rate_limit|too_many_requests/.test(raw)) return '请求较频繁，请稍后重试';
  return /[\u3400-\u9fff]/.test(raw) ? raw : '操作失败，请稍后重试。未保存的内容仍在当前页面。';
};
