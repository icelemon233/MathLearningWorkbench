-- Initial schema for a dedicated, empty project. Apply once in the SQL editor.
-- This is a reviewed bootstrap script, not a generated migration.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
grant usage on schema public to authenticated, service_role;

create table public.app_owner (
  singleton boolean primary key default true check (singleton),
  owner_id uuid not null unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.app_owner enable row level security;
create policy owner_read_self on public.app_owner for select to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.app_owner from public, anon, authenticated;
grant select on public.app_owner to authenticated;
grant select, insert, update, delete on public.app_owner to service_role;

create function public.is_app_owner() returns boolean
language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.app_owner where owner_id = (select auth.uid())
  );
$$;
revoke all on function public.is_app_owner() from public, anon;
grant execute on function public.is_app_owner() to authenticated;

create function private.require_owner() returns uuid
language plpgsql stable security invoker set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_app_owner() then
    raise exception using errcode = '42501', message = 'owner_required';
  end if;
  return v_uid;
end;
$$;

create function private.valid_knowledge_updates(p_value jsonb) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select case when jsonb_typeof(p_value) is distinct from 'array' then false
    when jsonb_array_length(p_value) > 200 then false
    else not exists (
      select 1 from jsonb_array_elements(p_value) item where
        jsonb_typeof(item) is distinct from 'object'
        or coalesce(item->>'knowledge_point_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        or coalesce(item->>'status', '') not in ('pending', 'weak', 'basic', 'mastered')
        or jsonb_typeof(item->'note') is distinct from 'string'
        or char_length(item->>'note') > 4000
    ) end;
$$;

create function private.valid_report_content(p_value jsonb) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select coalesce(jsonb_typeof(p_value) = 'object', false)
    and coalesce((select bool_and(coalesce(jsonb_typeof(p_value->k) = 'string'
      and char_length(p_value->>k) <= 24000
      and (k = 'supplement' or char_length(btrim(p_value->>k)) > 0), false))
      from unnest(array['state','level','guidance','supplement','plan']) k), false);
$$;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  grade text not null check (char_length(btrim(grade)) between 1 and 40),
  start_date date,
  goal text not null default '' check (char_length(goal) <= 4000),
  notes text not null default '' check (char_length(notes) <= 8000),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.knowledge_points (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  grade text not null check (char_length(btrim(grade)) between 1 and 40),
  chapter text not null check (char_length(btrim(chapter)) between 1 and 120),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  sort_order integer not null default 0 check (sort_order >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, grade, chapter, title)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  student_id uuid not null,
  lesson_date date not null,
  content text not null check (char_length(btrim(content)) between 1 and 12000),
  performance text not null default '' check (char_length(performance) <= 8000),
  problems text not null default '' check (char_length(problems) <= 8000),
  homework_completion text not null default '' check (char_length(homework_completion) <= 8000),
  homework text not null default '' check (char_length(homework) <= 8000),
  next_plan text not null default '' check (char_length(next_plan) <= 8000),
  knowledge_updates jsonb not null default '[]'::jsonb check (private.valid_knowledge_updates(knowledge_updates)),
  feedback text not null default '' check (char_length(feedback) <= 24000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, student_id, owner_id),
  foreign key (student_id, owner_id) references public.students(id, owner_id) on delete restrict
);

create table public.student_knowledge (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  student_id uuid not null,
  knowledge_point_id uuid not null,
  status text not null default 'pending' check (status in ('pending','weak','basic','mastered')),
  note text not null default '' check (char_length(note) <= 4000),
  last_lesson_id uuid,
  updated_at timestamptz not null default now(),
  unique (student_id, knowledge_point_id),
  foreign key (student_id, owner_id) references public.students(id, owner_id) on delete restrict,
  foreign key (knowledge_point_id, owner_id) references public.knowledge_points(id, owner_id) on delete restrict,
  foreign key (last_lesson_id, student_id, owner_id) references public.lessons(id, student_id, owner_id) on delete restrict
);

create table public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  student_id uuid not null,
  period_start date not null,
  period_end date not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content jsonb not null check (private.valid_report_content(content)),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (student_id, period_start, period_end),
  foreign key (student_id, owner_id) references public.students(id, owner_id) on delete restrict,
  check (period_start <= period_end),
  check (period_end - period_start <= 365)
);

