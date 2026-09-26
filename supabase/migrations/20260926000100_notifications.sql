-- =====================================================================
-- Migration: 20260926000100_notifications
-- Phase 5 — Notification / Action Center (step 1 of the approved plan).
-- Project doc: "תכנון שלב 5", decisions 76–82.
--
-- Two mechanisms, kept deliberately separate:
--
--   * "דורש טיפול" (Derived Action) — computed LIVE, never stored, closes
--     itself the moment the underlying state changes. Teacher side reuses
--     the existing teacher_review_queue view UNCHANGED. Student side gets a
--     new, symmetric view: student_pending_actions (decision 80).
--
--   * "חדש" (Stored Event) — the only thing that needs a real row, because
--     read/unread is a fact about the viewer, not about business state.
--     Table: public.notifications. Written ONLY by two new triggers on
--     EXISTING tables (answer_submissions, feedback). No Phase 3/4 RPC body
--     is touched — the dependency this migration adds is the trigger only.
--
-- Event types (decision 79):
--   * submission_received   → teacher, on every answer_submissions insert
--                              (every attempt, including resubmissions).
--   * feedback_available    → student, when released_at is set WITHOUT a
--                              return (plain release, nothing to fix).
--   * returned_for_revision → student, when return_for_revision newly
--                              becomes true — whether that happens AT
--                              release time (single combined event; no
--                              separate feedback_available is created for
--                              the same submission) or LATER, via a late
--                              return_for_revision() on an already-reviewed
--                              answer (a second, separate event then).
--
-- Deep links (decision 81, decision 56): stored as entity ids
-- (assignment_id, assignment_question_id, submission_id), never a URL.
-- The existing q=:position contract in WorkspacePage/ReviewPage is kept
-- as-is: once an assignment is published, its question list/order is
-- frozen (decision 31 — add/remove/reorder only in draft), so the ordinal
-- position of a question that already has submissions is stable for the
-- assignment's remaining lifetime. Switching to assignment_question_id-based
-- question selection would require changing the already-accepted
-- WorkspacePage/ReviewPage param contracts for no safety gain, so it is not
-- done here; assignment_question_id is still the id notifications store and
-- join on (position is resolved from it at read time, not duplicated).
--
-- Badge (decision 78): counts "דורש טיפול" only. Unread stored events get
-- an unread indicator inside the panel, not a place in the badge count.
--
-- Duplicates: Phase 4's own immutability invariants (decision 61) already
-- guarantee released_at and return_for_revision can each move from
-- null/false to a value at most ONCE per submission, and answer_submissions
-- is insert-only/unique per attempt — so each event type is naturally
-- created at most once per submission regardless of this migration. The
-- unique index below is defense in depth, not what actually prevents
-- duplicates (decision: "מניעת כפילויות במפתח ייחודי").
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20260925000300') then
    raise exception 'Run 20260925000300_feedback_metadata.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20260926000100') then
    raise exception 'Migration 20260926000100 already applied.';
  end if;
end $$;

-- =====================================================================
-- TABLE — stored events only ("חדש"); "דורש טיפול" is never stored here.
-- =====================================================================
create table public.notifications (
  id                      uuid primary key default gen_random_uuid(),
  recipient_id            uuid not null references public.profiles (id) on delete cascade,
  event_type              text not null check (event_type in ('submission_received', 'feedback_available', 'returned_for_revision')),
  assignment_id           uuid not null references public.assignments (id) on delete cascade,
  assignment_question_id  uuid not null references public.assignment_questions (id) on delete cascade,
  submission_id           uuid not null references public.answer_submissions (id) on delete cascade,
  student_id              uuid not null references public.profiles (id) on delete cascade,
  read_at                 timestamptz,
  created_at              timestamptz not null default now(),
  unique (recipient_id, event_type, submission_id)
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx    on public.notifications (recipient_id) where read_at is null;

comment on table public.notifications is
  'Stored events only ("חדש"). "דורש טיפול" is derived live (teacher_review_queue / student_pending_actions) and is never written here.';

-- =====================================================================
-- TRIGGERS — the ONLY writers. No Phase 3/4 RPC body changes.
-- =====================================================================
-- New attempt → notify the owning teacher. Reuses private.submission_ctx
-- (defined in the Phase 4 migration) for owner/assignment/question/student.
create or replace function private.notify_submission_received()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  select * into c from private.submission_ctx(new.id);
  insert into public.notifications (recipient_id, event_type, assignment_id, assignment_question_id, submission_id, student_id)
  values (c.owner_id, 'submission_received', c.assignment_id, c.aq_id, new.id, c.student_id)
  on conflict (recipient_id, event_type, submission_id) do nothing;
  return new;
end;
$$;
create trigger answer_submissions_notify after insert on public.answer_submissions
  for each row execute function private.notify_submission_received();

-- Feedback released / returned → notify the student.
create or replace function private.notify_feedback_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  select * into c from private.submission_ctx(new.submission_id);
  if old.released_at is null and new.released_at is not null then
    -- release moment (release_feedback / release_ready_feedback): exactly
    -- one event, chosen by decision 79 — never both for the same release.
    insert into public.notifications (recipient_id, event_type, assignment_id, assignment_question_id, submission_id, student_id)
    values (c.student_id, case when new.return_for_revision then 'returned_for_revision' else 'feedback_available' end,
            c.assignment_id, c.aq_id, new.submission_id, c.student_id)
    on conflict (recipient_id, event_type, submission_id) do nothing;
  elsif old.released_at is not null and new.released_at is not null
        and old.return_for_revision is distinct from true and new.return_for_revision then
    -- late return of an already-reviewed answer (public.return_for_revision).
    insert into public.notifications (recipient_id, event_type, assignment_id, assignment_question_id, submission_id, student_id)
    values (c.student_id, 'returned_for_revision', c.assignment_id, c.aq_id, new.submission_id, c.student_id)
    on conflict (recipient_id, event_type, submission_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger feedback_notify after update on public.feedback
  for each row execute function private.notify_feedback_change();

-- =====================================================================
-- PRIVILEGES — client may read own rows and mark them read; nothing else.
-- =====================================================================
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.notifications enable row level security;

create policy "notifications: recipient reads own" on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy "notifications: recipient marks own read" on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

-- =====================================================================
-- VIEW — "דורש טיפול" for the student, symmetric to teacher_review_queue.
-- Derived, security_invoker (caller's own RLS on answers/answer_submissions/
-- feedback applies) — no new stored state, no new RLS policies needed.
-- =====================================================================
create view public.student_pending_actions with (security_invoker = true) as
select an.id                 as answer_id,
       an.assignment_question_id,
       aq.assignment_id,
       an.student_id,
       ls.id                 as submission_id,
       ls.attempt_number,
       f.returned_at
from public.answers an
join public.assignment_questions aq on aq.id = an.assignment_question_id
join lateral (
  select s.id, s.attempt_number
  from public.answer_submissions s
  where s.answer_id = an.id
  order by s.attempt_number desc
  limit 1
) ls on true
join public.feedback f on f.submission_id = ls.id
where an.status = 'draft'
  and f.released_at is not null
  and f.return_for_revision
  and private.is_my_answer(an.id);

revoke all on public.student_pending_actions from anon, authenticated;
grant select on public.student_pending_actions to authenticated;

-- =====================================================================
-- function privileges
-- =====================================================================
revoke all on function private.notify_submission_received(), private.notify_feedback_change() from public;

insert into private.applied_migrations (version, name) values ('20260926000100', 'notifications');

commit;
