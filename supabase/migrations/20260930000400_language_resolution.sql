-- =====================================================================
-- Migration: 20260930000400_language_resolution
-- Workstream C1 (3/3) — which content does a student of language L get?
--
--   private.resolve_question(question_id, language) decides, in this order:
--     1. language IS NULL (non-programming course / legacy)  -> the base, exactly as before
--     2. question is explicitly language-neutral             -> the base
--     3. question base language = L                          -> the base
--     4. question has NO language and L = the course's primary language
--        (legacy "unclassified" question)                    -> the base
--     5. a variant for L exists                              -> base overridden by the variant
--     6. otherwise                                           -> BLOCKED:
--          'unclassified'    (base has no language, L is not the primary language)
--          'missing_variant' (base is another language and no variant for L exists)
--   No silent conversion, no AI at display time.
--
--   publish_assignment v2 uses it. It is the ONLY place a snapshot is written, and it
--   runs only for a draft. Published / closed assignments are never re-resolved.
--   Nothing in this migration reads or writes existing snapshot rows.
--
--   assignment_language_status(assignment_id): read-only preview for the builder UI
--   (which questions block publishing, which recipients study another language).
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20260930000300') then
    raise exception 'Run 20260930000300_question_variants.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20260930000400') then
    raise exception 'Migration 20260930000400 already applied.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- resolve_question (internal; not exposed to clients)
-- ---------------------------------------------------------------------
create or replace function private.resolve_question(p_question_id uuid, p_language text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  q          public.questions;
  v          public.question_variants;
  s          public.question_solutions;
  v_primary  text;
  v_hints    jsonb;
  v_source   text;
begin
  select * into q from public.questions where id = p_question_id;
  if q.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select programming_language into v_primary from public.courses where id = q.course_id;
  select * into s from public.question_solutions where question_id = q.id;

  v_hints := (select coalesce(jsonb_agg(jsonb_build_object('level', h.level, 'content_md', h.content_md) order by h.level), '[]'::jsonb)
              from public.question_hints h where h.question_id = q.id);

  -- 1-4: the base
  if p_language is null
     or q.is_language_neutral
     or q.programming_language = p_language
     or (q.programming_language is null and p_language = v_primary) then
    v_source := case when p_language is null then 'base'
                     when q.is_language_neutral then 'neutral'
                     else 'base' end;
    return jsonb_build_object(
      'ok', true, 'source', v_source,
      'title', q.title, 'body_md', q.body_md, 'question_type', q.question_type,
      'programming_language', case when p_language is null then q.programming_language else p_language end,
      'starter_code', q.starter_code, 'hints', v_hints,
      'solution_code', coalesce(s.solution_code, ''), 'explanation_md', coalesce(s.explanation_md, ''));
  end if;

  -- 5: a variant
  select * into v from public.question_variants where question_id = q.id and programming_language = p_language;
  if v.id is not null then
    return jsonb_build_object(
      'ok', true, 'source', 'variant',
      'title', q.title, 'body_md', coalesce(v.body_md, q.body_md), 'question_type', q.question_type,
      'programming_language', p_language,
      'starter_code', v.starter_code, 'hints', coalesce(v.hints, v_hints),
      'solution_code', v.solution_code, 'explanation_md', v.explanation_md);
  end if;

  -- 6: blocked
  return jsonb_build_object('ok', false,
    'reason', case when q.programming_language is null then 'unclassified' else 'missing_variant' end);
end;
$$;
revoke all on function private.resolve_question(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- publish_assignment v2
--   Same checks, same result shapes, same effects as v1 for every case v1 handled.
--   New: recipient language check + language resolution (blocks with a clear reason).
-- ---------------------------------------------------------------------
create or replace function public.publish_assignment(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_a         public.assignments;
  v_questions int;
  r           record;
  v_res       jsonb;
  v_blockers  jsonb := '[]'::jsonb;
  v_snap      jsonb := '{}'::jsonb;
begin
  select * into v_a from public.assignments where id = p_assignment_id for update;
  if v_a.id is null or v_a.owner_id <> (select auth.uid()) then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  if v_a.status <> 'draft' then
    return jsonb_build_object('ok', false, 'reason', 'not_draft');
  end if;
  select count(*) into v_questions from public.assignment_questions where assignment_id = p_assignment_id;
  if v_questions = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_questions');
  end if;
  if not exists (select 1 from public.assignment_students where assignment_id = p_assignment_id) then
    return jsonb_build_object('ok', false, 'reason', 'no_students');
  end if;
  if exists (select 1 from public.assignment_questions aq join public.questions q on q.id = aq.question_id
             where aq.assignment_id = p_assignment_id and q.status = 'archived') then
    return jsonb_build_object('ok', false, 'reason', 'archived_question');
  end if;

  -- v2: every recipient must study the assignment's language
  if v_a.programming_language is not null and exists (
    select 1 from public.assignment_students r2
    left join public.course_enrollments e on e.course_id = v_a.course_id and e.student_id = r2.student_id
    where r2.assignment_id = p_assignment_id and e.programming_language is distinct from v_a.programming_language
  ) then
    return jsonb_build_object('ok', false, 'reason', 'recipient_language_mismatch');
  end if;

  -- v2: resolve every question in the assignment's language; collect ALL blockers
  for r in
    select aq.id as aq_id, aq.question_id, q.title
    from public.assignment_questions aq join public.questions q on q.id = aq.question_id
    where aq.assignment_id = p_assignment_id
    order by aq.position
  loop
    v_res := private.resolve_question(r.question_id, v_a.programming_language);
    if (v_res ->> 'ok')::boolean then
      v_snap := v_snap || jsonb_build_object(r.aq_id::text, v_res);
    else
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'question_id', r.question_id, 'title', r.title,
        'language', v_a.programming_language, 'kind', v_res ->> 'reason'));
    end if;
  end loop;
  if jsonb_array_length(v_blockers) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'variants_missing', 'items', v_blockers);
  end if;

  -- snapshot: what the student sees
  for r in select aq.id as aq_id from public.assignment_questions aq where aq.assignment_id = p_assignment_id
  loop
    v_res := v_snap -> (r.aq_id::text);
    update public.assignment_questions aq set
      title = v_res ->> 'title', body_md = v_res ->> 'body_md', question_type = v_res ->> 'question_type',
      programming_language = v_res ->> 'programming_language', starter_code = v_res ->> 'starter_code',
      hint_count = jsonb_array_length(v_res -> 'hints'),
      has_solution = (btrim(v_res ->> 'solution_code') <> '' or btrim(v_res ->> 'explanation_md') <> ''),
      snapshot_at = now()
    where aq.id = r.aq_id;

    -- secret parts (levels renumbered 1..n in order)
    insert into public.assignment_question_hints (assignment_question_id, level, content_md)
    select r.aq_id, (row_number() over (order by (h ->> 'level')::int))::smallint, h ->> 'content_md'
    from jsonb_array_elements(v_res -> 'hints') h;

    if btrim(v_res ->> 'solution_code') <> '' or btrim(v_res ->> 'explanation_md') <> '' then
      insert into public.assignment_question_solutions (assignment_question_id, solution_code, explanation_md)
      values (r.aq_id, v_res ->> 'solution_code', v_res ->> 'explanation_md');
    end if;
  end loop;

  update public.assignments set status = 'published', published_at = now(), closed_at = null
  where id = p_assignment_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.publish_assignment(uuid) from public, anon;
