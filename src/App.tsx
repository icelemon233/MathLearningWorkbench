import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import {
  App as AntdApp, Alert, Avatar, Badge, Breadcrumb, Button, Card, Descriptions, Divider, Drawer,
  Form, Grid, Input, Layout, Menu, Skeleton, Space, Spin, Tag, Tooltip, Typography,
} from 'antd';
import {
  ApartmentOutlined, BulbOutlined, CalculatorOutlined, CalendarOutlined, CopyOutlined, DashboardOutlined,
  DeleteOutlined, DownloadOutlined, FileTextOutlined, LockOutlined, LoginOutlined, LogoutOutlined, MenuOutlined,
  PrinterOutlined, ReadOutlined, ReloadOutlined, SafetyCertificateOutlined, TeamOutlined, UserOutlined,
} from '@ant-design/icons';
import { assignPoints, db, deleteLesson, invokeAI, saveFeedback, saveKnowledgePoint, saveLesson, saveMastery, saveMonthlyReport, saveStudent } from './api';
import { Dialog } from './components';
import { displayDate, errorMessage, today } from './lib';
import { exportReportDocx, printReport } from './export-report';
import { useWorkspace } from './use-workspace';
import { ThemeButton } from './theme';
import type { KnowledgePoint, Lesson, MonthlyReport, Student, StudentKnowledge } from './types';

const { Header, Sider, Content, Footer } = Layout;
const { Title, Text, Paragraph } = Typography;
const Dashboard = lazy(() => import('./views').then(module => ({ default: module.Dashboard })));
const KnowledgeView = lazy(() => import('./views').then(module => ({ default: module.KnowledgeView })));
const LessonsView = lazy(() => import('./views').then(module => ({ default: module.LessonsView })));
const ReportsView = lazy(() => import('./views').then(module => ({ default: module.ReportsView })));
const StudentsView = lazy(() => import('./views').then(module => ({ default: module.StudentsView })));
const KnowledgeForm = lazy(() => import('./forms').then(module => ({ default: module.KnowledgeForm })));
const LessonForm = lazy(() => import('./forms').then(module => ({ default: module.LessonForm })));
const MasteryForm = lazy(() => import('./forms').then(module => ({ default: module.MasteryForm })));
const ReportForm = lazy(() => import('./forms').then(module => ({ default: module.ReportForm })));
const StudentForm = lazy(() => import('./forms').then(module => ({ default: module.StudentForm })));
type View = 'dashboard' | 'students' | 'lessons' | 'knowledge' | 'reports';
type Modal = { type: 'student'; student?: Student } | { type: 'knowledge'; point?: KnowledgePoint }
  | { type: 'lesson'; lesson?: Lesson } | { type: 'lesson-delete'; lesson: Lesson } | { type: 'mastery'; current?: StudentKnowledge }
  | { type: 'feedback'; lesson: Lesson } | { type: 'report' } | { type: 'report-view'; report: MonthlyReport }
  | { type: 'insights'; name: string; content: string; suggestions: string[] };
type Run = (action: () => Promise<unknown>, message?: string, refresh?: boolean) => Promise<boolean>;
const NAV = [
  { id: 'dashboard', label: '工作台', icon: <DashboardOutlined /> },
  { id: 'students', label: '学生档案', icon: <TeamOutlined /> },
  { id: 'lessons', label: '课堂记录', icon: <ReadOutlined /> },
  { id: 'knowledge', label: '知识目录', icon: <ApartmentOutlined /> },
  { id: 'reports', label: '月度报告', icon: <FileTextOutlined /> },
] as const;

