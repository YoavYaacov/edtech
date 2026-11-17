-- =====================================================================
-- Migration: 20261117000100_classes_and_topic_status
-- Student screen (batch 1): study status per (CLASS, topic).
--
-- Findings: no class/group infrastructure existed in public/private.
-- Minimal, permanent foundation (no throw-away structure):
--   classes          a named group inside ONE subject (course), owned by the teacher.
--   class_students   membership. A student is in AT MOST ONE class per subject
--                    (unique course_id+student_id) and must be enrolled in that subject.
--   topic_study_status  (class_id, topic_id) -> 'learning' | 'learned'; no row = 'not_learned'.
-- The same topic can be 'learned' in one class and 'not_learned' in another. No per-student status.
-- Batch 4 (join links, identity verification) will ADD to this model (invite codes, etc.);
-- it does not need to restructure it. A private student can simply be a class of one.
--
-- Access: owner and the class's own students READ. ONLY the owner writes, via RPCs
-- (create_class, set_class_member, set_topic_status). Clients get no direct write grants.
--
-- Deletion policy (project rule: archive, never silently cascade user data):
--   * Every FK into courses / topics / classes is ON DELETE RESTRICT.
--   * The ONE cascade is class_students -> course_enrollments: a class membership is a pure
--     link that cannot outlive the enrollment it depends on (unenroll just removes the link;
--     no independent data is lost — statuses belong to the class, not to the student).
--   * delete_topic / delete_course are redefined (v3) with the SAME bodies as the live v2
--     (verified against pg_get_functiondef) plus ONE extra check each, so the dry run explains
--     the block instead of the real delete failing on the FK:
--       delete_topic  -> 'has_study_status'  (topic has a status in some class)
--       delete_course -> 'has_classes'       (course has classes)
--
-- Prerequisites (checked below, against the ledger AND the real objects):
--   20260923000100_content      (courses, topics, course_enrollments, private.owns_course/is_enrolled/set_updated_at)
--   20260925000200_safe_delete_v2 (delete_topic / delete_course v2, private.topic_subtree)
-- It does NOT depend on 20261003000100 (question_import_core).
-- Not applied to any database by this file's author.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20260923000100') then
    raise exception 'Run 20260923000100_content.sql first.';
  end if;
  if not exists (select 1 from private.applied_migrations where version = '20260925000200') then
    raise exception 'Run 20260925000200_safe_delete_v2.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20261117000100') then
    raise exception 'Migration 20261117000100 already applied.';
  end if;
  if to_regprocedure('private.owns_course(uuid)') is null
     or to_regprocedure('private.is_enrolled(uuid)') is null
     or to_regprocedure('private.set_updated_at()') is null
     or to_regprocedure('private.topic_subtree(uuid)') is null
     or to_regclass('public.course_enrollments') is null then
    raise exception 'Required helper objects are missing.';
  end if;
end $$;

create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete restrict,
  course_id   uuid not null references public.courses (id) on delete restrict,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, course_id)
);
create index classes_course_idx on public.classes (course_id);
create trigger classes_set_updated_at before update on public.classes
  for each row execute function private.set_updated_at();

create table public.class_students (
  class_id    uuid not null,
  course_id   uuid not null,
  student_id  uuid not null,
  created_at  timestamptz not null default now(),
  primary key (class_id, student_id),
  unique (course_id, student_id),   -- one class per subject per student
  foreign key (class_id, course_id) references public.classes (id, course_id) on delete restrict,
  foreign key (course_id, student_id) references public.course_enrollments (course_id, student_id) on delete cascade
);
create index class_students_student_idx on public.class_students (student_id);

create table public.topic_study_status (
  class_id    uuid not null,
  topic_id    uuid not null references public.topics (id) on delete restrict,
  course_id   uuid not null,
  status      text not null check (status in ('learning', 'learned')),
  updated_at  timestamptz not null default now(),
  primary key (class_id, topic_id),
  foreign key (class_id, course_id) references public.classes (id, course_id) on delete restrict
);
create index topic_study_status_course_idx on public.topic_study_status (course_id);

alter table public.classes enable row level security;
alter table public.class_students enable row level security;
alter table public.topic_study_status enable row level security;
revoke all on public.classes, public.class_students, public.topic_study_status from anon, authenticated;
grant select on public.classes, public.class_students, public.topic_study_status to authenticated;

