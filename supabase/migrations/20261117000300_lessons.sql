-- =====================================================================
-- Migration: 20261117000300_lessons
-- Lessons engine (batch 2): interactive lesson packages, topic links, publishing,
-- versions and restore. NO AI. Lessons are lectures only (spec §6).
--
-- Model
--   lessons          one row per lesson; lesson_key is the STABLE id from the package
--                    metadata (unique per owner). published_version_id = what students see.
--   lesson_versions  immutable revisions (version_no 1,2,3...). Upload = new draft version.
--                    Publishing a version = students get that version. Restoring an old
--                    version COPIES it into a NEW version and publishes it (history is kept).
--   lesson_bundles   the sanitised, self-contained HTML of a version (kept apart so lists stay light).
--   lesson_topics    which topics a lesson covers (any level, several). Coverage is EXACTLY
--                    the linked topics: it is never expanded to descendants.
--   lesson_early_access  teacher-initiated early exposure of a lesson to ONE class.
--
-- Availability to a student (private.lesson_available): the lesson is published, not archived,
-- the student is in a class of the lesson's subject, AND (early access for that class OR one
-- linked topic is open in that class). A topic is "open" when its status anchor is
-- 'learning'/'learned' in the class; anchor = the topic itself if it is a main topic (level 2),
-- its parent if it is a sub-topic (level 3), any child main topic if it is a unit (level 1).
-- This is AVAILABILITY only; it does not change what the lesson is said to cover.
--
-- Deletion policy: nothing is deleted by clients; every FK is RESTRICT; lessons are archived.
-- delete_topic / delete_course are redefined (v4 = live v3 bodies + one has_lessons check each);
-- delete_class (v2) additionally removes that class's early-access rows.
-- Not applied to any database by this file's author.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20261117000200') then
    raise exception 'Run 20261117000200_delete_class.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20261117000300') then
    raise exception 'Migration 20261117000300 already applied.';
  end if;
end $$;

create table public.lessons (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.profiles (id) on delete restrict,
  course_id             uuid not null references public.courses (id) on delete restrict,
  lesson_key            text not null check (char_length(lesson_key) between 3 and 80 and lesson_key = btrim(lesson_key)),
  title                 text not null check (char_length(btrim(title)) between 1 and 200),
  published_version_id  uuid,
  is_archived           boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (owner_id, lesson_key)
);
create index lessons_course_idx on public.lessons (course_id);
create trigger lessons_set_updated_at before update on public.lessons
  for each row execute function private.set_updated_at();

create table public.lesson_versions (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid not null references public.lessons (id) on delete restrict,
  version_no    integer not null check (version_no >= 1),
  content_hash  text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  title         text not null check (char_length(btrim(title)) between 1 and 200),
  meta          jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object' and octet_length(meta::text) <= 20000),
  size_bytes    integer not null check (size_bytes between 1 and 6291456),
  origin        text not null default 'upload' check (origin in ('upload', 'restore')),
  restored_from uuid references public.lesson_versions (id) on delete restrict,
  created_at    timestamptz not null default now(),
  published_at  timestamptz,
  unique (lesson_id, version_no)
);
create index lesson_versions_lesson_idx on public.lesson_versions (lesson_id);

alter table public.lessons
  add constraint lessons_published_version_fk
  foreign key (published_version_id) references public.lesson_versions (id) on delete restrict;

create table public.lesson_bundles (
  version_id  uuid primary key references public.lesson_versions (id) on delete restrict,
  html        text not null check (octet_length(html) <= 6291456 and left(html, 15) = '<!DOCTYPE html>')
);

create table public.lesson_topics (
  lesson_id   uuid not null references public.lessons (id) on delete restrict,
  topic_id    uuid not null references public.topics (id) on delete restrict,
  created_at  timestamptz not null default now(),
  primary key (lesson_id, topic_id)
);
create index lesson_topics_topic_idx on public.lesson_topics (topic_id);

create table public.lesson_early_access (
  lesson_id   uuid not null references public.lessons (id) on delete restrict,
  class_id    uuid not null references public.classes (id) on delete restrict,
  created_at  timestamptz not null default now(),
  primary key (lesson_id, class_id)
);
create index lesson_early_access_class_idx on public.lesson_early_access (class_id);

