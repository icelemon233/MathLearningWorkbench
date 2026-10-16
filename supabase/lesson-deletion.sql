-- Reviewed additive upgrade for an existing workbench; also run after schema.sql
-- when creating a new project. This script does not delete any existing data.
begin;

drop policy if exists delete_owner on public.lessons;
create policy delete_owner on public.lessons for delete to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_app_owner()));
grant delete on public.lessons to authenticated;

create or replace function public.delete_lesson(
  p_lesson_id uuid,
  p_expected_updated_at timestamptz
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := private.require_owner();
  v_student uuid;
  v_lesson public.lessons%rowtype;
begin
  if p_lesson_id is null or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'invalid_lesson_delete';
  end if;
  select student_id into v_student from public.lessons
    where id = p_lesson_id and owner_id = v_uid;
  if not found then
    raise exception using errcode = 'P0002', message = 'lesson_missing';
  end if;
  -- Match save_lesson's lock order to serialize changes for the same student.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_student::text, 0));
  select * into v_lesson from public.lessons
    where id = p_lesson_id and owner_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'lesson_missing';
  end if;
  if v_lesson.updated_at <> p_expected_updated_at then
    raise exception using errcode = '40001', message = 'lesson_delete_conflict';
  end if;
  -- Keep the teacher's current assessment; only detach its deleted source.
  -- Later lessons and manual assessments are unaffected.
  update public.student_knowledge set last_lesson_id = null
    where owner_id = v_uid and student_id = v_student and last_lesson_id = p_lesson_id;
  delete from public.lessons where id = p_lesson_id and owner_id = v_uid;
  if not found then
    raise exception using errcode = 'P0002', message = 'lesson_missing';
  end if;
  return p_lesson_id;
end;
$$;
revoke all on function public.delete_lesson(uuid,timestamptz) from public, anon;
grant execute on function public.delete_lesson(uuid,timestamptz) to authenticated;

commit;