create policy "classes: owner reads" on public.classes for select to authenticated
  using (private.owns_course(course_id));
create policy "classes: member reads" on public.classes for select to authenticated
  using (exists (select 1 from public.class_students cs
                 where cs.class_id = classes.id and cs.student_id = (select auth.uid())));

create policy "class_students: owner reads" on public.class_students for select to authenticated
  using (private.owns_course(course_id));
create policy "class_students: student reads own" on public.class_students for select to authenticated
  using (student_id = (select auth.uid()));

create policy "topic status: owner reads" on public.topic_study_status for select to authenticated
  using (private.owns_course(course_id));
create policy "topic status: class members read" on public.topic_study_status for select to authenticated
  using (exists (select 1 from public.class_students cs
                 where cs.class_id = topic_study_status.class_id and cs.student_id = (select auth.uid())));

-- ---- owner-only write paths (SECURITY DEFINER, ownership always re-checked) ----
create or replace function public.create_class(p_course_id uuid, p_title text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.owns_course(p_course_id) then
    raise exception 'Course not found' using errcode = 'P0002';
  end if;
  insert into public.classes (owner_id, course_id, title)
  values ((select auth.uid()), p_course_id, left(btrim(coalesce(p_title, '')), 120))
  returning id into v_id;
  return v_id;
end $$;

-- p_member = true: put the student in this class (moving them out of any other class of the same subject).
-- p_member = false: remove them from this class. The student must already be enrolled in the subject.
create or replace function public.set_class_member(p_class_id uuid, p_student_id uuid, p_member boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_course uuid;
begin
  select course_id into v_course from public.classes where id = p_class_id;
  if v_course is null or not private.owns_course(v_course) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  if p_member then
    delete from public.class_students where course_id = v_course and student_id = p_student_id;
    insert into public.class_students (class_id, course_id, student_id) values (p_class_id, v_course, p_student_id);
  else
    delete from public.class_students where class_id = p_class_id and student_id = p_student_id;
  end if;
end $$;

create or replace function public.set_topic_status(p_class_id uuid, p_topic_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_class_course uuid; v_topic_course uuid;
begin
  if p_status not in ('not_learned', 'learning', 'learned') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  select course_id into v_class_course from public.classes where id = p_class_id;
  select course_id into v_topic_course from public.topics where id = p_topic_id;
  if v_class_course is null or v_topic_course is distinct from v_class_course
     or not private.owns_course(v_class_course) then
    raise exception 'Class or topic not found' using errcode = 'P0002';
  end if;
  if p_status = 'not_learned' then
    delete from public.topic_study_status where class_id = p_class_id and topic_id = p_topic_id;
  else
    insert into public.topic_study_status (class_id, topic_id, course_id, status)
    values (p_class_id, p_topic_id, v_class_course, p_status)
    on conflict (class_id, topic_id) do update set status = excluded.status, updated_at = now();
  end if;
end $$;


-- ---- delete_topic / delete_course v3: live v2 bodies + one extra check each ----
create or replace function public.delete_topic(p_topic_id uuid, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course    uuid;
  v_ids       uuid[];
  v_topics    int;
  v_questions int;
  v_tags      int;
  v_status    int;
  r           record;
begin
  select course_id into v_course from public.topics where id = p_topic_id;
  if v_course is null or not private.owns_course(v_course) then
    raise exception 'Topic not found' using errcode = 'P0002';
  end if;

  select array_agg(s.id) into v_ids from private.topic_subtree(p_topic_id) s;
  v_topics := cardinality(v_ids);

  -- Lock the subtree: blocks concurrent links (FK checks need KEY SHARE).
  perform 1 from public.topics where id = any (v_ids) for update;

  select count(distinct question_id) into v_questions
  from public.question_topics where topic_id = any (v_ids);

  if v_questions > 0 then
    return jsonb_build_object('deletable', false, 'reason', 'has_questions',
                              'questions', v_questions, 'topics', v_topics);
  end if;

  -- Phase 4: mistake tags linked to a topic in the subtree also block deletion.
  select count(*) into v_tags from public.mistake_tags where topic_id = any (v_ids);
  if v_tags > 0 then
    return jsonb_build_object('deletable', false, 'reason', 'has_mistake_tags',
                              'mistake_tags', v_tags, 'topics', v_topics);
  end if;

  -- Student screen: a study status set for any class also blocks deletion (archive instead).
  select count(*) into v_status from public.topic_study_status where topic_id = any (v_ids);
  if v_status > 0 then
    return jsonb_build_object('deletable', false, 'reason', 'has_study_status',
                              'study_status', v_status, 'topics', v_topics);
  end if;

  if p_dry_run then
    return jsonb_build_object('deletable', true, 'topics', v_topics);
  end if;

  begin
    -- children first (parent_id is ON DELETE RESTRICT)
    for r in select s.id from private.topic_subtree(p_topic_id) s order by s.depth desc loop
      delete from public.topics where id = r.id;
    end loop;
  exception when foreign_key_violation then
    return jsonb_build_object('deletable', false, 'reason', 'in_use', 'topics', v_topics);
  end;

  return jsonb_build_object('deleted', true, 'topics', v_topics);
end;
$$;

create or replace function public.delete_course(p_course_id uuid, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_questions int;
  v_students  int;
  v_topics    int;
  v_tags      int;
  v_classes   int;
  r           record;
begin
  if not private.owns_course(p_course_id) then
    raise exception 'Course not found' using errcode = 'P0002';
  end if;

  -- Lock the course: blocks concurrent enrollments/questions (FK KEY SHARE).
  perform 1 from public.courses where id = p_course_id for update;

  select count(*) into v_questions from public.questions where course_id = p_course_id;
  select count(*) into v_students  from public.course_enrollments where course_id = p_course_id;
  select count(*) into v_topics    from public.topics where course_id = p_course_id;

  if v_questions > 0 or v_students > 0 then
    return jsonb_build_object('deletable', false,
      'reason', case when v_questions > 0 then 'has_questions' else 'has_students' end,
      'questions', v_questions, 'students', v_students, 'topics', v_topics);
  end if;

  -- Phase 4: the course's mistake tags also block deletion.
  select count(*) into v_tags from public.mistake_tags where course_id = p_course_id;
  if v_tags > 0 then
    return jsonb_build_object('deletable', false, 'reason', 'has_mistake_tags',
                              'mistake_tags', v_tags, 'topics', v_topics);
  end if;

  -- Student screen: classes (and therefore their study statuses) also block deletion.
  select count(*) into v_classes from public.classes where course_id = p_course_id;
  if v_classes > 0 then
    return jsonb_build_object('deletable', false, 'reason', 'has_classes',
                              'classes', v_classes, 'topics', v_topics);
  end if;

  if p_dry_run then
    return jsonb_build_object('deletable', true, 'topics', v_topics);
  end if;

  begin
    for r in
      with recursive tree (id, depth) as (
        select t.id, 0 from public.topics t where t.course_id = p_course_id and t.parent_id is null
        union all
        select t.id, tr.depth + 1 from public.topics t join tree tr on t.parent_id = tr.id
        where tr.depth < 10
      )
      select tree.id from tree order by tree.depth desc
    loop
      delete from public.topics where id = r.id;
    end loop;
    delete from public.courses where id = p_course_id;
  exception when foreign_key_violation then
    return jsonb_build_object('deletable', false, 'reason', 'in_use', 'topics', v_topics);
  end;

  return jsonb_build_object('deleted', true, 'topics', v_topics);
end;
$$;

revoke all on function public.create_class(uuid, text), public.set_class_member(uuid, uuid, boolean),
  public.set_topic_status(uuid, uuid, text) from public, anon;
grant execute on function public.create_class(uuid, text), public.set_class_member(uuid, uuid, boolean),
  public.set_topic_status(uuid, uuid, text) to authenticated;
-- create or replace keeps existing privileges; restated for clarity
revoke all on function public.delete_topic(uuid, boolean), public.delete_course(uuid, boolean) from public, anon;
grant execute on function public.delete_topic(uuid, boolean), public.delete_course(uuid, boolean) to authenticated;

insert into private.applied_migrations (version, name) values ('20261117000100', 'classes_and_topic_status');

commit;
