-- =====================================================================
-- Migration: 20261117000200_delete_class
-- Teacher can delete a CLASS. Removes ONLY that class's student assignments
-- (class_students) and its topic study statuses (topic_study_status), then the class.
-- Never touches students, enrollments, subjects (courses) or topics.
-- One SECURITY DEFINER function = one transaction: all-or-nothing.
-- Ownership is re-checked inside. Clients still have no direct DELETE grants.
-- (The FKs stay ON DELETE RESTRICT: this function removes the children explicitly.)
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20261117000100') then
    raise exception 'Run 20261117000100_classes_and_topic_status.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20261117000200') then
    raise exception 'Migration 20261117000200 already applied.';
  end if;
end $$;

create or replace function public.delete_class(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course   uuid;
  v_members  int;
  v_statuses int;
begin
  -- Lock the class row: serialises with concurrent membership/status changes.
  select course_id into v_course from public.classes where id = p_class_id for update;
  if v_course is null or not private.owns_course(v_course) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;

  delete from public.topic_study_status where class_id = p_class_id;
  get diagnostics v_statuses = row_count;
  delete from public.class_students where class_id = p_class_id;
  get diagnostics v_members = row_count;
  delete from public.classes where id = p_class_id;

  return jsonb_build_object('deleted', true, 'members', v_members, 'statuses', v_statuses);
end;
$$;

revoke all on function public.delete_class(uuid) from public, anon;
grant execute on function public.delete_class(uuid) to authenticated;

insert into private.applied_migrations (version, name) values ('20261117000200', 'delete_class');

commit;