-- ---- availability helpers (SECURITY DEFINER so policies never recurse) ----
create or replace function private.topic_anchor_open(p_topic_id uuid, p_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from (
      -- level 2 (main topic): itself
      select t.id from public.topics t
      where t.id = p_topic_id and t.parent_id is not null
        and exists (select 1 from public.topics p where p.id = t.parent_id and p.parent_id is null)
      union all
      -- level 3 (sub-topic): its parent main topic
      select t.parent_id from public.topics t
      where t.id = p_topic_id and t.parent_id is not null
        and exists (select 1 from public.topics p where p.id = t.parent_id and p.parent_id is not null)
      union all
      -- level 1 (unit): any of its main topics
      select c.id from public.topics t join public.topics c on c.parent_id = t.id
      where t.id = p_topic_id and t.parent_id is null and not c.is_archived
    ) a
    join public.topic_study_status s on s.topic_id = a.id and s.class_id = p_class_id
    where s.status in ('learning', 'learned')
  );
$$;

create or replace function private.lesson_available(p_lesson_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.lessons l
    join public.class_students cs on cs.course_id = l.course_id and cs.student_id = (select auth.uid())
    where l.id = p_lesson_id and l.published_version_id is not null and not l.is_archived
      and (
        exists (select 1 from public.lesson_early_access ea where ea.lesson_id = l.id and ea.class_id = cs.class_id)
        or exists (
          select 1 from public.lesson_topics lt
          join public.topics t on t.id = lt.topic_id and not t.is_archived
          where lt.lesson_id = l.id and private.topic_anchor_open(lt.topic_id, cs.class_id)
        )
      )
  );
$$;

create or replace function private.owns_lesson(p_lesson_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lessons l
                 where l.id = p_lesson_id and l.owner_id = (select auth.uid()) and private.owns_course(l.course_id));
$$;

create or replace function private.version_visible_to_student(p_version_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lessons l
                 where l.published_version_id = p_version_id and private.lesson_available(l.id));
$$;

create or replace function private.owns_version(p_version_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lesson_versions v where v.id = p_version_id and private.owns_lesson(v.lesson_id));
$$;

-- ---- RLS: read only; every write goes through the RPCs below ----
alter table public.lessons enable row level security;
alter table public.lesson_versions enable row level security;
alter table public.lesson_bundles enable row level security;
alter table public.lesson_topics enable row level security;
alter table public.lesson_early_access enable row level security;
revoke all on public.lessons, public.lesson_versions, public.lesson_bundles, public.lesson_topics, public.lesson_early_access
  from anon, authenticated;
grant select on public.lessons, public.lesson_versions, public.lesson_bundles, public.lesson_topics, public.lesson_early_access
  to authenticated;

create policy "lessons: owner reads" on public.lessons for select to authenticated
  using (private.owns_lesson(id));
create policy "lessons: available to class students" on public.lessons for select to authenticated
  using (private.lesson_available(id));

create policy "lesson_versions: owner reads" on public.lesson_versions for select to authenticated
  using (private.owns_lesson(lesson_id));
create policy "lesson_versions: published, to class students" on public.lesson_versions for select to authenticated
  using (private.version_visible_to_student(id));

create policy "lesson_bundles: owner reads" on public.lesson_bundles for select to authenticated
  using (private.owns_version(version_id));
create policy "lesson_bundles: published, to class students" on public.lesson_bundles for select to authenticated
  using (private.version_visible_to_student(version_id));

create policy "lesson_topics: owner reads" on public.lesson_topics for select to authenticated
  using (private.owns_lesson(lesson_id));
create policy "lesson_topics: available to class students" on public.lesson_topics for select to authenticated
  using (private.lesson_available(lesson_id));

create policy "lesson_early_access: owner reads" on public.lesson_early_access for select to authenticated
  using (private.owns_lesson(lesson_id));