grant execute on function public.publish_assignment(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- assignment_language_status — read-only preview for the assignment builder
-- ---------------------------------------------------------------------
create or replace function public.assignment_language_status(p_assignment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_a public.assignments;
  v_items jsonb;
  v_recips jsonb;
begin
  select * into v_a from public.assignments where id = p_assignment_id;
  if v_a.id is null or v_a.owner_id <> (select auth.uid()) then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'assignment_question_id', aq.id, 'question_id', aq.question_id, 'title', q.title,
           'status', case when (res ->> 'ok')::boolean then 'ok' else res ->> 'reason' end,
           'source', res ->> 'source') order by aq.position), '[]'::jsonb)
  into v_items
  from public.assignment_questions aq
  join public.questions q on q.id = aq.question_id
  cross join lateral (select private.resolve_question(aq.question_id, v_a.programming_language) as res) x
  where aq.assignment_id = p_assignment_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'student_id', r.student_id, 'full_name', p.full_name, 'language', e.programming_language,
           'matches', v_a.programming_language is null or e.programming_language is not distinct from v_a.programming_language)
           order by p.full_name), '[]'::jsonb)
  into v_recips
  from public.assignment_students r
  join public.profiles p on p.id = r.student_id
  left join public.course_enrollments e on e.course_id = v_a.course_id and e.student_id = r.student_id
  where r.assignment_id = p_assignment_id;

  return jsonb_build_object('language', v_a.programming_language, 'status', v_a.status,
                            'items', v_items, 'recipients', v_recips);
end;
$$;
revoke all on function public.assignment_language_status(uuid) from public, anon;
grant execute on function public.assignment_language_status(uuid) to authenticated;

insert into private.applied_migrations (version, name) values ('20260930000400', 'language_resolution');

commit;
