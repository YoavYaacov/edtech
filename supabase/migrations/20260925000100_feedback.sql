-- =====================================================================
-- Migration: 20260925000100_feedback
-- Phase 4 — review & feedback (no AI, no Action Center).
-- Project doc: "תכנון מפורט: שלב 4 (מאושר)", decisions 49, 55, 57–67.
--
-- Model:
--   * answers        = the live draft (status values UNCHANGED: draft/submitted)
--   * answer_submissions = immutable attempts (UNCHANGED)
--   * feedback       = one per attempt (submission). Return-for-revision is a
--                      workflow action, not a verdict.
--   * State is DERIVED; no new state column; no change to existing tables.
--
-- Invariants enforced here (not only in the UI):
--   * Released feedback is immutable (trigger). Only the one-time
--     "returned" marking may be added after release (decision 61).
--   * "Ready" = verdict set, and a message unless verdict = correct (62).
--   * return_for_revision NEVER creates an answer_submission (66): it only
--     flips answers.status back to 'draft'; the next submit_answer creates
--     the next attempt.
--   * Every non-latest attempt carries released feedback with a return.
--   * Bulk release is all-or-nothing over the exact previewed list (67).
--   * Mistake tags: course required, topic optional but same course (63);
--     teacher-only, never visible to students (60).
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20260924000200') then
    raise exception 'Run 20260924000200_assignments.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20260925000100') then
    raise exception 'Migration 20260925000100 already applied.';
  end if;
end $$;

-- =====================================================================
-- TABLES
-- =====================================================================
create table public.feedback (
  id                   uuid primary key default gen_random_uuid(),
  submission_id        uuid not null unique references public.answer_submissions (id) on delete cascade,
  teacher_id           uuid not null references public.profiles (id) on delete restrict,
  verdict              text check (verdict in ('correct', 'partial', 'needs_fix', 'incorrect')),
  message_md           text not null default '' check (char_length(message_md) <= 20000),
  return_for_revision  boolean not null default false,
  released_at          timestamptz,
  returned_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- decision 62: only "ready" feedback can be released
  constraint feedback_release_requires_verdict check (released_at is null or verdict is not null),
  constraint feedback_release_requires_message check (released_at is null or verdict = 'correct' or btrim(message_md) <> ''),
  constraint feedback_returned_consistent check (returned_at is null or (return_for_revision and released_at is not null))
);
create trigger feedback_set_updated_at before update on public.feedback
  for each row execute function private.set_updated_at();

create table public.feedback_private_notes (
  feedback_id  uuid primary key references public.feedback (id) on delete cascade,
  note_md      text not null default '' check (char_length(note_md) <= 20000),
  updated_at   timestamptz not null default now()
);
create trigger feedback_private_notes_set_updated_at before update on public.feedback_private_notes
  for each row execute function private.set_updated_at();

