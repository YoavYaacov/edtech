-- =====================================================================
-- Migration: 20260930000100_student_auth_hardening
-- Workstream A — Student / Auth management hardening.
--
--   1. profiles: a teacher keeps READ access to the profile (name) of a student
--      who is ARCHIVED, so past submissions / feedback keep showing the name.
--      (The old policy relied on private.teaches(), which requires status='active'.)
--   2. Guard: a plain "DELETE FROM public.profiles" is blocked. Deleting the AUTH
--      user (FK cascade) still works. This closes the "ghost auth user" hole:
--      profile deleted by hand -> auth.users row stays -> the e-mail is "taken".
--      Deliberate maintenance bypass:  set local app.allow_profile_delete = 'on';
--   3. Service-role-only RPCs used by the invite-student / delete-student Edge
--      Functions:  admin_find_auth_user, admin_provision_student,
--                  admin_student_footprint.
--   4. Teacher RPC my_students_auth_status(): pending / no_password / active per
--      student (no auth data beyond that leaves the database).
--
-- No existing table is altered. No data is changed.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20260929000100') then
    raise exception 'Run 20260929000100_ai_runs.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20260930000100') then
    raise exception 'Migration 20260930000100 already applied.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Teacher keeps reading the profile of ANY linked student (active or archived)
-- ---------------------------------------------------------------------
create or replace function private.has_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teacher_students
    where teacher_id = (select auth.uid()) and student_id = p_student_id
  );
$$;
revoke all on function private.has_student(uuid) from public;
grant execute on function private.has_student(uuid) to authenticated;

drop policy "profiles: teacher reads own students" on public.profiles;
create policy "profiles: teacher reads own students"
  on public.profiles for select to authenticated
  using (private.has_student(id));

-- ---------------------------------------------------------------------
-- 2. Guard against direct profile deletes (ghost auth users)
--    pg_trigger_depth() = 1  -> a plain DELETE statement (only this trigger runs)
--    pg_trigger_depth() >= 2 -> the delete was issued by another trigger, i.e.
--                               the ON DELETE CASCADE from auth.users.
-- ---------------------------------------------------------------------
create or replace function private.guard_profile_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() <= 1
     and coalesce(current_setting('app.allow_profile_delete', true), '') <> 'on' then
    raise exception 'Direct deletes on public.profiles are blocked. Delete the auth user instead (delete-student), or archive the student.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;
revoke all on function private.guard_profile_delete() from public;

create trigger profiles_guard_delete before delete on public.profiles
  for each row execute function private.guard_profile_delete();

-- ---------------------------------------------------------------------
-- 3a. admin_find_auth_user — what state is this e-mail in? (service role only)
--     Returns at most one row; never returns tokens or hashes.
-- ---------------------------------------------------------------------
create or replace function public.admin_find_auth_user(p_email text, p_teacher_id uuid)
returns table (
  user_id             uuid,
  email_confirmed     boolean,
  has_password        boolean,
  last_sign_in_at     timestamptz,
  is_disabled         boolean,
  has_profile         boolean,
  role                text,
  linked_to_caller    boolean,
  linked_to_others    boolean
)
language sql stable security definer set search_path = '' as $$
  select u.id,
         u.email_confirmed_at is not null,
         coalesce(u.encrypted_password, '') <> '',
         u.last_sign_in_at,
         (to_jsonb(u) ->> 'deleted_at') is not null or (to_jsonb(u) ->> 'banned_until') is not null,
         p.id is not null,
         p.role,
         exists (select 1 from public.teacher_students ts where ts.student_id = u.id and ts.teacher_id = p_teacher_id),
         exists (select 1 from public.teacher_students ts where ts.student_id = u.id and ts.teacher_id <> p_teacher_id)
  from auth.users u
  left join public.profiles p on p.id = u.id
  where lower(u.email) = lower(btrim(p_email))
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- 3b. admin_provision_student — ONE transaction:
--     (optional) recreate the missing profile  +  teacher link  +  optional enrollment.
--     Either everything happens or nothing does, so the Edge Function has a
--     single thing to roll back.
-- ---------------------------------------------------------------------
create or replace function public.admin_provision_student(
  p_teacher_id      uuid,
  p_student_id      uuid,
  p_full_name       text,
  p_course_id       uuid,
  p_create_profile  boolean
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
    -- repair path: only for an auth user that has NO profile at all
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
    insert into public.course_enrollments (course_id, student_id)
    values (p_course_id, p_student_id)
    on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true, 'profile_created', p_create_profile);
end;
$$;

-- ---------------------------------------------------------------------
-- 3c. admin_student_footprint — what would a hard delete remove? (service role only)
--     Ownership is checked against p_teacher_id (the service role bypasses RLS).
-- ---------------------------------------------------------------------
create or replace function public.admin_student_footprint(p_teacher_id uuid, p_student_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_name text;
begin
  select role, full_name into v_role, v_name from public.profiles where id = p_student_id;
  if v_role is null then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'role', v_role,
    'linked_to_caller', exists (select 1 from public.teacher_students where teacher_id = p_teacher_id and student_id = p_student_id),
    'other_teachers', (select count(*) from public.teacher_students where student_id = p_student_id and teacher_id <> p_teacher_id),
    'enrollments', (select count(*) from public.course_enrollments where student_id = p_student_id),
    'assignments', (select count(*) from public.assignment_students where student_id = p_student_id),
    'answers', (select count(*) from public.answers where student_id = p_student_id),
    'submissions', (select count(*) from public.answer_submissions s join public.answers a on a.id = s.answer_id where a.student_id = p_student_id),
    'feedback', (select count(*) from public.feedback f join public.answer_submissions s on s.id = f.submission_id
                 join public.answers a on a.id = s.answer_id where a.student_id = p_student_id),
    'notifications', (select count(*) from public.notifications where student_id = p_student_id or recipient_id = p_student_id)
  );
end;
$$;

revoke all on function public.admin_find_auth_user(text, uuid),
  public.admin_provision_student(uuid, uuid, text, uuid, boolean),
  public.admin_student_footprint(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_find_auth_user(text, uuid),
  public.admin_provision_student(uuid, uuid, text, uuid, boolean),
  public.admin_student_footprint(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 4. Teacher: invite status of my own students
--    pending     = invited, never confirmed the e-mail
--    no_password = confirmed, but no password set and never signed in
--    active      = everything else
-- ---------------------------------------------------------------------
create or replace function public.my_students_auth_status()
returns table (student_id uuid, invite_status text)
language sql stable security definer set search_path = '' as $$
  select ts.student_id,
         case
           when u.email_confirmed_at is null then 'pending'
           when coalesce(u.encrypted_password, '') = '' and u.last_sign_in_at is null then 'no_password'
           else 'active'
         end
  from public.teacher_students ts
  join auth.users u on u.id = ts.student_id
  where ts.teacher_id = (select auth.uid())
    and private.is_teacher();
$$;
revoke all on function public.my_students_auth_status() from public, anon;
grant execute on function public.my_students_auth_status() to authenticated;

insert into private.applied_migrations (version, name) values ('20260930000100', 'student_auth_hardening');

commit;
