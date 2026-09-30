-- =====================================================================
-- Migration: 20260930000200_course_languages
-- Workstream C1 (1/3) — a course may support several programming languages;
-- a student's language lives on the ENROLLMENT; an assignment has ONE language.
--
--   * course_languages(course_id, programming_language): the supported set.
--     courses.programming_language stays and means "primary / default language"
--     (kept in the set by a trigger). Adding a language = one row, no schema change.
--   * course_enrollments.programming_language (nullable): the student's language
--     IN THIS COURSE. Composite FK -> course_languages. NULL for non-programming courses.
--   * assignments.programming_language (nullable): fixed per assignment, locked after
--     publishing. Recipients must study that language.
--
-- BACKWARD COMPATIBILITY (hard requirement)
--   * Nothing here touches assignment_questions / hints / solutions / answers, i.e. the
--     historical snapshots of published and closed assignments are never rewritten.
--   * Backfill only sets METADATA, and only where it is unambiguous: courses with a
--     language get one course_languages row; enrollments and assignments of a course
--     with exactly ONE language get that language. Courses without a language
--     (e.g. mathematics) are untouched. assignments.updated_at is not bumped.
--   * A course with a single language behaves exactly as before.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20260930000100') then
    raise exception 'Run 20260930000100_student_auth_hardening.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20260930000200') then
    raise exception 'Migration 20260930000200 already applied.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- course_languages
-- ---------------------------------------------------------------------
create table public.course_languages (
  course_id             uuid not null references public.courses (id) on delete cascade,
  programming_language  text not null check (programming_language in ('java', 'python', 'csharp', 'c', 'cpp', 'javascript')),
  created_at            timestamptz not null default now(),
  primary key (course_id, programming_language)
);

-- Backfill: the existing single language of every course.
insert into public.course_languages (course_id, programming_language)
select id, programming_language from public.courses where programming_language is not null;

-- The primary language is always part of the supported set.
create or replace function private.sync_course_primary_language()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.programming_language is not null then
    insert into public.course_languages (course_id, programming_language)
    values (new.id, new.programming_language)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger courses_sync_primary_language after insert or update of programming_language on public.courses
  for each row execute function private.sync_course_primary_language();

-- ---------------------------------------------------------------------
-- course_enrollments.programming_language
-- ---------------------------------------------------------------------
alter table public.course_enrollments add column programming_language text;
alter table public.course_enrollments
  add constraint course_enrollments_language_fk
  foreign key (course_id, programming_language)
  references public.course_languages (course_id, programming_language);   -- NO ACTION: a language in use cannot be removed

-- Backfill only where unambiguous: the course has exactly one language.
update public.course_enrollments e
set programming_language = (select cl.programming_language from public.course_languages cl where cl.course_id = e.course_id)
where (select count(*) from public.course_languages cl where cl.course_id = e.course_id) = 1;

create or replace function private.check_enrollment_language()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_count   int;
  v_primary text;
  v_draft_mismatch int;
begin
  select count(*) into v_count from public.course_languages where course_id = new.course_id;
  select programming_language into v_primary from public.courses where id = new.course_id;

  if v_count = 0 then
    if new.programming_language is not null then
      raise exception 'Course has no programming languages' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.programming_language is null then
    if v_count = 1 then
      select programming_language into new.programming_language from public.course_languages where course_id = new.course_id;
    elsif v_primary is not null then
      new.programming_language := v_primary;
    else
      raise exception 'language_required' using errcode = '23514';
    end if;
  end if;

  -- Changing the language of an existing enrollment: not while the student is a
  -- recipient of a DRAFT assignment in another language (published/closed ones are history).
  if tg_op = 'UPDATE' and new.programming_language is distinct from old.programming_language then
    select count(*) into v_draft_mismatch
    from public.assignment_students r
    join public.assignments a on a.id = r.assignment_id
    where r.student_id = new.student_id and a.course_id = new.course_id
      and a.status = 'draft' and a.programming_language is distinct from new.programming_language;
    if v_draft_mismatch > 0 then
      raise exception 'language_in_use' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
-- (assignments.programming_language is added below; the function body is only executed later)
alter table public.assignments add column programming_language text;

create trigger course_enrollments_check_language before insert or update of programming_language on public.course_enrollments
  for each row execute function private.check_enrollment_language();

grant update (programming_language) on public.course_enrollments to authenticated;
create policy "enrollments: owner updates language"
  on public.course_enrollments for update to authenticated
  using (private.owns_course(course_id))
  with check (private.owns_course(course_id));

-- ---------------------------------------------------------------------
-- assignments.programming_language
-- ---------------------------------------------------------------------
alter table public.assignments
  add constraint assignments_language_fk
  foreign key (course_id, programming_language)
  references public.course_languages (course_id, programming_language);

-- Backfill METADATA only (no updated_at bump, no snapshot touched).
alter table public.assignments disable trigger assignments_set_updated_at;
update public.assignments a
set programming_language = (select cl.programming_language from public.course_languages cl where cl.course_id = a.course_id)
where (select count(*) from public.course_languages cl where cl.course_id = a.course_id) = 1;
alter table public.assignments enable trigger assignments_set_updated_at;

