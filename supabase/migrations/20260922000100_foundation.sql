-- =====================================================================
-- Migration: 20260922000100_foundation
-- Phase 1 — identity, roles, teacher↔student relationship, RLS base.
--
-- Security model (see project doc, "Auth ו-RLS"):
--   * profiles.role is the ONLY source of truth for roles.
--   * New users always start as 'student'. Teacher role is granted by
--     SQL (bootstrap script) — never from client metadata.
--   * RLS is enabled on every table. No USING (true).
--   * Helper functions live in schema "private", which is NOT exposed
--     through the Supabase Data API.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Private schema for helper functions
-- ---------------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. Generic updated_at trigger
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'student'
              check (role in ('teacher', 'student')),
  full_name   text not null default ''
              check (char_length(full_name) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table  public.profiles is 'One row per auth user. role is authoritative and not client-writable.';
comment on column public.profiles.role is 'teacher | student. Changed only via SQL / service role.';

create index profiles_role_idx on public.profiles (role);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Create a profile for every new auth user.
-- role is ALWAYS 'student' here; metadata is used only for the display name.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'student',
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- 3. teacher_students (who teaches whom)
-- ---------------------------------------------------------------------
create table public.teacher_students (
  teacher_id  uuid not null references public.profiles (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (teacher_id, student_id),
  check (teacher_id <> student_id)
);

comment on table public.teacher_students is 'Authorization backbone: a teacher may access a student only through an active row here.';

create index teacher_students_student_idx on public.teacher_students (student_id);

create trigger teacher_students_set_updated_at
  before update on public.teacher_students
  for each row execute function private.set_updated_at();

-- Integrity: teacher_id must be a teacher, student_id must be a student.
create or replace function private.check_teacher_student_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = new.teacher_id and role = 'teacher') then
    raise exception 'teacher_id % is not a teacher', new.teacher_id;
  end if;
  if not exists (select 1 from public.profiles where id = new.student_id and role = 'student') then
    raise exception 'student_id % is not a student', new.student_id;
  end if;
  return new;
end;
$$;

create trigger teacher_students_check_roles
  before insert or update of teacher_id, student_id on public.teacher_students
  for each row execute function private.check_teacher_student_roles();

-- ---------------------------------------------------------------------
-- 4. Authorization helpers (SECURITY DEFINER → no RLS recursion)
-- ---------------------------------------------------------------------
create or replace function private.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'teacher'
  );
$$;

create or replace function private.teaches(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teacher_students
    where teacher_id = (select auth.uid())
      and student_id = p_student_id
      and status = 'active'
  );
$$;

create or replace function private.is_my_teacher(p_teacher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teacher_students
    where student_id = (select auth.uid())
      and teacher_id = p_teacher_id
      and status = 'active'
  );
$$;

revoke all on all functions in schema private from public;
grant execute on function private.is_teacher()        to authenticated;
grant execute on function private.teaches(uuid)       to authenticated;
grant execute on function private.is_my_teacher(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Table privileges (defense in depth, on top of RLS)
--    Supabase grants ALL to anon/authenticated by default — tighten it.
-- ---------------------------------------------------------------------
revoke all on public.profiles         from anon, authenticated;
revoke all on public.teacher_students from anon, authenticated;

-- profiles: read; update ONLY full_name. No insert/delete from clients.
grant select                  on public.profiles to authenticated;
grant update (full_name)      on public.profiles to authenticated;

-- teacher_students: read; teacher may change status only.
-- Inserts happen in the invite-student Edge Function (service role).
grant select                  on public.teacher_students to authenticated;
grant update (status)         on public.teacher_students to authenticated;

-- ---------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.teacher_students enable row level security;

-- profiles ------------------------------------------------------------
create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: teacher reads own students"
  on public.profiles for select to authenticated
  using (private.teaches(id));

create policy "profiles: student reads own teachers"
  on public.profiles for select to authenticated
  using (private.is_my_teacher(id));

create policy "profiles: update own name"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- teacher_students ----------------------------------------------------
create policy "teacher_students: participants read"
  on public.teacher_students for select to authenticated
  using (
    teacher_id = (select auth.uid())
    or student_id = (select auth.uid())
  );

create policy "teacher_students: teacher updates status"
  on public.teacher_students for update to authenticated
  using (teacher_id = (select auth.uid()) and private.is_teacher())
  with check (teacher_id = (select auth.uid()) and private.is_teacher());
