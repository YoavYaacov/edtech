-- =====================================================================
-- Migration: 20260923000100_content
-- Phase 2 — courses, enrollments, topic tree (unit → topic → subtopic).
-- Nothing here is specific to any course, subject or student.
-- Archive instead of delete: clients get no DELETE on courses/topics.
-- =====================================================================
begin;

do $$
begin
  if to_regclass('private.applied_migrations') is null then
    raise exception 'Run 20260923000000_migration_ledger.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20260923000100') then
    raise exception 'Migration 20260923000100 already applied.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------
create table public.courses (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.profiles (id) on delete restrict,
  title                 text not null check (char_length(btrim(title)) between 1 and 200),
  code                  text not null default '' check (char_length(code) <= 40),
  description           text not null default '' check (char_length(description) <= 4000),
  programming_language  text check (programming_language in ('java', 'python', 'csharp', 'c', 'cpp', 'javascript')),
  is_archived           boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index courses_owner_idx on public.courses (owner_id);
create trigger courses_set_updated_at before update on public.courses
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- course_enrollments
-- ---------------------------------------------------------------------
create table public.course_enrollments (
  course_id   uuid not null references public.courses (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (course_id, student_id)
);
create index course_enrollments_student_idx on public.course_enrollments (student_id);

create or replace function private.check_enrollment_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = new.student_id and role = 'student') then
    raise exception 'student_id % is not a student', new.student_id;
  end if;
  return new;
end;
$$;
create trigger course_enrollments_check_role before insert on public.course_enrollments
  for each row execute function private.check_enrollment_role();

-- ---------------------------------------------------------------------
-- topics (adjacency-list tree, max depth 3)
-- ---------------------------------------------------------------------
create table public.topics (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses (id) on delete cascade,
  parent_id    uuid references public.topics (id) on delete restrict,
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  description  text not null default '' check (char_length(description) <= 4000),
  position     integer not null default 0,
  is_archived  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index topics_course_parent_idx on public.topics (course_id, parent_id, position);
create index topics_parent_idx on public.topics (parent_id);
create trigger topics_set_updated_at before update on public.topics
  for each row execute function private.set_updated_at();

-- Tree integrity: same course as parent, no cycles, depth <= 3,
-- course never changes after creation.
create or replace function private.check_topic_tree()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_parent_course uuid;
  v_parent_level  int := 0;
  v_cycle         boolean := false;
  v_subtree       int := 0;
begin
  if tg_op = 'UPDATE' and new.course_id <> old.course_id then
    raise exception 'A topic cannot move to another course';
  end if;

  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'A topic cannot be its own parent';
    end if;
    select course_id into v_parent_course from public.topics where id = new.parent_id;
    if v_parent_course is null then
      raise exception 'Parent topic not found';
    end if;
    if v_parent_course <> new.course_id then
      raise exception 'Parent topic belongs to another course';
    end if;

    with recursive anc (id, parent_id, lvl) as (
      select id, parent_id, 1 from public.topics where id = new.parent_id
      union all
      select t.id, t.parent_id, a.lvl + 1
      from public.topics t join anc a on t.id = a.parent_id
      where a.lvl < 50
    )
    select max(lvl), coalesce(bool_or(id = new.id), false)
      into v_parent_level, v_cycle
    from anc;

    if v_cycle then
      raise exception 'Moving this topic would create a cycle';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    with recursive sub (id, h) as (
      select id, 1 from public.topics where parent_id = new.id
      union all
      select t.id, s.h + 1 from public.topics t join sub s on t.parent_id = s.id
      where s.h < 50
    )
    select coalesce(max(h), 0) into v_subtree from sub;
  end if;

  if v_parent_level + 1 + v_subtree > 3 then
    raise exception 'Topic tree depth is limited to 3 levels';
  end if;
  return new;
end;
$$;
create trigger topics_check_tree before insert or update of parent_id, course_id on public.topics
  for each row execute function private.check_topic_tree();

-- ---------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------
create or replace function private.owns_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.courses
    where id = p_course_id and owner_id = (select auth.uid())
  );
$$;

create or replace function private.is_enrolled(p_course_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.course_enrollments
    where course_id = p_course_id and student_id = (select auth.uid())
  );
$$;

revoke all on function private.owns_course(uuid), private.is_enrolled(uuid),
  private.check_enrollment_role(), private.check_topic_tree() from public;
grant execute on function private.owns_course(uuid) to authenticated;
grant execute on function private.is_enrolled(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- privileges
-- ---------------------------------------------------------------------
revoke all on public.courses, public.course_enrollments, public.topics from anon, authenticated;

grant select on public.courses to authenticated;
grant insert (owner_id, title, code, description, programming_language) on public.courses to authenticated;
grant update (title, code, description, programming_language, is_archived) on public.courses to authenticated;

grant select, insert, delete on public.course_enrollments to authenticated;

grant select on public.topics to authenticated;
grant insert (course_id, parent_id, title, description, position) on public.topics to authenticated;
grant update (parent_id, title, description, position, is_archived) on public.topics to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.courses            enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.topics             enable row level security;

create policy "courses: owner reads"
  on public.courses for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "courses: enrolled student reads active"
  on public.courses for select to authenticated
  using (not is_archived and private.is_enrolled(id));
create policy "courses: teacher creates own"
  on public.courses for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.is_teacher());
create policy "courses: owner updates"
  on public.courses for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "enrollments: student reads own"
  on public.course_enrollments for select to authenticated
  using (student_id = (select auth.uid()));
create policy "enrollments: course owner reads"
  on public.course_enrollments for select to authenticated
  using (private.owns_course(course_id));
create policy "enrollments: owner enrolls own students"
  on public.course_enrollments for insert to authenticated
  with check (private.owns_course(course_id) and private.teaches(student_id));
create policy "enrollments: owner removes"
  on public.course_enrollments for delete to authenticated
  using (private.owns_course(course_id));

create policy "topics: course owner reads"
  on public.topics for select to authenticated
  using (private.owns_course(course_id));
create policy "topics: enrolled student reads active"
  on public.topics for select to authenticated
  using (not is_archived and private.is_enrolled(course_id));
create policy "topics: course owner creates"
  on public.topics for insert to authenticated
  with check (private.owns_course(course_id));
create policy "topics: course owner updates"
  on public.topics for update to authenticated
  using (private.owns_course(course_id))
  with check (private.owns_course(course_id));

insert into private.applied_migrations (version, name) values ('20260923000100', 'content');

commit;