create table public.mistake_tags (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete restrict,
  course_id    uuid not null references public.courses (id) on delete restrict,
  topic_id     uuid references public.topics (id) on delete restrict,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  description  text not null default '' check (char_length(description) <= 500),
  is_archived  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index mistake_tags_course_name_uq on public.mistake_tags (course_id, lower(btrim(name)));
create index mistake_tags_topic_idx on public.mistake_tags (topic_id);
create trigger mistake_tags_set_updated_at before update on public.mistake_tags
  for each row execute function private.set_updated_at();

create table public.submission_mistakes (
  submission_id   uuid not null references public.answer_submissions (id) on delete cascade,
  mistake_tag_id  uuid not null references public.mistake_tags (id) on delete restrict,
  created_at      timestamptz not null default now(),
  primary key (submission_id, mistake_tag_id)
);
create index submission_mistakes_tag_idx on public.submission_mistakes (mistake_tag_id);

-- =====================================================================
-- HELPERS (private, SECURITY DEFINER)
-- =====================================================================
create or replace function private.submission_ctx(p_submission_id uuid)
returns table (submission_id uuid, answer_id uuid, aq_id uuid, assignment_id uuid, owner_id uuid,
               student_id uuid, course_id uuid, assignment_status text, answer_status text,
               attempt_number int, is_latest boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, an.id, aq.id, a.id, a.owner_id, an.student_id, a.course_id, a.status, an.status, s.attempt_number,
         s.attempt_number = (select max(s2.attempt_number) from public.answer_submissions s2 where s2.answer_id = an.id)
  from public.answer_submissions s
  join public.answers an on an.id = s.answer_id
  join public.assignment_questions aq on aq.id = an.assignment_question_id
  join public.assignments a on a.id = aq.assignment_id
  where s.id = p_submission_id;
$$;

create or replace function private.owns_submission(p_submission_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.answer_submissions s
                 where s.id = p_submission_id and private.owns_answer(s.answer_id));
$$;

create or replace function private.is_my_submission(p_submission_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.answer_submissions s
                 where s.id = p_submission_id and private.is_my_answer(s.answer_id));
$$;

create or replace function private.owns_feedback(p_feedback_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.feedback f
                 where f.id = p_feedback_id and private.owns_submission(f.submission_id));
$$;

-- decision 62
create or replace function private.feedback_is_ready(p_verdict text, p_message text)
returns boolean language sql immutable set search_path = '' as $$
  select p_verdict is not null and (p_verdict = 'correct' or btrim(coalesce(p_message, '')) <> '');
$$;

-- Why a submission's feedback cannot be released now (NULL = it can).
create or replace function private.release_block_reason(p_submission_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  c record;
  f public.feedback;
begin
  select * into c from private.submission_ctx(p_submission_id);
  if not found or c.owner_id is distinct from (select auth.uid()) then return 'not_found'; end if;
  if not c.is_latest then return 'not_latest'; end if;
  if c.answer_status <> 'submitted' then return 'bad_state'; end if;
  select * into f from public.feedback where submission_id = p_submission_id;
  if f.id is null then return 'no_feedback'; end if;
  if f.released_at is not null then return 'already_released'; end if;
  if not private.feedback_is_ready(f.verdict, f.message_md) then return 'not_ready'; end if;
  if f.return_for_revision and c.assignment_status <> 'published' then return 'closed_no_return'; end if;
  return null;
end;
$$;

-- Performs a release that was already validated (caller holds the locks).
-- Invariant 66: never touches answer_submissions.
create or replace function private.do_release(p_submission_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_return boolean;
begin
  update public.feedback
     set released_at = now(),
         returned_at = case when return_for_revision then now() else null end
   where submission_id = p_submission_id
  returning return_for_revision into v_return;
  if v_return then
    update public.answers set status = 'draft'
     where id = (select answer_id from public.answer_submissions where id = p_submission_id);
  end if;
  return v_return;
end;
$$;

-- =====================================================================
-- INTEGRITY TRIGGERS
-- =====================================================================
-- decision 61: released feedback is immutable. The only change allowed after
-- release is the one-time return marking (false→true, returned_at null→set).
create or replace function private.guard_released_feedback()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.released_at is null then
    return new;
  end if;
  if new.submission_id <> old.submission_id
     or new.teacher_id <> old.teacher_id
     or new.verdict is distinct from old.verdict
     or new.message_md <> old.message_md
     or new.released_at is distinct from old.released_at
     or new.created_at <> old.created_at
     or (old.return_for_revision and not new.return_for_revision)
     or (old.returned_at is not null and new.returned_at is distinct from old.returned_at)
     or (new.return_for_revision and not old.return_for_revision and new.returned_at is null) then
    raise exception 'Released feedback is immutable';
  end if;
  return new;
end;
$$;
create trigger feedback_guard_released before update on public.feedback
  for each row execute function private.guard_released_feedback();

-- decision 63: topic (optional) must belong to the tag's course; course is fixed.
create or replace function private.check_mistake_tag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.course_id <> old.course_id then
    raise exception 'A mistake tag cannot move to another course';
  end if;
  if new.topic_id is not null and not exists (
    select 1 from public.topics where id = new.topic_id and course_id = new.course_id
  ) then
    raise exception 'Topic belongs to another course';
  end if;
  return new;
end;
$$;
create trigger mistake_tags_check before insert or update on public.mistake_tags
  for each row execute function private.check_mistake_tag();

-- A tag attached to an attempt: same course as the assignment, not archived.
create or replace function private.check_submission_mistake()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_tag public.mistake_tags;
  v_course uuid;
begin
  select * into v_tag from public.mistake_tags where id = new.mistake_tag_id;
  if v_tag.is_archived then
    raise exception 'Archived mistake tags cannot be attached';
  end if;
  select c.course_id into v_course from private.submission_ctx(new.submission_id) c;
  if v_course is distinct from v_tag.course_id then
    raise exception 'Mistake tag belongs to another course';
  end if;
  return new;
end;
$$;
create trigger submission_mistakes_check before insert on public.submission_mistakes
  for each row execute function private.check_submission_mistake();

-- =====================================================================
-- PRIVILEGES — no direct writes to feedback / notes / submission tags
-- =====================================================================
revoke all on public.feedback, public.feedback_private_notes, public.mistake_tags,
  public.submission_mistakes from anon, authenticated;

grant select on public.feedback, public.feedback_private_notes, public.submission_mistakes to authenticated;
grant select, delete on public.mistake_tags to authenticated;
grant insert (owner_id, course_id, topic_id, name, description) on public.mistake_tags to authenticated;
grant update (topic_id, name, description, is_archived) on public.mistake_tags to authenticated;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.feedback               enable row level security;
alter table public.feedback_private_notes enable row level security;
alter table public.mistake_tags           enable row level security;
alter table public.submission_mistakes    enable row level security;

create policy "feedback: owner teacher reads" on public.feedback for select to authenticated
  using (private.owns_submission(submission_id));
create policy "feedback: student reads own released" on public.feedback for select to authenticated
  using (released_at is not null and private.is_my_submission(submission_id));

-- private notes, mistake tags, submission tags: teacher only (no student policy at all)
create policy "private notes: owner teacher reads" on public.feedback_private_notes for select to authenticated
  using (private.owns_feedback(feedback_id));

create policy "mistake_tags: owner reads" on public.mistake_tags for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "mistake_tags: teacher creates in own course" on public.mistake_tags for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.is_teacher() and private.owns_course(course_id));
create policy "mistake_tags: owner updates" on public.mistake_tags for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "mistake_tags: owner deletes (FK blocks used tags)" on public.mistake_tags for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "submission_mistakes: owner teacher reads" on public.submission_mistakes for select to authenticated
  using (private.owns_submission(submission_id));

-- =====================================================================
-- REVIEW QUEUE (security_invoker → RLS of the caller applies)
-- =====================================================================
create view public.teacher_review_queue with (security_invoker = true) as
select an.id                 as answer_id,
       an.assignment_question_id,
       an.student_id,
       aq.assignment_id,
       ls.id                 as submission_id,
       ls.attempt_number,
       ls.submitted_at,
       f.id                  as feedback_id,
       (f.id is not null)    as has_draft
from public.answers an
join public.assignment_questions aq on aq.id = an.assignment_question_id
join lateral (
  select s.id, s.attempt_number, s.submitted_at
  from public.answer_submissions s
  where s.answer_id = an.id
  order by s.attempt_number desc
  limit 1
) ls on true
left join public.feedback f on f.submission_id = ls.id
where an.status = 'submitted'
  and (f.id is null or f.released_at is null)
  and private.owns_assignment(aq.assignment_id);

revoke all on public.teacher_review_queue from anon, authenticated;
grant select on public.teacher_review_queue to authenticated;

-- =====================================================================
-- RPC
-- =====================================================================
-- Save a feedback DRAFT (verdict, message, private note, tags, return intent).
-- Rejected once released (decision 61). Atomic.
create or replace function public.save_feedback(
  p_submission_id uuid, p_verdict text, p_message_md text, p_private_note text,
  p_mistake_tag_ids uuid[], p_return_for_revision boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c record;
  v_uid uuid := (select auth.uid());
  v_fid uuid;
  v_released timestamptz;
begin
  select * into c from private.submission_ctx(p_submission_id);
  if not found or c.owner_id is distinct from v_uid then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;
  if not c.is_latest then
    return jsonb_build_object('ok', false, 'reason', 'not_latest');
  end if;

  select id, released_at into v_fid, v_released from public.feedback where submission_id = p_submission_id for update;
  if v_released is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_released');
  end if;

  if v_fid is null then
    insert into public.feedback (submission_id, teacher_id, verdict, message_md, return_for_revision)
    values (p_submission_id, v_uid, nullif(p_verdict, ''), coalesce(p_message_md, ''), coalesce(p_return_for_revision, false))
    returning id into v_fid;
  else
    update public.feedback
       set verdict = nullif(p_verdict, ''), message_md = coalesce(p_message_md, ''),
           return_for_revision = coalesce(p_return_for_revision, false)
     where id = v_fid;
  end if;

  insert into public.feedback_private_notes (feedback_id, note_md)
  values (v_fid, coalesce(p_private_note, ''))
  on conflict (feedback_id) do update set note_md = excluded.note_md;

  delete from public.submission_mistakes where submission_id = p_submission_id;
  insert into public.submission_mistakes (submission_id, mistake_tag_id)
  select p_submission_id, t from (select distinct unnest(coalesce(p_mistake_tag_ids, '{}'::uuid[])) as t) x;

  return jsonb_build_object('ok', true, 'feedback_id', v_fid,
    'ready', private.feedback_is_ready(nullif(p_verdict, ''), p_message_md));
end;
$$;

-- Release one question's feedback (and return it, if marked).
create or replace function public.release_feedback(p_submission_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_reason text;
  v_return boolean;
  v_assignment uuid;
begin
  select c.assignment_id into v_assignment from private.submission_ctx(p_submission_id) c;
  if v_assignment is null or not private.owns_assignment(v_assignment) then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;
  perform 1 from public.assignments where id = v_assignment for share;
  perform 1 from public.feedback where submission_id = p_submission_id for update;
  v_reason := private.release_block_reason(p_submission_id);
  if v_reason is not null then
    return jsonb_build_object('ok', false, 'reason', v_reason);
  end if;
  v_return := private.do_release(p_submission_id);
  return jsonb_build_object('ok', true, 'returned', v_return);
end;
$$;

-- Preview for bulk release: counts + the exact list that would be released.
create or replace function public.preview_ready_feedback(p_assignment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_status text;
  v_result jsonb;
begin
  select status into v_status from public.assignments
   where id = p_assignment_id and owner_id = (select auth.uid());
  if v_status is null then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;

  with pending as (
    select ls.id as submission_id, f.id as feedback_id, f.return_for_revision,
           private.feedback_is_ready(f.verdict, f.message_md) as ready
    from public.answers an
    join public.assignment_questions aq on aq.id = an.assignment_question_id and aq.assignment_id = p_assignment_id
    join lateral (select s.id from public.answer_submissions s where s.answer_id = an.id
                  order by s.attempt_number desc limit 1) ls on true
    left join public.feedback f on f.submission_id = ls.id
    where an.status = 'submitted' and (f.id is null or f.released_at is null)
  )
  select jsonb_build_object(
    'ready_ids', coalesce(jsonb_agg(submission_id) filter (
        where feedback_id is not null and ready and not (return_for_revision and v_status <> 'published')), '[]'::jsonb),
    'ready_with_return', count(*) filter (
        where feedback_id is not null and ready and return_for_revision and v_status = 'published'),
    'blocked_closed', count(*) filter (
        where feedback_id is not null and ready and return_for_revision and v_status <> 'published'),
    'not_ready', count(*) filter (where feedback_id is not null and not ready),
    'no_feedback', count(*) filter (where feedback_id is null)
  ) into v_result
  from pending;
  return v_result;
end;
$$;

-- Bulk release — decision 67: release EXACTLY the previewed list, all or nothing.
-- Everything is validated (under locks) before the first write; any stale
-- item returns ok=false and nothing is written. Any unexpected error aborts
-- the whole transaction.
create or replace function public.release_ready_feedback(p_assignment_id uuid, p_submission_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_reason text;
  v_released int := 0;
  v_returned int := 0;
begin
  if not private.owns_assignment(p_assignment_id) then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  if p_submission_ids is null or cardinality(p_submission_ids) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_release');
  end if;
  if (select count(distinct x) from unnest(p_submission_ids) x) <> cardinality(p_submission_ids) then
    return jsonb_build_object('ok', false, 'reason', 'stale');
  end if;

  perform 1 from public.assignments where id = p_assignment_id for share;
  perform 1 from public.feedback where submission_id = any (p_submission_ids) for update;

  -- 1) validate everything
  foreach v_id in array p_submission_ids loop
    if (select c.assignment_id from private.submission_ctx(v_id) c) is distinct from p_assignment_id then
      return jsonb_build_object('ok', false, 'reason', 'stale', 'submission_id', v_id, 'detail', 'other_assignment');
    end if;
    v_reason := private.release_block_reason(v_id);
    if v_reason is not null then
      return jsonb_build_object('ok', false, 'reason', 'stale', 'submission_id', v_id, 'detail', v_reason);
    end if;
  end loop;

  -- 2) write everything
  foreach v_id in array p_submission_ids loop
    v_released := v_released + 1;
    if private.do_release(v_id) then v_returned := v_returned + 1; end if;
  end loop;

  return jsonb_build_object('ok', true, 'released', v_released, 'returned', v_returned);
end;
$$;

-- Late return of an already-released ("reviewed") answer.
-- Invariant 66: does NOT create a submission; verdict/message stay as released.
create or replace function public.return_for_revision(p_submission_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c record;
  f public.feedback;
begin
  select * into c from private.submission_ctx(p_submission_id);
  if not found or c.owner_id is distinct from (select auth.uid()) then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;
  perform 1 from public.assignments where id = c.assignment_id for share;
  select * into f from public.feedback where submission_id = p_submission_id for update;
  if not c.is_latest then return jsonb_build_object('ok', false, 'reason', 'not_latest'); end if;
  if f.id is null or f.released_at is null then return jsonb_build_object('ok', false, 'reason', 'not_released'); end if;
  if f.return_for_revision then return jsonb_build_object('ok', false, 'reason', 'already_returned'); end if;
  if c.answer_status <> 'submitted' then return jsonb_build_object('ok', false, 'reason', 'bad_state'); end if;
  if c.assignment_status <> 'published' then return jsonb_build_object('ok', false, 'reason', 'closed_no_return'); end if;

  update public.feedback set return_for_revision = true, returned_at = now() where id = f.id;
  update public.answers set status = 'draft' where id = c.answer_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Manual reveal by the teacher for ONE student (works also with 'locked'
-- policy and before submission). Uses the existing question_reveals; the
-- student's existing RLS (own reveal row) is unchanged.
create or replace function public.teacher_reveal_hint(p_assignment_question_id uuid, p_student_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_q public.assignment_questions;
  v_status text;
  v_next smallint;
begin
  select q.* into v_q from public.assignment_questions q
  where q.id = p_assignment_question_id
    and q.assignment_id in (select id from public.assignments where owner_id = v_uid);
  select status into v_status from public.assignments where id = v_q.assignment_id;
  if v_q.id is null then
    raise exception 'Assignment question not found' using errcode = 'P0002';
  end if;
  if v_status = 'draft' then return jsonb_build_object('ok', false, 'reason', 'not_published'); end if;
  if not exists (select 1 from public.assignment_students
                 where assignment_id = v_q.assignment_id and student_id = p_student_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_recipient');
  end if;
  select coalesce(max(level), 0) + 1 into v_next from public.question_reveals
  where assignment_question_id = v_q.id and student_id = p_student_id and kind = 'hint';
  if v_next > v_q.hint_count then return jsonb_build_object('ok', false, 'reason', 'no_more_hints'); end if;
  insert into public.question_reveals (assignment_question_id, student_id, kind, level, revealed_by)
  values (v_q.id, p_student_id, 'hint', v_next, v_uid);
  return jsonb_build_object('ok', true, 'level', v_next);
end;
$$;

create or replace function public.teacher_reveal_solution(p_assignment_question_id uuid, p_student_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_q public.assignment_questions;
  v_status text;
  v_inserted int;
begin
  select q.* into v_q from public.assignment_questions q
  where q.id = p_assignment_question_id
    and q.assignment_id in (select id from public.assignments where owner_id = v_uid);
  select status into v_status from public.assignments where id = v_q.assignment_id;
  if v_q.id is null then
    raise exception 'Assignment question not found' using errcode = 'P0002';
  end if;
  if v_status = 'draft' then return jsonb_build_object('ok', false, 'reason', 'not_published'); end if;
  if not v_q.has_solution then return jsonb_build_object('ok', false, 'reason', 'no_solution'); end if;
  if not exists (select 1 from public.assignment_students
                 where assignment_id = v_q.assignment_id and student_id = p_student_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_recipient');
  end if;
  insert into public.question_reveals (assignment_question_id, student_id, kind, level, revealed_by)
  values (v_q.id, p_student_id, 'solution', 0, v_uid)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  return jsonb_build_object('ok', true, 'already', v_inserted = 0);
end;
$$;

-- =====================================================================
-- function privileges
-- =====================================================================
revoke all on function
  private.submission_ctx(uuid), private.owns_submission(uuid), private.is_my_submission(uuid),
  private.owns_feedback(uuid), private.feedback_is_ready(text, text), private.release_block_reason(uuid),
  private.do_release(uuid), private.guard_released_feedback(), private.check_mistake_tag(),
  private.check_submission_mistake()
from public;
grant execute on function
  private.owns_submission(uuid), private.is_my_submission(uuid), private.owns_feedback(uuid),
  private.feedback_is_ready(text, text)
to authenticated;

revoke all on function
  public.save_feedback(uuid, text, text, text, uuid[], boolean), public.release_feedback(uuid),
  public.preview_ready_feedback(uuid), public.release_ready_feedback(uuid, uuid[]),
  public.return_for_revision(uuid), public.teacher_reveal_hint(uuid, uuid), public.teacher_reveal_solution(uuid, uuid)
from public, anon;
grant execute on function
  public.save_feedback(uuid, text, text, text, uuid[], boolean), public.release_feedback(uuid),
  public.preview_ready_feedback(uuid), public.release_ready_feedback(uuid, uuid[]),
  public.return_for_revision(uuid), public.teacher_reveal_hint(uuid, uuid), public.teacher_reveal_solution(uuid, uuid)
to authenticated;

insert into private.applied_migrations (version, name) values ('20260925000100', 'feedback');

commit;