create index students_owner_idx on public.students(owner_id, archived);
create index knowledge_points_owner_order_idx on public.knowledge_points(owner_id, grade, chapter, sort_order);
create index lessons_owner_student_date_idx on public.lessons(owner_id, student_id, lesson_date, created_at);
create index student_knowledge_owner_student_idx on public.student_knowledge(owner_id, student_id);
create index student_knowledge_point_owner_idx on public.student_knowledge(knowledge_point_id, owner_id);
create index student_knowledge_lesson_idx on public.student_knowledge(last_lesson_id, student_id, owner_id);
create index monthly_reports_owner_period_idx on public.monthly_reports(owner_id, period_start);
-- Cover the composite student foreign keys in their declared column order.
create index lessons_student_owner_idx on public.lessons(student_id, owner_id);
create index monthly_reports_student_owner_idx on public.monthly_reports(student_id, owner_id);
create index student_knowledge_student_owner_idx on public.student_knowledge(student_id, owner_id);

-- Every exposed data table has both an owner whitelist check and a row owner check.
do $$
declare t text;
begin
  foreach t in array array['students','knowledge_points','lessons','student_knowledge','monthly_reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy read_owner on public.%I for select to authenticated using (owner_id = (select auth.uid()) and (select public.is_app_owner()))', t);
    execute format('create policy insert_owner on public.%I for insert to authenticated with check (owner_id = (select auth.uid()) and (select public.is_app_owner()))', t);
    if t <> 'monthly_reports' then
      execute format('create policy update_owner on public.%I for update to authenticated using (owner_id = (select auth.uid()) and (select public.is_app_owner())) with check (owner_id = (select auth.uid()) and (select public.is_app_owner()))', t);
    end if;
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert on public.%I to authenticated', t);
    if t <> 'monthly_reports' then
      execute format('grant update on public.%I to authenticated', t);
    end if;
    if t = 'monthly_reports' then
      execute format('grant select, insert on public.%I to service_role', t);
    else
      execute format('grant select, insert, update, delete on public.%I to service_role', t);
    end if;
  end loop;
end;
$$;

create function private.touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  if tg_table_name <> 'student_knowledge' then new.created_at := old.created_at; end if;
  return new;
end;
$$;
create trigger students_touch before update on public.students for each row execute function private.touch_updated_at();
create trigger knowledge_points_touch before update on public.knowledge_points for each row execute function private.touch_updated_at();
create trigger lessons_touch before update on public.lessons for each row execute function private.touch_updated_at();
create trigger student_knowledge_touch before update on public.student_knowledge for each row execute function private.touch_updated_at();

create function public.save_lesson(
  p_lesson jsonb,
  p_expected_updated_at timestamptz default null,
  p_mastery_versions jsonb default '{}'::jsonb
) returns public.lessons
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := private.require_owner();
  v_id uuid := coalesce(nullif(p_lesson->>'id','')::uuid, gen_random_uuid());
  v_student uuid := (p_lesson->>'student_id')::uuid;
  v_date date := (p_lesson->>'lesson_date')::date;
  v_updates jsonb := coalesce(p_lesson->'knowledge_updates', '[]'::jsonb);
  v_history jsonb;
  v_previous public.lessons%rowtype;
  v_result public.lessons%rowtype;
  v_existing public.student_knowledge%rowtype;
  v_change record;
  v_edit boolean;
  v_has_mastery boolean;
  v_expected timestamptz;
  v_last_date date;