export default function App() {
  const workspace = useWorkspace();
  const { data } = workspace;
  const { message: messageApi } = AntdApp.useApp();
  const screens = Grid.useBreakpoint();
  const [view, setView] = useState<View>('dashboard');
  const [selectedId, setSelectedId] = useState('');
  const [studentCategory, setStudentCategory] = useState<'active' | 'archived'>('active');
  const [modal, setModal] = useState<Modal | null>(null);
  const [busy, setBusy] = useState(false);
  const operationPending = useRef(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [modalError, setModalError] = useState('');
  const studentScope = view === 'students' ? data.students.filter(student => student.archived === (studentCategory === 'archived')) : data.students;
  const currentStudent = studentScope.find(student => student.id === selectedId)
    ?? (view === 'students' ? studentScope[0] : data.students.find(student => !student.archived));
  const close = useCallback(() => { setModal(null); setModalError(''); }, []);
  const open = (next: Modal) => { setModalError(''); setModal(next); };
  const notify = (content: string, error = false) => {
    void messageApi.open({ key: 'workspace-operation', type: error ? 'error' : 'success', content, duration: error ? 8 : 4 });
  };
  const run: Run = async (action, message = '已保存', refresh = true) => {
    if (operationPending.current) return false;
    operationPending.current = true;
    setBusy(true); setModalError('');
    try {
      await action();
      if (refresh) {
        try { await workspace.refresh(); }
        catch { notify('操作已完成，但刷新暂时失败，请稍后刷新查看。', true); return true; }
      }
      notify(message);
      return true;
    } catch (error) {
      const message = errorMessage(error);
      setModalError(message); notify(message, true);
      return false;
    } finally { operationPending.current = false; setBusy(false); }
  };
  const addStudent = () => open({ type: 'student' });
  const addLesson = () => open({ type: 'lesson' });
  const newReport = () => open({ type: 'report' });
  const openStudent = (id: string) => { setSelectedId(id); setStudentCategory(data.students.find(student => student.id === id)?.archived ? 'archived' : 'active'); setView('students'); };
  const openFeedback = (lesson: Lesson) => { setSelectedId(lesson.student_id); open({ type: 'feedback', lesson }); };
  const navigate = (key: string) => { setView(key as View); setMobileNav(false); };
  const menu = <Menu mode="inline" selectedKeys={[view]} onClick={({ key }) => navigate(key)} items={NAV.map(item => ({
    key: item.id, icon: item.icon, disabled: busy,
    label: item.id === 'students'
      ? <span className="menu-label">{item.label}<Badge count={data.students.filter(student => !student.archived).length} showZero color="#91a4ba" /></span>
      : item.label,
  }))} />;
  const sidebarFooter = <div className="sidebar-footer">
    <Space size={6}><SafetyCertificateOutlined /><Text type="secondary">私人工作空间</Text></Space>
    <Button block type="text" icon={<LogoutOutlined />} disabled={busy} onClick={() => { close(); void workspace.signOut(); }}>退出登录</Button>
  </div>;

  if (!workspace.authReady) return <div className="loading-page"><Spin size="large" /><Text type="secondary">正在打开工作台…</Text></div>;
  if (!workspace.authorized) return <Login sessionExists={!!workspace.session} error={workspace.error} signOut={workspace.signOut} />;

  const modalTitle = modal?.type === 'student' ? modal.student ? '编辑学生档案' : '添加学生'
    : modal?.type === 'knowledge' ? modal.point ? '编辑知识点' : '添加知识点'
      : modal?.type === 'lesson' ? modal.lesson ? '编辑课堂记录' : '记录一节课'
        : modal?.type === 'lesson-delete' ? '删除课堂记录'
        : modal?.type === 'mastery' ? '记录掌握情况' : modal?.type === 'feedback' ? '课后反馈'
          : modal?.type === 'report' ? '生成学习力报告' : modal?.type === 'insights' ? modal.name + '的学情建议' : '学习力报告';

  return <Layout className="app-layout">
    {screens.lg && <Sider width={224} theme="light" className="app-sider">
      <Brand onClick={() => navigate('dashboard')} />
      <Text type="secondary" className="menu-caption">教学管理</Text>
      {menu}{sidebarFooter}
    </Sider>}
    <Drawer title={<Space><CalculatorOutlined />MathLearningWorkbench</Space>} placement="left" size={256}
      open={mobileNav && !screens.lg} onClose={() => setMobileNav(false)} footer={sidebarFooter}
      styles={{ body: { padding: '12px 8px' } }}>
      {menu}
    </Drawer>
    <Layout className="main-layout">
      <Header className="app-header">
        <Space size="middle">
          {!screens.lg && <Button type="text" icon={<MenuOutlined />} aria-label="打开菜单" onClick={() => setMobileNav(true)} />}
          <Breadcrumb items={[{ title: '我的工作空间' }, { title: NAV.find(item => item.id === view)?.label }]} />
        </Space>
        <Space size="middle" className="header-actions">
          <Tooltip title="获取云端最新记录">
            <Button type="text" size="small" loading={workspace.sync === 'loading'} disabled={busy}
              icon={<ReloadOutlined />} onClick={() => { void run(workspace.refresh, '已获取最新记录', false); }}>
              <span className="sync-label"><Badge status={workspace.sync === 'online' ? 'success' : workspace.sync === 'loading' ? 'processing' : 'error'} />
                {workspace.sync === 'online' ? '云端已同步' : workspace.sync === 'loading' ? '正在同步' : '同步中断'}</span>
            </Button>
          </Tooltip>
          <Text type="secondary" className="header-date"><CalendarOutlined /> {displayDate(today())}</Text>
          <ThemeButton />
        </Space>
      </Header>
      <Content className="app-content">
        {workspace.error && <Alert type="error" showIcon title={workspace.error} className="workspace-alert"
          action={<Button size="small" disabled={busy} onClick={() => { void run(workspace.refresh, '已刷新', false); }}>重试</Button>} />}
        <Suspense fallback={<Card><Skeleton active /></Card>}>
        {view === 'dashboard' && <Dashboard data={data} openStudent={openStudent} addStudent={addStudent} addLesson={addLesson} openLesson={openFeedback} newReport={newReport} />}
        {view === 'students' && <StudentsView data={data} selectedId={currentStudent?.id ?? ''} selectStudent={setSelectedId}
          category={studentCategory} changeCategory={setStudentCategory}
          addStudent={addStudent} editStudent={student => open({ type: 'student', student })} addLesson={addLesson}
          mastery={current => open({ type: 'mastery', current })} busy={busy}
          assign={() => { if (currentStudent) void run(() => assignPoints(currentStudent.id, data.knowledgePoints.filter(point => !point.archived && point.grade === currentStudent.grade)), '已关联年级目录，已有掌握记录保持原值'); }}
          insights={() => { if (currentStudent) void run(async () => {
            const result = await invokeAI({ action: 'student_insights', student_id: currentStudent.id });
            open({ type: 'insights', name: currentStudent.name, content: result.insights ?? '', suggestions: result.suggestions ?? [] });
          }, 'AI 建议已生成', false); }}
          archive={student => { void run(() => saveStudent({ id: student.id, archived: !student.archived }), student.archived ? '已恢复学生' : '已归档，历史记录保留'); }} />}
        {view === 'lessons' && <LessonsView data={data} add={addLesson} open={openFeedback} busy={busy}
          remove={lesson => open({ type: 'lesson-delete', lesson })}
          edit={lesson => { setSelectedId(lesson.student_id); open({ type: 'lesson', lesson }); }} />}
        {view === 'knowledge' && <KnowledgeView data={data} add={() => open({ type: 'knowledge' })} edit={point => open({ type: 'knowledge', point })}
          archive={point => { void run(() => saveKnowledgePoint({ id: point.id, archived: !point.archived }), point.archived ? '已恢复知识点' : '知识点已归档，原记录保留'); }} />}
        {view === 'reports' && <ReportsView data={data} add={newReport} open={report => open({ type: 'report-view', report })} />}
        </Suspense>
      </Content>
      <Footer className="app-footer"><Text type="secondary">MathLearningWorkbench · 记录事实，明确下一步</Text></Footer>
    </Layout>
    {modal && <Dialog key={modal.type} title={modalTitle} subtitle={modal.type === 'lesson' ? '先记下事实，再整理反馈。' : undefined}
      close={busy ? () => {} : close} busy={busy} wide={['lesson', 'report', 'report-view'].includes(modal.type)}>
      <Suspense fallback={<Skeleton active />}>
      {modal.type === 'student' && <StudentForm student={modal.student} busy={busy} save={value => {
        void run(async () => { const saved = await saveStudent(value); setSelectedId(saved.id); setStudentCategory(saved.archived ? 'archived' : 'active'); setView('students'); }).then(ok => { if (ok) close(); });
      }} />}
      {modal.type === 'knowledge' && <KnowledgeForm point={modal.point} busy={busy} save={value => { void run(() => saveKnowledgePoint(value)).then(ok => { if (ok) close(); }); }} />}
      {modal.type === 'mastery' && currentStudent && <MasteryForm student={currentStudent}
        points={data.knowledgePoints.filter(point => modal.current ? point.id === modal.current.knowledge_point_id : !point.archived && !data.studentKnowledge.some(item => item.student_id === currentStudent.id && item.knowledge_point_id === point.id))}
        current={modal.current} busy={busy} save={(id, status, note) => { const baseline = modal.current; void run(() => saveMastery(currentStudent.id, id, status, note, baseline)).then(ok => { if (ok) close(); }); }} />}
      {modal.type === 'lesson' && <LessonForm data={data} studentId={currentStudent?.id} lesson={modal.lesson} busy={busy} save={(value, versions) => {
        void run(async () => { const saved = await saveLesson(value, versions); setSelectedId(saved.student_id); setView('lessons'); }).then(ok => { if (ok) close(); });
      }} />}
      {modal.type === 'lesson-delete' && <div className="page-stack">
        <Alert type="warning" showIcon title="删除后无法恢复" description="本节课的课堂记录和已保存的课后反馈将一并删除。" />
        <Descriptions size="small" column={1} items={[
          { key: 'student', label: '学生', children: data.students.find(student => student.id === modal.lesson.student_id)?.name ?? '学生记录' },
          { key: 'date', label: '课堂日期', children: displayDate(modal.lesson.lesson_date) },
          { key: 'content', label: '课堂内容', children: <Paragraph ellipsis={{ rows: 3, tooltip: modal.lesson.content }} style={{ margin: 0 }}>{modal.lesson.content}</Paragraph> },
        ]} />
        <Text type="secondary">学生当前掌握情况保持不变；已生成月报仍保留原内容。删除后的新月报不再统计这节课。</Text>
        <div className="form-footer">
          <Button disabled={busy} onClick={close}>取消</Button>
          <Button type="primary" danger icon={<DeleteOutlined />} loading={busy} onClick={() => {
            void run(() => deleteLesson(modal.lesson), '课堂记录已删除').then(ok => { if (ok) close(); });
          }}>确认删除</Button>
        </div>
      </div>}
      {modal.type === 'feedback' && <FeedbackEditor lesson={data.lessons.find(lesson => lesson.id === modal.lesson.id) ?? modal.lesson}
        studentName={data.students.find(student => student.id === modal.lesson.student_id)?.name ?? ''} busy={busy} run={run} />}
      {modal.type === 'report' && <ReportForm data={data} studentId={currentStudent?.id} busy={busy} error={modalError}
        save={(id, start, end, content, context) => { void run(async () => {
          const report = content ? await saveMonthlyReport(id, start, end, content)
            : (await invokeAI({ action: 'monthly_report', student_id: id, period_start: start, period_end: end, context })).report;
          if (!report) throw new Error('没有收到完整报告，请稍后重试');
          open({ type: 'report-view', report }); setView('reports');
        }, '月报已固定保存'); }} />}
      {modal.type === 'report-view' && <ReportPreview report={modal.report} busy={busy} run={run} />}
      {modal.type === 'insights' && <div className="page-stack">
        <Alert type="info" showIcon icon={<BulbOutlined />} title="根据已保存的课堂记录整理" />
        <Paragraph className="prewrap">{modal.content}</Paragraph>
        {modal.suggestions.length > 0 && <Card size="small" title="下一步建议"><ul className="insight-list">{modal.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}</ul></Card>}
        <Text type="secondary">建议供你判断，掌握情况由你手动确认。</Text>
      </div>}
      {modalError && !['report', 'report-view', 'insights'].includes(modal.type) && <Alert type="error" title={modalError} showIcon className="dialog-error" />}
      </Suspense>
    </Dialog>}
  </Layout>;
}

function Brand({ onClick }: { onClick: () => void }) {
  return <Button type="text" className="brand" onClick={onClick} icon={<CalculatorOutlined />}>MathLearningWorkbench</Button>;
}

function FeedbackEditor({ lesson, studentName, busy, run }: { lesson: Lesson; studentName: string; busy: boolean; run: Run }) {
  const [feedback, setFeedback] = useState(lesson.feedback);
  const [baseline, setBaseline] = useState(lesson);
  return <div className="page-stack">
    <Card size="small" className="feedback-summary">
      <Descriptions size="small" column={2} items={[
        { key: 'student', label: '学生', children: studentName },
        { key: 'date', label: '日期', children: displayDate(lesson.lesson_date) },
        { key: 'content', label: '本节课内容', span: 2, children: <span className="prewrap">{lesson.content}</span> },
        ...(lesson.problems ? [{ key: 'problems', label: '暴露问题', span: 2, children: <span className="prewrap">{lesson.problems}</span> }] : []),
      ]} />
    </Card>
    <div className="feedback-toolbar">
      <Text type="secondary">润色草稿，或根据课堂记录整理，核对后再保存或复制</Text>
      <Button icon={<BulbOutlined />} loading={busy} onClick={() => { void run(async () => {
        const result = await invokeAI({ action: 'lesson_feedback', lesson_id: lesson.id, draft: feedback.trim() });
        if (!result.feedback) throw new Error('没有收到反馈内容');
        setFeedback(result.feedback); setBaseline(lesson);
      }, '反馈已润色，请核对后保存', false); }}>AI 润色</Button>
    </div>
    <Form layout="vertical"><Form.Item label="课后反馈" style={{ marginBottom: 0 }}>
      <Input.TextArea aria-label="课后反馈" value={feedback} onChange={event => setFeedback(event.target.value)}
        rows={14} maxLength={12000} disabled={busy} placeholder="直接写反馈后点击 AI 润色；留空时，AI 会根据课堂记录整理。" />
    </Form.Item></Form>
    <div className="form-footer">
      <Button icon={<CopyOutlined />} disabled={!feedback.trim() || busy} onClick={() => { void run(() => navigator.clipboard.writeText(feedback), '反馈已复制', false); }}>复制文字</Button>
      <Button type="primary" loading={busy} disabled={!feedback.trim()} onClick={() => { void run(async () => {
        const saved = await saveFeedback(baseline, feedback.trim()); setBaseline(saved);
      }, '课后反馈已保存'); }}>保存反馈</Button>
    </div>
  </div>;
}

function ReportPreview({ report, busy, run }: { report: MonthlyReport; busy: boolean; run: Run }) {
  return <div className="page-stack">
    <Card className="report-preview">
      <Space orientation="vertical" size={8} className="full-width">
        <Tag className="accent-tag">数学 · 月度学习总结</Tag>
        <Title level={2}>{report.title}</Title>
        <Descriptions size="small" column={2} items={[
          { key: 'name', label: '学生', children: report.snapshot.student.name },
          { key: 'grade', label: '年级', children: report.snapshot.student.grade },
          { key: 'period', label: '报告周期', span: 2, children: displayDate(report.period_start) + ' — ' + displayDate(report.period_end) },
        ]} />
      </Space>
      {([['state', '近期学习状态'], ['level', '当前学习水平'], ['guidance', '辅导方向及预期'], ['supplement', '补充事项'], ['plan', '后续教学计划']] as const).map(([key, label]) =>
        report.content[key]?.trim() && <section key={key}><Divider /><Title level={4}>{label}</Title><Paragraph className="prewrap">{report.content[key]}</Paragraph></section>)}
      <Divider /><Text type="secondary">依据 {report.snapshot.lessons.length} 次课堂记录整理 · 生成于 {displayDate(report.created_at)}</Text>
    </Card>
    <div className="report-export-bar">
      <Tag icon={<LockOutlined />}>已固定保存</Tag>
      <Space wrap>
        <Button icon={<DownloadOutlined />} disabled={busy} onClick={() => { void run(() => exportReportDocx(report), 'Word 已导出', false); }}>导出 Word</Button>
        <Button type="primary" icon={<PrinterOutlined />} loading={busy} onClick={() => { void run(() => printReport(report), '请在打印窗口选择保存为 PDF', false); }}>打印 / 保存 PDF</Button>
      </Space>
    </div>
  </div>;
}

function Login({ sessionExists, error, signOut }: { sessionExists: boolean; error: string; signOut: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async ({ email, password }: { email: string; password: string }) => {
    if (!db || busy) return;
    setBusy(true); setMessage('');
    try {
      const result = await db.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <Layout className="login-page">
    <div className="login-theme"><ThemeButton /></div>
    <div className="login-brand"><CalculatorOutlined /><Text strong>MathLearningWorkbench</Text></div>
    <Card className="login-card">
      <Space orientation="vertical" size={8} className="full-width login-heading">
        <Avatar size={52} icon={<LockOutlined />} className="accent-avatar" />
        <Title level={3}>{sessionExists ? error ? '无法进入工作台' : '正在验证访问权限' : '登录工作台'}</Title>
        <Text type="secondary">{sessionExists ? '仅已获授权的账户可以访问教学记录。' : '记录课堂，梳理掌握情况，整理学习报告。'}</Text>
      </Space>
      {sessionExists ? <div className="page-stack">
        {!error && <Spin />}
        {error && <Alert type="error" title={error} showIcon />}
        <Button type="primary" block icon={<ReloadOutlined />} onClick={() => window.location.reload()}>重新连接</Button>
        <Button block onClick={() => { void signOut(); }}>退出并更换账户</Button>
      </div> : <Form layout="vertical" requiredMark={false} onFinish={submit} disabled={!db || busy}>
        <Form.Item name="email" label="邮箱" rules={[{ required: true, message: '请输入登录邮箱' }, { type: 'email', message: '请输入有效邮箱' }]}>
          <Input type="email" autoComplete="username" placeholder="你的登录邮箱" prefix={<UserOutlined />} size="large" />
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password autoComplete="current-password" placeholder="输入密码" prefix={<LockOutlined />} size="large" />
        </Form.Item>
        {(message || error) && <Alert type="error" title={message || error} showIcon className="login-error" />}
        {!db && <Alert type="info" title="工作台尚未完成初始化" description="完成账户连接与部署配置后，即可登录使用。" className="login-error" />}
        <Button type="primary" htmlType="submit" block size="large" icon={<LoginOutlined />} loading={busy} disabled={!db}>登录工作台</Button>
      </Form>}
      <Divider /><Space className="login-private"><SafetyCertificateOutlined /><Text type="secondary">私人使用 · 不开放注册</Text></Space>
    </Card>
    <Text type="secondary" className="login-footer">记录事实，明确下一步。</Text>
  </Layout>;
}
