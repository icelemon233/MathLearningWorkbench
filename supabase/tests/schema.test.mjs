// Uses an ephemeral in-memory Postgres instance; never connects to Supabase.
// Install @electric-sql/pglite in the test environment, or set PGLITE_TEST_MODULE
// to its absolute file: URL. Fixtures below are synthetic and are not app seeds.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_TEST_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const owner = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const student = '20000000-0000-4000-8000-000000000001';
const point = '30000000-0000-4000-8000-000000000001';
const lesson1 = '40000000-0000-4000-8000-000000000001';
const lesson2 = '40000000-0000-4000-8000-000000000002';
const lesson3 = '40000000-0000-4000-8000-000000000003';
let assertions = 0;
const check = (value, message) => { assert.ok(value, message); assertions++; };
async function one(sql, params = []) { return (await db.query(sql, params)).rows[0]; }
async function rejectsCode(fn, code, message) {
  await assert.rejects(fn, (error) => error.code === code && (!message || error.message.includes(message)));
  assertions++;
}
async function role(name, id = '') {
  await db.exec(`reset role; set role ${name};`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}
async function saveLesson(lesson, expected = null, versions = {}) {
  return (await one('select to_jsonb(public.save_lesson($1::jsonb,$2::timestamptz,$3::jsonb)) as row', [JSON.stringify(lesson), expected, JSON.stringify(versions)])).row;
}
async function saveReport(content, hash = null, start = '2026-10-01', end = '2026-10-31') {
  return (await one('select to_jsonb(public.save_monthly_report($1::uuid,$2::date,$3::date,$4::jsonb,null,$5::text)) as row',
    [student, start, end, JSON.stringify(content), hash])).row;
}
async function deleteLesson(id, expected) {
  return (await one('select public.delete_lesson($1::uuid,$2::timestamptz) as id', [id, expected])).id;
}
const reportContent = { state: '有课堂观察记录。', level: '依据知识记录整理。', guidance: '复习记录中的薄弱环节。', supplement: '', plan: '下一阶段继续巩固。' };
try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
    $$;
    grant usage on schema auth to authenticated, anon, service_role;
    grant execute on function auth.uid() to authenticated, anon, service_role;
  `);
  await db.exec(await fs.readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  const deletionUpgrade = await fs.readFile(new URL('../lesson-deletion.sql', import.meta.url), 'utf8');
  await db.exec(deletionUpgrade);
  await db.exec(deletionUpgrade); // The reviewed upgrade is safe to reapply.
  await db.query('insert into auth.users(id) values ($1::uuid),($2::uuid)', [owner, other]);
  await db.query('insert into public.app_owner(singleton,owner_id) values(true,$1::uuid)', [owner]);
  check((await one("select count(*)::int as n from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity")).n === 6, 'all public tables have RLS');

  await role('anon');
  await rejectsCode(() => db.query('select * from public.students'), '42501');
  await rejectsCode(() => db.query('select public.consume_ai_quota()'), '42501');
  await rejectsCode(() => deleteLesson(lesson1, '2026-10-01T00:00:00Z'), '42501');
  await rejectsCode(() => db.query('delete from public.lessons'), '42501');
  await role('authenticated', other);
  check((await one('select public.is_app_owner() as ok')).ok === false, 'nonowner is not whitelisted');
  check((await one('select count(*)::int as n from public.students')).n === 0, 'nonowner reads zero data');
  await rejectsCode(() => db.query("insert into public.students(name,grade) values('测试','初中')"), '42501');
  await rejectsCode(() => db.query('insert into public.app_owner(singleton,owner_id) values(true,$1::uuid)', [other]), '42501');
  await rejectsCode(() => saveLesson({ student_id: student, lesson_date: '2026-10-01', content: '记录' }), '42501', 'owner_required');
  await rejectsCode(() => deleteLesson(lesson1, '2026-10-01T00:00:00Z'), '42501', 'owner_required');

  await role('authenticated', owner);
  await db.query("insert into public.students(id,name,grade) values($1::uuid,'测试学生','初中')", [student]);
  await db.query("insert into public.knowledge_points(id,grade,chapter,title) values($1::uuid,'初中','测试章节','测试知识点')", [point]);
  await rejectsCode(() => db.query("insert into public.students(owner_id,name,grade) values($1::uuid,'测试','初中')", [other]), '42501');
  const input = { id: lesson1, student_id: student, lesson_date: '2026-10-01', content: '原课堂内容', knowledge_updates: [{ knowledge_point_id: point, status: 'weak', note: '课堂证据' }] };
  const first = await saveLesson(input, null, { [point]: null });
  let mastery = await one('select * from public.student_knowledge where knowledge_point_id=$1::uuid', [point]);
  check(mastery.status === 'weak' && mastery.last_lesson_id === lesson1, 'lesson and mastery save atomically');
  await rejectsCode(() => saveLesson({ ...input, id: lesson3, knowledge_updates: [{ knowledge_point_id: point, status: 'unknown', note: '' }] }, null, { [point]: mastery.updated_at }), '22023', 'invalid_lesson');
  await rejectsCode(() => saveLesson({ ...input, id: lesson3 }), '22023', 'mastery_version_required');
  const edited = await saveLesson({ ...input, content: '修改课堂内容', knowledge_updates: [] }, first.updated_at);
  check(edited.knowledge_updates.length === 1, 'editing without confirmed updates preserves historic knowledge observations');
  check((await one('select status from public.student_knowledge where knowledge_point_id=$1::uuid', [point])).status === 'weak', 'empty updates do not change current mastery');
  await rejectsCode(() => saveLesson({ ...input, content: '过期内容', knowledge_updates: [] }, first.updated_at), '40001', 'lesson_conflict');
  check((await one('select content from public.lessons where id=$1::uuid', [lesson1])).content === '修改课堂内容', 'stale lesson write rolled back');

  const second = await saveLesson({ ...input, id: lesson2, knowledge_updates: [{ knowledge_point_id: point, status: 'basic', note: '新证据' }] }, null, { [point]: mastery.updated_at });
  check(second.id !== first.id, 'two lessons on the same day remain separate records');
  const staleMasteryVersion = mastery.updated_at;
  mastery = await one('select * from public.student_knowledge where knowledge_point_id=$1::uuid', [point]);
  const oldEditedAfterNewer = await saveLesson({ ...input, content: '修改课堂内容', knowledge_updates: [] }, edited.updated_at);
  await rejectsCode(() => saveLesson({ ...input, content: '旧课试图覆盖新状态' }, oldEditedAfterNewer.updated_at, { [point]: mastery.updated_at }), '40001', 'mastery_conflict');
  check((await one('select content from public.lessons where id=$1::uuid', [lesson1])).content === '修改课堂内容', 'old lesson conflict rolled back all classroom changes');
  await rejectsCode(() => saveLesson({ ...input, id: lesson3 }, null, { [point]: staleMasteryVersion }), '40001', 'mastery_conflict');
  check((await one('select count(*)::int as n from public.lessons where id=$1::uuid', [lesson3])).n === 0, 'mastery conflict does not leave a partial lesson');
  await rejectsCode(() => saveLesson({ ...input, id: lesson3, lesson_date: '2026-09-30' }, null, { [point]: mastery.updated_at }), '40001', 'mastery_conflict');
  await db.query("update public.student_knowledge set status='mastered', last_lesson_id=null where knowledge_point_id=$1::uuid", [point]);
  mastery = await one('select * from public.student_knowledge where knowledge_point_id=$1::uuid', [point]);
  await rejectsCode(() => saveLesson(input, oldEditedAfterNewer.updated_at, { [point]: mastery.updated_at }), '40001', 'mastery_conflict');
  check((await one('select status from public.student_knowledge where knowledge_point_id=$1::uuid', [point])).status === 'mastered', 'old lesson cannot overwrite later manual mastery updates');

  await rejectsCode(() => saveReport(reportContent, null, '2026-11-01', '2026-11-30'), '22023', 'empty_month');
  await rejectsCode(() => saveReport({ state: '缺少字段' }), '22023', 'invalid_report_content');
  const context = (await one('select public.monthly_report_context($1::uuid,$2::date,$3::date) as value', [student, '2026-10-01', '2026-10-31'])).value;
  await db.query("update public.students set goal='更新目标' where id=$1::uuid", [student]);
  await rejectsCode(() => saveReport(reportContent, context.snapshot_hash), '40001', 'report_source_changed');
  check((await one('select count(*)::int as n from public.monthly_reports')).n === 0, 'changed source does not create a misleading report');
  const report = await saveReport(reportContent);
  check(report.snapshot.lessons.length === 2 && report.snapshot.student.goal === '更新目标', 'report snapshot contains actual current facts');
  const retried = await saveReport({ ...reportContent, state: '尝试覆盖' });
  check(retried.id === report.id && retried.content.state === reportContent.state, 'duplicate report request returns the immutable original');
  await db.query("update public.lessons set content='报告后再编辑' where id=$1::uuid", [lesson1]);
  const stored = await one('select snapshot from public.monthly_reports where id=$1::uuid', [report.id]);
  check(stored.snapshot.lessons.find((lesson) => lesson.id === lesson1).content === '修改课堂内容', 'later lesson edits do not mutate report snapshot');
  await rejectsCode(() => db.query("update public.monthly_reports set title='改名' where id=$1::uuid", [report.id]), '42501');
  await rejectsCode(() => db.query('delete from public.monthly_reports where id=$1::uuid', [report.id]), '42501');
  const custom = await saveReport(reportContent, null, '2026-10-01', '2026-10-03');
  check(custom.period_end === '2026-10-03', 'custom report dates are supported');
  await db.query('insert into public.monthly_reports(student_id,period_start,period_end,title,content,snapshot) values($1::uuid,$2::date,$3::date,$4,$5::jsonb,$6::jsonb)',
    [student, '2026-10-01', '2026-10-02', '周期报告', JSON.stringify(reportContent), JSON.stringify({ forged: true })]);
  check(!(await one("select snapshot from public.monthly_reports where period_end='2026-10-02'")).snapshot.forged, 'direct report inserts cannot forge snapshots');

  const secondPoint = '30000000-0000-4000-8000-000000000002';
  const manualPoint = '30000000-0000-4000-8000-000000000003';
  await db.query("insert into public.knowledge_points(id,grade,chapter,title) values($1::uuid,'初中','测试章节','另一知识点'),($2::uuid,'初中','测试章节','手动知识点')", [secondPoint, manualPoint]);
  await db.query("update public.student_knowledge set last_lesson_id=$1::uuid where knowledge_point_id=$2::uuid", [lesson1, point]);
  await db.query("insert into public.student_knowledge(student_id,knowledge_point_id,status,note,last_lesson_id) values($1::uuid,$2::uuid,'basic','较新课堂依据',$3::uuid),($1::uuid,$4::uuid,'weak','独立判断',null)", [student, secondPoint, lesson2, manualPoint]);
  const beforeDeletion = await one('select * from public.lessons where id=$1::uuid', [lesson1]);
  await db.query("update public.lessons set feedback='已保存课堂反馈' where id=$1::uuid", [lesson1]);
  const latest = await one('select * from public.lessons where id=$1::uuid', [lesson1]);
  const masteryBeforeDeletion = await one('select * from public.student_knowledge where knowledge_point_id=$1::uuid', [point]);
  const newerMasteryBeforeDeletion = await one('select * from public.student_knowledge where knowledge_point_id=$1::uuid', [secondPoint]);
  const manualBeforeDeletion = await one('select * from public.student_knowledge where knowledge_point_id=$1::uuid', [manualPoint]);
  const reportsBeforeDeletion = (await db.query('select * from public.monthly_reports order by id')).rows;
  const contextBeforeDeletion = (await one('select public.monthly_report_context($1::uuid,$2::date,$3::date) as value', [student, '2026-10-01', '2026-10-04'])).value;
  await rejectsCode(() => deleteLesson(lesson1, null), '22023', 'invalid_lesson_delete');
  await rejectsCode(() => deleteLesson(lesson1, beforeDeletion.updated_at), '40001', 'lesson_delete_conflict');
  check((await one('select feedback from public.lessons where id=$1::uuid', [lesson1])).feedback === '已保存课堂反馈', 'stale delete preserves lesson and feedback');
  assert.deepEqual(await one('select * from public.student_knowledge where knowledge_point_id=$1::uuid', [point]), masteryBeforeDeletion);
  assertions++;
  await role('authenticated', other);
  check((await db.query('delete from public.lessons where id=$1::uuid returning id', [lesson1])).rows.length === 0, 'nonowner direct deletion sees no rows');
  await rejectsCode(() => deleteLesson(lesson1, latest.updated_at), '42501', 'owner_required');
  await role('authenticated', owner);
  // Cross-owner references remain inaccessible even if the whitelist owner knows the ID.
  const foreignStudent = '20000000-0000-4000-8000-000000000002';
  const foreignLesson = '40000000-0000-4000-8000-000000000004';
  await db.exec('reset role');
  await db.query("insert into public.students(id,owner_id,name,grade) values($1::uuid,$2::uuid,'隔离测试','初中')", [foreignStudent, other]);
  await db.query("insert into public.lessons(id,owner_id,student_id,lesson_date,content) values($1::uuid,$2::uuid,$3::uuid,'2026-10-01','隔离课堂')", [foreignLesson, other, foreignStudent]);
  await role('authenticated', owner);
  await rejectsCode(() => deleteLesson(foreignLesson, latest.updated_at), 'P0002', 'lesson_missing');
  await db.exec('reset role; create function private.reject_delete_for_test() returns trigger language plpgsql as $$ begin raise exception using errcode=\'P0001\',message=\'test_delete_failure\'; end; $$; create trigger reject_delete_for_test before delete on public.lessons for each row execute function private.reject_delete_for_test();');
  await role('authenticated', owner);
  await rejectsCode(() => deleteLesson(lesson1, latest.updated_at), 'P0001', 'test_delete_failure');
  assert.deepEqual(await one('select * from public.student_knowledge where knowledge_point_id=$1::uuid', [point]), masteryBeforeDeletion);
  assertions++;
  check((await one('select feedback from public.lessons where id=$1::uuid', [lesson1])).feedback === '已保存课堂反馈', 'failed deletion rolls back both detachment and lesson deletion');
  await db.exec('reset role; drop trigger reject_delete_for_test on public.lessons; drop function private.reject_delete_for_test();');
  await role('authenticated', owner);
  check(await deleteLesson(lesson1, latest.updated_at) === lesson1, 'owner deletes the confirmed lesson');
  check((await one('select count(*)::int as n from public.lessons where id=$1::uuid', [lesson1])).n === 0, 'deleted lesson and its feedback are removed');
  const masteryAfterDeletion = await one('select * from public.student_knowledge where knowledge_point_id=$1::uuid', [point]);
  check(masteryAfterDeletion.last_lesson_id === null && masteryAfterDeletion.status === masteryBeforeDeletion.status && masteryAfterDeletion.note === masteryBeforeDeletion.note, 'deletion detaches evidence while retaining current mastery and note');
  check(masteryAfterDeletion.updated_at.getTime() > masteryBeforeDeletion.updated_at.getTime(), 'detaching the source advances the mastery version');
  assert.deepEqual(await one('select * from public.student_knowledge where knowledge_point_id=$1::uuid', [secondPoint]), newerMasteryBeforeDeletion);
  assertions++;
  assert.deepEqual(await one('select * from public.student_knowledge where knowledge_point_id=$1::uuid', [manualPoint]), manualBeforeDeletion);
  assertions++;
  assert.deepEqual((await db.query('select * from public.monthly_reports order by id')).rows, reportsBeforeDeletion);
  assertions++;
  await rejectsCode(() => saveReport(reportContent, contextBeforeDeletion.snapshot_hash, '2026-10-01', '2026-10-04'), '40001', 'report_source_changed');
  const newReport = await saveReport(reportContent, null, '2026-10-01', '2026-10-04');
  check(newReport.snapshot.lessons.length === 1 && newReport.snapshot.lessons[0].id === lesson2, 'new reports exclude the deleted lesson');
  await rejectsCode(() => deleteLesson(lesson1, latest.updated_at), 'P0002', 'lesson_missing');
  await rejectsCode(() => saveLesson({ ...latest, content: '不能复活课堂', knowledge_updates: [] }, latest.updated_at), '40001', 'lesson_conflict');
  check((await one('select count(*)::int as n from public.lessons where id=$1::uuid', [lesson1])).n === 0, 'stale edit cannot recreate the deleted lesson');
  await db.query('update public.students set archived=true where id=$1::uuid', [student]);
  check(await deleteLesson(lesson2, second.updated_at) === lesson2, 'lessons of archived students can be deleted');
  check((await one('select last_lesson_id from public.student_knowledge where knowledge_point_id=$1::uuid', [secondPoint])).last_lesson_id === null, 'archived student deletion detaches the source');

  for (let i = 0; i < 12; i++) check((await one('select public.consume_ai_quota() as allowed')).allowed === true, 'quota permits initial requests');
  check((await one('select public.consume_ai_quota() as allowed')).allowed === false, 'persistent quota rejects the thirteenth request');
  await role('authenticated', other);
  check((await one('select count(*)::int as n from public.lessons')).n === 0, 'nonowner cannot read saved lessons');
  check((await one('select count(*)::int as n from public.monthly_reports')).n === 0, 'nonowner cannot read saved reports');
  await rejectsCode(() => db.query('select public.consume_ai_quota()'), '42501', 'owner_required');
  await db.exec('reset role;');
  await rejectsCode(() => db.query("update public.monthly_reports set title='管理员误改' where id=$1::uuid", [report.id]), '55000', 'monthly_report_immutable');
  await rejectsCode(() => db.query('delete from public.monthly_reports where id=$1::uuid', [report.id]), '55000', 'monthly_report_immutable');
  console.log(`SQL/RLS/transaction/snapshot checks passed: ${assertions}`);
} finally { await db.close(); }