begin
  if jsonb_typeof(p_lesson) is distinct from 'object' or v_student is null or v_date is null
    or not private.valid_knowledge_updates(v_updates)
    or jsonb_typeof(p_mastery_versions) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'invalid_lesson';
  end if;
  if not exists (select 1 from public.students where id = v_student and owner_id = v_uid and not archived) then
    raise exception using errcode = '22023', message = 'student_missing';
  end if;
  if exists (select 1 from jsonb_to_recordset(v_updates) as x(knowledge_point_id uuid) group by knowledge_point_id having count(*) > 1) then
    raise exception using errcode = '22023', message = 'duplicate_knowledge_point';
  end if;
  -- Serialize lesson transactions for a student; point rows are locked in ID order.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_student::text, 0));
  select * into v_previous from public.lessons where id = v_id and owner_id = v_uid for update;
  v_edit := found;
  if v_edit then
    if p_expected_updated_at is null or v_previous.updated_at <> p_expected_updated_at then
      raise exception using errcode = '40001', message = 'lesson_conflict';
    end if;
    if v_previous.student_id <> v_student then
      raise exception using errcode = '22023', message = 'lesson_student_immutable';
    end if;
  elsif p_expected_updated_at is not null then
    raise exception using errcode = '40001', message = 'lesson_conflict';
  end if;
  for v_change in select * from jsonb_to_recordset(v_updates)
    as x(knowledge_point_id uuid, status text, note text) order by knowledge_point_id loop
    if not (p_mastery_versions ? v_change.knowledge_point_id::text) then
      raise exception using errcode = '22023', message = 'mastery_version_required';
    end if;
    if not exists (select 1 from public.knowledge_points where id = v_change.knowledge_point_id and owner_id = v_uid and not archived) then
      raise exception using errcode = '22023', message = 'knowledge_point_missing';
    end if;
    v_expected := (p_mastery_versions->>v_change.knowledge_point_id::text)::timestamptz;
    select * into v_existing from public.student_knowledge
      where student_id = v_student and knowledge_point_id = v_change.knowledge_point_id and owner_id = v_uid for update;
    v_has_mastery := found;
    if (v_has_mastery and v_existing.updated_at is distinct from v_expected)
      or (not v_has_mastery and v_expected is not null) then
      raise exception using errcode = '40001', message = 'mastery_conflict';
    end if;
    if v_has_mastery then
      select lesson_date into v_last_date from public.lessons where id = v_existing.last_lesson_id;
      -- Compare to the original lesson creation time, not its editable timestamp:
      -- merely editing an old lesson's text must not make it the newest evidence.
      if (v_edit and v_existing.last_lesson_id is distinct from v_id and v_existing.updated_at > v_previous.created_at)
        or (v_last_date is not null and v_last_date > v_date) then
        raise exception using errcode = '40001', message = 'mastery_conflict';
      end if;
    end if;
  end loop;
  if v_edit then
    select coalesce(jsonb_agg(item order by item->>'knowledge_point_id'), '[]'::jsonb) into v_history
      from (
        select item from jsonb_array_elements(v_previous.knowledge_updates) item
          where not exists (select 1 from jsonb_array_elements(v_updates) change where change->>'knowledge_point_id' = item->>'knowledge_point_id')
        union all select item from jsonb_array_elements(v_updates) item
      ) merged;
    update public.lessons set lesson_date = v_date, content = p_lesson->>'content',
      performance = coalesce(p_lesson->>'performance',''), problems = coalesce(p_lesson->>'problems',''),
      homework_completion = coalesce(p_lesson->>'homework_completion',''), homework = coalesce(p_lesson->>'homework',''),
      next_plan = coalesce(p_lesson->>'next_plan',''), knowledge_updates = v_history,
      feedback = coalesce(p_lesson->>'feedback', v_previous.feedback)
      where id = v_id and owner_id = v_uid returning * into v_result;
  else
    insert into public.lessons(id, owner_id, student_id, lesson_date, content, performance, problems,
      homework_completion, homework, next_plan, knowledge_updates, feedback)
      values(v_id, v_uid, v_student, v_date, p_lesson->>'content', coalesce(p_lesson->>'performance',''),
        coalesce(p_lesson->>'problems',''), coalesce(p_lesson->>'homework_completion',''),
        coalesce(p_lesson->>'homework',''), coalesce(p_lesson->>'next_plan',''), v_updates, coalesce(p_lesson->>'feedback',''))
      returning * into v_result;
  end if;
  for v_change in select * from jsonb_to_recordset(v_updates)
    as x(knowledge_point_id uuid, status text, note text) order by knowledge_point_id loop
    v_expected := (p_mastery_versions->>v_change.knowledge_point_id::text)::timestamptz;
    if v_expected is null then
      insert into public.student_knowledge(owner_id, student_id, knowledge_point_id, status, note, last_lesson_id)
        values(v_uid, v_student, v_change.knowledge_point_id, v_change.status, v_change.note, v_id)
        on conflict (student_id, knowledge_point_id) do nothing;
      if not found then raise exception using errcode = '40001', message = 'mastery_conflict'; end if;
    else
      update public.student_knowledge set status = v_change.status, note = v_change.note, last_lesson_id = v_id
        where owner_id = v_uid and student_id = v_student and knowledge_point_id = v_change.knowledge_point_id and updated_at = v_expected;
      if not found then raise exception using errcode = '40001', message = 'mastery_conflict'; end if;
    end if;
  end loop;
  return v_result;