-- ---- RPCs (owner only; ownership always re-checked; expected outcomes are returned, not raised) ----
create or replace function public.import_lesson_version(
  p_lesson_key text, p_title text, p_course_id uuid, p_meta jsonb, p_hash text, p_html text,
  p_topic_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := (select auth.uid());
  v_lesson  public.lessons%rowtype;
  v_created boolean := false;
  v_no      integer;
  v_ver     uuid;
  v_dup     record;
  v_title   text := left(btrim(coalesce(p_title, '')), 200);
  v_key     text := btrim(coalesce(p_lesson_key, ''));
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if char_length(v_key) not between 3 and 80 or char_length(v_title) < 1
     or p_hash !~ '^[0-9a-f]{64}$' or p_html is null or octet_length(p_html) not between 1 and 6291456
     or left(p_html, 15) <> '<!DOCTYPE html>' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  select * into v_lesson from public.lessons where owner_id = v_uid and lesson_key = v_key for update;

  if v_lesson.id is null then
    if p_course_id is null or not private.owns_course(p_course_id) then
      raise exception 'Course not found' using errcode = 'P0002';
    end if;
    if exists (select 1 from unnest(coalesce(p_topic_ids, '{}')) x
               where not exists (select 1 from public.topics t
                                 where t.id = x and t.course_id = p_course_id and not t.is_archived)) then
      return jsonb_build_object('ok', false, 'reason', 'bad_topics');
    end if;
    insert into public.lessons (owner_id, course_id, lesson_key, title) values (v_uid, p_course_id, v_key, v_title)
    on conflict (owner_id, lesson_key) do nothing;
    select * into v_lesson from public.lessons where owner_id = v_uid and lesson_key = v_key for update;
    v_created := true;
    insert into public.lesson_topics (lesson_id, topic_id)
      select v_lesson.id, x from unnest(coalesce(p_topic_ids, '{}')) x on conflict do nothing;
  elsif p_course_id is not null and p_course_id <> v_lesson.course_id then
    return jsonb_build_object('ok', false, 'reason', 'course_mismatch');
  end if;
  -- existing lesson: topic links are kept exactly as they are (changed only via set_lesson_topics)

  select id, version_no into v_dup from public.lesson_versions
   where lesson_id = v_lesson.id and content_hash = p_hash and origin = 'upload' limit 1;
  if v_dup.id is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'lesson_id', v_lesson.id,
                              'version_id', v_dup.id, 'version_no', v_dup.version_no, 'created_lesson', false);
  end if;

  select coalesce(max(version_no), 0) + 1 into v_no from public.lesson_versions where lesson_id = v_lesson.id;
  insert into public.lesson_versions (lesson_id, version_no, content_hash, title, meta, size_bytes, origin)
  values (v_lesson.id, v_no, p_hash, v_title, coalesce(p_meta, '{}'::jsonb), octet_length(p_html), 'upload')
  returning id into v_ver;
  insert into public.lesson_bundles (version_id, html) values (v_ver, p_html);

  return jsonb_build_object('ok', true, 'duplicate', false, 'lesson_id', v_lesson.id,
                            'version_id', v_ver, 'version_no', v_no, 'created_lesson', v_created);
end $$;

