-- =====================================================================
-- Migration: 20260925000200_safe_delete_v2
-- Phase 4 — the safe-delete checks also count mistake tags, so the dry run
-- explains the block instead of the real delete failing on the FK.
-- Redefines delete_topic / delete_course (same signatures, same grants);
-- 20260924000100_safe_delete.sql itself is NOT modified.
-- Only change vs v1: a 'has_mistake_tags' check. Everything else identical.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20260925000100') then
    raise exception 'Run 20260925000100_feedback.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20260925000200') then
    raise exception 'Migration 20260925000200 already applied.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- delete_topic: deletes a topic and its whole subtree, only if no
-- question is linked to any topic in that subtree.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- delete_course: only if the course has no questions (any status) and
-- no enrolled students. Its topic tree is deleted with it.
-- ---------------------------------------------------------------------
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

-- create or replace keeps the existing privileges; restated for clarity
revoke all on function public.delete_topic(uuid, boolean)  from public, anon;
revoke all on function public.delete_course(uuid, boolean) from public, anon;
grant execute on function public.delete_topic(uuid, boolean)  to authenticated;
grant execute on function public.delete_course(uuid, boolean) to authenticated;

insert into private.applied_migrations (version, name) values ('20260925000200', 'safe_delete_v2');

commit;