end;
$$;

create function private.build_monthly_snapshot(p_student_id uuid, p_period_start date, p_period_end date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_uid uuid := private.require_owner(); v_snapshot jsonb;
begin
  if p_period_start is null or p_period_end is null
    or p_period_start > p_period_end or p_period_end - p_period_start > 365 then
    raise exception using errcode = '22023', message = 'invalid_report_period';
  end if;
  -- A single SQL statement provides one consistent snapshot of all three sources.
  select jsonb_build_object(
    'student', to_jsonb(s),
    'lessons', coalesce((select jsonb_agg(to_jsonb(l) order by l.lesson_date, l.created_at, l.id)
      from public.lessons l where l.owner_id = v_uid and l.student_id = s.id
        and l.lesson_date between p_period_start and p_period_end), '[]'::jsonb),
    'knowledge', coalesce((select jsonb_agg(to_jsonb(sk) || jsonb_build_object('knowledge_point', to_jsonb(kp)) order by kp.grade, kp.chapter, kp.sort_order, kp.id)
      from public.student_knowledge sk join public.knowledge_points kp on kp.id = sk.knowledge_point_id and kp.owner_id = sk.owner_id
      where sk.owner_id = v_uid and sk.student_id = s.id), '[]'::jsonb)
  ) into v_snapshot from public.students s where s.id = p_student_id and s.owner_id = v_uid;
  if v_snapshot is null then raise exception using errcode = '22023', message = 'student_missing'; end if;
  if jsonb_array_length(v_snapshot->'lessons') = 0 then
    raise exception using errcode = '22023', message = 'empty_month';
  end if;
  return v_snapshot;
end;
$$;

create function public.monthly_report_context(p_student_id uuid, p_period_start date, p_period_end date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_snapshot jsonb := private.build_monthly_snapshot(p_student_id, p_period_start, p_period_end);
begin return jsonb_build_object('snapshot', v_snapshot, 'snapshot_hash', md5(v_snapshot::text)); end;
$$;

create function private.prepare_monthly_report() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_uid uuid := private.require_owner(); v_snapshot jsonb; v_expected text;
begin
  if new.owner_id <> v_uid then raise exception using errcode = '42501', message = 'owner_required'; end if;
  v_expected := new.snapshot->>'_expected_hash';
  v_snapshot := private.build_monthly_snapshot(new.student_id, new.period_start, new.period_end);
  if v_expected is not null and v_expected <> md5(v_snapshot::text) then
    raise exception using errcode = '40001', message = 'report_source_changed';
  end if;
  new.snapshot := v_snapshot;
  new.created_at := clock_timestamp();
  return new;
end;
$$;
create trigger monthly_reports_prepare before insert on public.monthly_reports
  for each row execute function private.prepare_monthly_report();

create function private.reject_report_change() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin raise exception using errcode = '55000', message = 'monthly_report_immutable'; end;
$$;
create trigger monthly_reports_immutable before update or delete on public.monthly_reports
  for each row execute function private.reject_report_change();

create function public.save_monthly_report(
  p_student_id uuid, p_period_start date, p_period_end date, p_content jsonb,
  p_title text default null, p_expected_snapshot_hash text default null
) returns public.monthly_reports
language plpgsql security invoker set search_path = '' as $$
declare v_uid uuid := private.require_owner(); v_report public.monthly_reports%rowtype;
begin
  -- Retrying a completed request returns the original immutable report.
  select * into v_report from public.monthly_reports
    where owner_id = v_uid and student_id = p_student_id and period_start = p_period_start and period_end = p_period_end;
  if found then return v_report; end if;
  if not coalesce(private.valid_report_content(p_content), false) then
    raise exception using errcode = '22023', message = 'invalid_report_content';
  end if;
  insert into public.monthly_reports(owner_id, student_id, period_start, period_end, title, content, snapshot)
    values(v_uid, p_student_id, p_period_start, p_period_end,
      coalesce(nullif(btrim(p_title),''),
        case when p_period_start = date_trunc('month', p_period_start)::date
          and p_period_end = (p_period_start + interval '1 month' - interval '1 day')::date
          then to_char(p_period_start, 'YYYY年MM月') || '学习力报告'
          else to_char(p_period_start, 'YYYY-MM-DD') || '至' || to_char(p_period_end, 'YYYY-MM-DD') || '学习力报告' end),
      p_content, jsonb_build_object('_expected_hash', p_expected_snapshot_hash))
    on conflict (student_id, period_start, period_end) do nothing returning * into v_report;
  if not found then
    select * into v_report from public.monthly_reports
      where owner_id = v_uid and student_id = p_student_id and period_start = p_period_start and period_end = p_period_end;
  end if;
  return v_report;
end;
$$;

-- A persistent quota works across Edge Function isolates. It stores no prompts.
create table private.ai_usage (
  owner_id uuid primary key references auth.users(id) on delete restrict,
  minute_start timestamptz not null,
  minute_count integer not null,
  day_start timestamptz not null,
  day_count integer not null
);
alter table private.ai_usage enable row level security;
revoke all on private.ai_usage from public, anon, authenticated;
grant select, insert, update, delete on private.ai_usage to service_role;

-- The only definer function is private, has no caller-controlled identity/time,
-- and checks auth.uid() against the admin-managed singleton whitelist.
create function private.consume_ai_quota() returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_now timestamptz := clock_timestamp(); v_usage private.ai_usage%rowtype;
begin
  if v_uid is null or not exists (select 1 from public.app_owner where owner_id = v_uid) then
    raise exception using errcode = '42501', message = 'owner_required';
  end if;
  insert into private.ai_usage(owner_id, minute_start, minute_count, day_start, day_count)
    values(v_uid, date_trunc('minute', v_now), 1, date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC', 1)
    on conflict (owner_id) do update set
      minute_start = excluded.minute_start,
      minute_count = case when private.ai_usage.minute_start = excluded.minute_start then private.ai_usage.minute_count + 1 else 1 end,
      day_start = excluded.day_start,
      day_count = case when private.ai_usage.day_start = excluded.day_start then private.ai_usage.day_count + 1 else 1 end
    returning * into v_usage;
  return v_usage.minute_count <= 12 and v_usage.day_count <= 120;
end;
$$;
create function public.consume_ai_quota() returns boolean
language sql volatile security invoker set search_path = '' as $$ select private.consume_ai_quota(); $$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.require_owner(), private.valid_knowledge_updates(jsonb),
  private.valid_report_content(jsonb), private.build_monthly_snapshot(uuid,date,date),
  private.consume_ai_quota() to authenticated;
revoke all on function public.save_lesson(jsonb,timestamptz,jsonb), public.monthly_report_context(uuid,date,date),
  public.save_monthly_report(uuid,date,date,jsonb,text,text), public.consume_ai_quota() from public, anon;
grant execute on function public.save_lesson(jsonb,timestamptz,jsonb), public.monthly_report_context(uuid,date,date),
  public.save_monthly_report(uuid,date,date,jsonb,text,text), public.consume_ai_quota() to authenticated;

-- Only our business tables are published. Do not alter the realtime schema.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['students','knowledge_points','lessons','student_knowledge','monthly_reports'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
commit;

-- The administrator creates the one Auth user first, then runs separately:
-- insert into public.app_owner(singleton, owner_id) values (true, '<AUTH_USER_UUID>');
-- Never put a real user ID, email, password, model key, or student data in this file.
