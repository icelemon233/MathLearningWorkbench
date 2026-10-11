export const STATUS_OPTIONS = [
  { value: 'pending', label: '待评估' },
  { value: 'weak', label: '薄弱' },
  { value: 'basic', label: '基本掌握' },
  { value: 'mastered', label: '已掌握' },
] as const;
export type MasteryStatus = (typeof STATUS_OPTIONS)[number]['value'];
export type Student = { id: string; owner_id: string; name: string; grade: string; start_date: string | null; goal: string; notes: string; archived: boolean; created_at: string; updated_at: string };
export type KnowledgePoint = { id: string; owner_id: string; grade: string; chapter: string; title: string; sort_order: number; archived: boolean; created_at: string; updated_at: string };
export type StudentKnowledge = { id: string; owner_id: string; student_id: string; knowledge_point_id: string; status: MasteryStatus; note: string; last_lesson_id: string | null; updated_at: string };
export type KnowledgeUpdate = { knowledge_point_id: string; status: MasteryStatus; note: string };
export type Lesson = { id: string; owner_id: string; student_id: string; lesson_date: string; content: string; performance: string; problems: string; homework_completion: string; homework: string; next_plan: string; knowledge_updates: KnowledgeUpdate[]; feedback: string; created_at: string; updated_at: string };
export type ReportContent = { state: string; level: string; guidance: string; supplement: string; plan: string };
export type MonthlyReport = { id: string; owner_id: string; student_id: string; period_start: string; period_end: string; title: string; content: ReportContent; snapshot: { student: Student; lessons: Lesson[]; knowledge: Array<StudentKnowledge & { knowledge_point?: KnowledgePoint }> }; created_at: string };
export type AppData = { students: Student[]; knowledgePoints: KnowledgePoint[]; studentKnowledge: StudentKnowledge[]; lessons: Lesson[]; reports: MonthlyReport[] };
export const EMPTY_DATA: AppData = { students: [], knowledgePoints: [], studentKnowledge: [], lessons: [], reports: [] };
export const statusLabel = (value: string) => STATUS_OPTIONS.find((x) => x.value === value)?.label ?? '待评估';