create or replace function public.publish_lesson_version(p_version_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_lesson uuid; l public.lessons%rowtype; v public.lesson_versions%rowtype;
begin
  select * into v from public.lesson_versions where id = p_version_id;
  if v.id is null or not private.owns_lesson(v.lesson_id) then
    raise exception 'Version not found' using errcode = 'P0002';
  end if;
  select * into l from public.lessons where id = v.lesson_id for update;
  if l.is_archived then return jsonb_build_object('ok', false, 'reason', 'archived'); end if;
  if not exists (select 1 from public.lesson_topics where lesson_id = l.id) then
    return jsonb_build_object('ok', false, 'reason', 'no_topics');
  end if;
  if l.published_version_id = v.id then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.lesson_versions set published_at = coalesce(published_at, now()) where id = v.id;
  update public.lessons set published_version_id = v.id, title = v.title where id = l.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.unpublish_lesson(p_lesson_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.owns_lesson(p_lesson_id) then raise exception 'Lesson not found' using errcode = 'P0002'; end if;
  update public.lessons set published_version_id = null where id = p_lesson_id;
end $$;

-- Restore = copy an old version into a NEW version and publish it. History is never rewritten.
create or replace function public.restore_lesson_version(p_version_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.lessons%rowtype; v public.lesson_versions%rowtype; v_no integer; v_new uuid;
begin
  select * into v from public.lesson_versions where id = p_version_id;
  if v.id is null or not private.owns_lesson(v.lesson_id) then
    raise exception 'Version not found' using errcode = 'P0002';
  end if;
  select * into l from public.lessons where id = v.lesson_id for update;
  if l.is_archived then return jsonb_build_object('ok', false, 'reason', 'archived'); end if;
  if not exists (select 1 from public.lesson_topics where lesson_id = l.id) then
    return jsonb_build_object('ok', false, 'reason', 'no_topics');
  end if;
  select coalesce(max(version_no), 0) + 1 into v_no from public.lesson_versions where lesson_id = l.id;
  insert into public.lesson_versions (lesson_id, version_no, content_hash, title, meta, size_bytes, origin, restored_from, published_at)
  values (l.id, v_no, v.content_hash, v.title, v.meta, v.size_bytes, 'restore', v.id, now())
  returning id into v_new;
  insert into public.lesson_bundles (version_id, html) select v_new, b.html from public.lesson_bundles b where b.version_id = v.id;
  update public.lessons set published_version_id = v_new, title = v.title where id = l.id;
  return jsonb_build_object('ok', true, 'version_id', v_new, 'version_no', v_no);
end $$;

create or replace function public.set_lesson_topics(p_lesson_id uuid, p_topic_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.lessons%rowtype; v_ids uuid[];
begin
  select * into l from public.lessons where id = p_lesson_id for update;
  if l.id is null or not private.owns_lesson(l.id) then raise exception 'Lesson not found' using errcode = 'P0002'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_topic_ids, '{}')) x;
  if exists (select 1 from unnest(v_ids) x
             where not exists (select 1 from public.topics t where t.id = x and t.course_id = l.course_id and not t.is_archived)) then
    return jsonb_build_object('ok', false, 'reason', 'bad_topics');
  end if;
  if l.published_version_id is not null and cardinality(v_ids) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_topics');
  end if;
  delete from public.lesson_topics where lesson_id = l.id and topic_id <> all (v_ids);
  insert into public.lesson_topics (lesson_id, topic_id) select l.id, x from unnest(v_ids) x on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.set_lesson_early_access(p_lesson_id uuid, p_class_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_course uuid;
begin
  if not private.owns_lesson(p_lesson_id) then raise exception 'Lesson not found' using errcode = 'P0002'; end if;
  select course_id into v_course from public.classes where id = p_class_id;
  if v_course is null or v_course <> (select course_id from public.lessons where id = p_lesson_id) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  if p_enabled then
    insert into public.lesson_early_access (lesson_id, class_id) values (p_lesson_id, p_class_id) on conflict do nothing;
  else
    delete from public.lesson_early_access where lesson_id = p_lesson_id and class_id = p_class_id;
  end if;
end $$;

create or replace function public.archive_lesson(p_lesson_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.owns_lesson(p_lesson_id) then raise exception 'Lesson not found' using errcode = 'P0002'; end if;
  update public.lessons set is_archived = p_archived where id = p_lesson_id;
end $$;

-- ---- delete_class v2: also removes that class's early-access rows (everything else unchanged) ----
create or replace function public.delete_class(p_class_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_course uuid; v_members int; v_statuses int;
begin
  select course_id into v_course from public.classes where id = p_class_id for update;
  if v_course is null or not private.owns_course(v_course) then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;
  delete from public.lesson_early_access where class_id = p_class_id;
  delete from public.topic_study_status where class_id = p_class_id;
  get diagnostics v_statuses = row_count;
  delete from public.class_students where class_id = p_class_id;
  get diagnostics v_members = row_count;
  delete from public.classes where id = p_class_id;
  return jsonb_build_object('deleted', true, 'members', v_members, 'statuses', v_statuses);
end $$;

-- ---- delete_topic / delete_course v4: live v3 bodies + one has_lessons check each ----
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
  v_lessons   int;
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

  -- Lessons engine: a topic linked to a lesson also blocks deletion (archive instead).
  select count(distinct lesson_id) into v_lessons from public.lesson_topics where topic_id = any (v_ids);
  if v_lessons > 0 then
    return jsonb_build_object('deletable', false, 'reason', 'has_lessons',
                              'lessons', v_lessons, 'topics', v_topics);
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
  v_lessons   int;
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

  -- Lessons engine: lessons of this subject also block deletion (archive the subject instead).
  select count(*) into v_lessons from public.lessons where course_id = p_course_id;
  if v_lessons > 0 then
    return jsonb_build_object('deletable', false, 'reason', 'has_lessons',
                              'lessons', v_lessons, 'topics', v_topics);
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

revoke all on function
  public.import_lesson_version(text, text, uuid, jsonb, text, text, uuid[]),
  public.publish_lesson_version(uuid), public.unpublish_lesson(uuid), public.restore_lesson_version(uuid),
  public.set_lesson_topics(uuid, uuid[]), public.set_lesson_early_access(uuid, uuid, boolean),
  public.archive_lesson(uuid, boolean), public.delete_class(uuid),
  public.delete_topic(uuid, boolean), public.delete_course(uuid, boolean)
  from public, anon;
grant execute on function
  public.import_lesson_version(text, text, uuid, jsonb, text, text, uuid[]),
  public.publish_lesson_version(uuid), public.unpublish_lesson(uuid), public.restore_lesson_version(uuid),
  public.set_lesson_topics(uuid, uuid[]), public.set_lesson_early_access(uuid, uuid, boolean),
  public.archive_lesson(uuid, boolean), public.delete_class(uuid),
  public.delete_topic(uuid, boolean), public.delete_course(uuid, boolean)
  to authenticated;

insert into private.applied_migrations (version, name) values ('20261117000300', 'lessons');

commit;