create or replace function private.check_assignment_language()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_count int; v_primary text;
begin
  if tg_op = 'UPDATE' then
    if new.programming_language is distinct from old.programming_language then
      if old.status <> 'draft' then
        raise exception 'Assignment language is locked after publishing' using errcode = '23514';
      end if;
      if new.programming_language is null then
        select count(*) into v_count from public.course_languages where course_id = new.course_id;
        if v_count > 0 then raise exception 'language_required' using errcode = '23514'; end if;
      end if;
      -- existing recipients must study the new language
      if new.programming_language is not null and exists (
        select 1 from public.assignment_students r
        left join public.course_enrollments e on e.course_id = new.course_id and e.student_id = r.student_id
        where r.assignment_id = new.id and e.programming_language is distinct from new.programming_language
      ) then
        raise exception 'recipient_language_mismatch' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  -- INSERT: default the language when the course has any
  if new.programming_language is null then
    select count(*) into v_count from public.course_languages where course_id = new.course_id;
    select programming_language into v_primary from public.courses where id = new.course_id;
    if v_count = 1 then
      select programming_language into new.programming_language from public.course_languages where course_id = new.course_id;
    elsif v_count > 1 then
      if v_primary is null then raise exception 'language_required' using errcode = '23514'; end if;
      new.programming_language := v_primary;
    end if;
  end if;
  return new;
end;
$$;
create trigger assignments_check_language before insert or update of programming_language on public.assignments
  for each row execute function private.check_assignment_language();

grant insert (programming_language) on public.assignments to authenticated;
grant update (programming_language) on public.assignments to authenticated;

-- A recipient must be enrolled in the course AND study the assignment's language.
create or replace function private.check_assignment_student()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_lang text; v_enrolled boolean; v_student_lang text;
begin
  select a.programming_language, true, e.programming_language
    into v_lang, v_enrolled, v_student_lang
  from public.assignments a
  join public.course_enrollments e on e.course_id = a.course_id and e.student_id = new.student_id
  where a.id = new.assignment_id;
  if v_enrolled is null then
    raise exception 'Student is not enrolled in the assignment''s course';
  end if;
  if v_lang is not null and v_student_lang is distinct from v_lang then
    raise exception 'recipient_language_mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- course_languages: privileges + RLS
-- ---------------------------------------------------------------------
revoke all on public.course_languages from anon, authenticated;
grant select, insert, delete on public.course_languages to authenticated;
alter table public.course_languages enable row level security;

create policy "course_languages: owner reads" on public.course_languages for select to authenticated
  using (private.owns_course(course_id));
create policy "course_languages: enrolled student reads" on public.course_languages for select to authenticated
  using (private.is_enrolled(course_id));
create policy "course_languages: owner adds" on public.course_languages for insert to authenticated
  with check (private.owns_course(course_id));
create policy "course_languages: owner removes" on public.course_languages for delete to authenticated
  using (private.owns_course(course_id));

revoke all on function private.sync_course_primary_language(), private.check_enrollment_language(),
  private.check_assignment_language() from public;

-- ---------------------------------------------------------------------
-- admin_provision_student v2 (service role): same as v1 + optional language
-- ---------------------------------------------------------------------
drop function public.admin_provision_student(uuid, uuid, text, uuid, boolean);
create or replace function public.admin_provision_student(
  p_teacher_id      uuid,
  p_student_id      uuid,
  p_full_name       text,
  p_course_id       uuid,
  p_create_profile  boolean,
  p_language        text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_teacher_id and role = 'teacher') then
    raise exception 'caller is not a teacher' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_student_id) then
    raise exception 'auth user not found' using errcode = 'P0002';
  end if;

  if p_create_profile then
    if exists (select 1 from public.profiles where id = p_student_id) then
      raise exception 'profile already exists' using errcode = '23505';
    end if;
    insert into public.profiles (id, role, full_name)
    values (p_student_id, 'student', left(coalesce(p_full_name, ''), 120));
  end if;

  insert into public.teacher_students (teacher_id, student_id)
  values (p_teacher_id, p_student_id)
  on conflict (teacher_id, student_id) do update set status = 'active';

  if p_course_id is not null then
    if not exists (select 1 from public.courses where id = p_course_id and owner_id = p_teacher_id and not is_archived) then
      raise exception 'course not found' using errcode = 'P0002';
    end if;
    insert into public.course_enrollments (course_id, student_id, programming_language)
    values (p_course_id, p_student_id, nullif(p_language, ''))
    on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true, 'profile_created', p_create_profile);
end;
$$;
revoke all on function public.admin_provision_student(uuid, uuid, text, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_provision_student(uuid, uuid, text, uuid, boolean, text) to service_role;

insert into private.applied_migrations (version, name) values ('20260930000200', 'course_languages');

commit;
