-- =====================================================================
-- Migration: 20260924000200_assignments
-- Phase 3 — assignments and the student workspace.
--
-- Key decisions (project doc, decisions 28–34):
--   * Draft assignment → questions REFERENCE the bank (live).
--   * publish_assignment() takes a controlled SNAPSHOT of what the student
--     sees (title, body, starter code) and of the secret parts (hints,
--     solution) into assignment-owned tables. Later bank edits never change
--     a published assignment. question_id keeps the link to the source.
--   * Students NEVER read bank tables. They read only assignment snapshots.
--   * One assignment → one or more students (assignment_students).
--   * Hints/solution are released per student through question_reveals,
--     written only by SECURITY DEFINER functions that enforce the rules.
--   * Editing after publish: title/instructions/due date and adding
--     students only. Question list/order change only in draft.
--   * New FKs to courses/questions are ON DELETE RESTRICT (decision 25).
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20260924000100') then
    raise exception 'Run 20260924000100_safe_delete.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20260924000200') then
    raise exception 'Migration 20260924000200 already applied.';
  end if;
end $$;

-- =====================================================================
-- TABLES
-- =====================================================================
create table public.assignments (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete restrict,
  course_id        uuid not null references public.courses (id) on delete restrict,
  title            text not null check (char_length(btrim(title)) between 1 and 200),
  instructions_md  text not null default '' check (char_length(instructions_md) <= 20000),
  status           text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  due_at           timestamptz,
  published_at     timestamptz,
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index assignments_owner_idx  on public.assignments (owner_id, updated_at desc);
create index assignments_course_idx on public.assignments (course_id);
create trigger assignments_set_updated_at before update on public.assignments
  for each row execute function private.set_updated_at();

create table public.assignment_students (
  assignment_id  uuid not null references public.assignments (id) on delete cascade,
  student_id     uuid not null references public.profiles (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (assignment_id, student_id)
);
create index assignment_students_student_idx on public.assignment_students (student_id);

create table public.assignment_questions (
  id                    uuid primary key default gen_random_uuid(),
  assignment_id         uuid not null references public.assignments (id) on delete cascade,
  question_id           uuid not null references public.questions (id) on delete restrict,
  position              integer not null default 0,
  hint_policy           text not null default 'on_request' check (hint_policy in ('on_request', 'locked')),
  solution_policy       text not null default 'after_submit' check (solution_policy in ('after_submit', 'locked')),
  -- snapshot (filled by publish_assignment; NULL while draft)
  title                 text,
  body_md               text,
  question_type         text,
  programming_language  text,
  starter_code          text,
  hint_count            smallint not null default 0,
  has_solution          boolean not null default false,
  snapshot_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (assignment_id, question_id)
);
create index assignment_questions_assignment_idx on public.assignment_questions (assignment_id, position);
create index assignment_questions_question_idx on public.assignment_questions (question_id);
create trigger assignment_questions_set_updated_at before update on public.assignment_questions
  for each row execute function private.set_updated_at();

-- secret snapshot tables
create table public.assignment_question_hints (
  assignment_question_id  uuid not null references public.assignment_questions (id) on delete cascade,
  level                   smallint not null check (level between 1 and 3),
  content_md              text not null,
  primary key (assignment_question_id, level)
);

create table public.assignment_question_solutions (
  assignment_question_id  uuid primary key references public.assignment_questions (id) on delete cascade,
  solution_code           text not null default '',
  explanation_md          text not null default ''
);

-- student work
create table public.answers (
  id                      uuid primary key default gen_random_uuid(),
  assignment_question_id  uuid not null references public.assignment_questions (id) on delete cascade,
  student_id              uuid not null references public.profiles (id) on delete cascade,
  content                 text not null default '' check (char_length(content) <= 100000),
  status                  text not null default 'draft' check (status in ('draft', 'submitted')),
  draft_saved_at          timestamptz not null default now(),
  submitted_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (assignment_question_id, student_id)
);
create index answers_student_idx on public.answers (student_id);
create trigger answers_set_updated_at before update on public.answers
  for each row execute function private.set_updated_at();

create or replace function private.touch_draft_saved_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.content is distinct from old.content then
    new.draft_saved_at := now();
  end if;
  return new;
end;
$$;
create trigger answers_touch_draft before insert or update of content on public.answers
  for each row execute function private.touch_draft_saved_at();

-- immutable history: one row per submission
create table public.answer_submissions (
  id              uuid primary key default gen_random_uuid(),
  answer_id       uuid not null references public.answers (id) on delete cascade,
  attempt_number  integer not null check (attempt_number >= 1),
  content         text not null,
  submitted_at    timestamptz not null default now(),
  unique (answer_id, attempt_number)
);

-- which hints / solution were released to which student
create table public.question_reveals (
  assignment_question_id  uuid not null references public.assignment_questions (id) on delete cascade,
  student_id              uuid not null references public.profiles (id) on delete cascade,
  kind                    text not null check (kind in ('hint', 'solution')),
  level                   smallint not null default 0 check (level between 0 and 3),
  revealed_by             uuid not null references public.profiles (id) on delete cascade,
  revealed_at             timestamptz not null default now(),
  primary key (assignment_question_id, student_id, kind, level),
  check ((kind = 'hint' and level between 1 and 3) or (kind = 'solution' and level = 0))
);
create index question_reveals_student_idx on public.question_reveals (student_id);

-- =====================================================================
-- HELPERS (SECURITY DEFINER, schema private — not exposed to the API)
-- =====================================================================
create or replace function private.owns_assignment(p_assignment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.assignments
                 where id = p_assignment_id and owner_id = (select auth.uid()));
$$;

create or replace function private.assignment_is_draft(p_assignment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.assignments where id = p_assignment_id and status = 'draft');
$$;

-- caller is a recipient of a visible (published/closed) assignment
create or replace function private.is_recipient(p_assignment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignment_students s
    join public.assignments a on a.id = s.assignment_id
    where s.assignment_id = p_assignment_id
      and s.student_id = (select auth.uid())
      and a.status in ('published', 'closed')
  );
$$;

create or replace function private.aq_assignment(p_aq_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select assignment_id from public.assignment_questions where id = p_aq_id;
$$;

create or replace function private.owns_aq(p_aq_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.owns_assignment(private.aq_assignment(p_aq_id));
$$;

-- caller may edit a draft answer: recipient of a PUBLISHED (not closed) assignment
create or replace function private.can_work_on_aq(p_aq_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignment_questions q
    join public.assignments a on a.id = q.assignment_id
    join public.assignment_students s on s.assignment_id = a.id and s.student_id = (select auth.uid())
    where q.id = p_aq_id and a.status = 'published'
  );
$$;

create or replace function private.has_reveal(p_aq_id uuid, p_kind text, p_level smallint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.question_reveals
    where assignment_question_id = p_aq_id and student_id = (select auth.uid())
      and kind = p_kind and level = p_level
  );
$$;

create or replace function private.owns_answer(p_answer_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.answers a
                 where a.id = p_answer_id and private.owns_aq(a.assignment_question_id));
$$;

create or replace function private.is_my_answer(p_answer_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.answers where id = p_answer_id and student_id = (select auth.uid()));
$$;

-- =====================================================================
-- INTEGRITY TRIGGERS
-- =====================================================================
-- A question in an assignment: same course, same owner, not archived.
create or replace function private.check_assignment_question()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_a public.assignments;
  v_q public.questions;
begin
  select * into v_a from public.assignments where id = new.assignment_id;
  select * into v_q from public.questions where id = new.question_id;
  if tg_op = 'UPDATE' then
    if new.question_id <> old.question_id or new.assignment_id <> old.assignment_id then
      raise exception 'Question/assignment of an assignment item cannot change';
    end if;
    if v_a.status <> 'draft' and new.position <> old.position then
      raise exception 'Question order can change only while the assignment is a draft';
    end if;
    return new;
  end if;
  if v_q.course_id <> v_a.course_id then
    raise exception 'Question belongs to another course';
  end if;
  if v_q.owner_id <> v_a.owner_id then
    raise exception 'Question belongs to another teacher';
  end if;
  if v_q.status = 'archived' then
    raise exception 'Archived questions cannot be added to an assignment';
  end if;
  return new;
end;
$$;
create trigger assignment_questions_check before insert or update on public.assignment_questions
  for each row execute function private.check_assignment_question();

-- A recipient must be a student enrolled in the assignment's course.
create or replace function private.check_assignment_student()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.assignments a
    join public.course_enrollments e on e.course_id = a.course_id and e.student_id = new.student_id
    where a.id = new.assignment_id
  ) then
    raise exception 'Student is not enrolled in the assignment''s course';
  end if;
  return new;
end;
$$;
create trigger assignment_students_check before insert on public.assignment_students
  for each row execute function private.check_assignment_student();

-- =====================================================================
-- PRIVILEGES (column-level; status/snapshot never client-writable)
-- =====================================================================
revoke all on public.assignments, public.assignment_students, public.assignment_questions,
  public.assignment_question_hints, public.assignment_question_solutions,
  public.answers, public.answer_submissions, public.question_reveals from anon, authenticated;

grant select, delete on public.assignments to authenticated;
grant insert (owner_id, course_id, title, instructions_md, due_at) on public.assignments to authenticated;
grant update (title, instructions_md, due_at) on public.assignments to authenticated;

grant select, insert, delete on public.assignment_students to authenticated;

grant select, delete on public.assignment_questions to authenticated;
grant insert (assignment_id, question_id, position, hint_policy, solution_policy) on public.assignment_questions to authenticated;
grant update (position, hint_policy, solution_policy) on public.assignment_questions to authenticated;

grant select on public.assignment_question_hints, public.assignment_question_solutions to authenticated;

grant select on public.answers to authenticated;
grant insert (assignment_question_id, student_id, content) on public.answers to authenticated;
grant update (content) on public.answers to authenticated;

grant select on public.answer_submissions, public.question_reveals to authenticated;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.assignments                   enable row level security;
alter table public.assignment_students           enable row level security;
alter table public.assignment_questions          enable row level security;
alter table public.assignment_question_hints     enable row level security;
alter table public.assignment_question_solutions enable row level security;
alter table public.answers                       enable row level security;
alter table public.answer_submissions            enable row level security;
alter table public.question_reveals              enable row level security;

-- assignments
create policy "assignments: owner reads" on public.assignments for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "assignments: recipient reads visible" on public.assignments for select to authenticated
  using (status in ('published', 'closed') and private.is_recipient(id));
create policy "assignments: teacher creates in own course" on public.assignments for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.is_teacher() and private.owns_course(course_id));
create policy "assignments: owner updates" on public.assignments for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "assignments: owner deletes drafts" on public.assignments for delete to authenticated
  using (owner_id = (select auth.uid()) and status = 'draft');

-- assignment_students
create policy "assignment_students: owner reads" on public.assignment_students for select to authenticated
  using (private.owns_assignment(assignment_id));
create policy "assignment_students: student reads own visible" on public.assignment_students for select to authenticated
  using (student_id = (select auth.uid()) and private.is_recipient(assignment_id));
create policy "assignment_students: owner adds own students" on public.assignment_students for insert to authenticated
  with check (private.owns_assignment(assignment_id) and private.teaches(student_id));
create policy "assignment_students: owner removes if not started" on public.assignment_students for delete to authenticated
  using (
    private.owns_assignment(assignment_id)
    and not exists (select 1 from public.answers an join public.assignment_questions q on q.id = an.assignment_question_id
                    where q.assignment_id = assignment_students.assignment_id and an.student_id = assignment_students.student_id)
    and not exists (select 1 from public.question_reveals r join public.assignment_questions q on q.id = r.assignment_question_id
                    where q.assignment_id = assignment_students.assignment_id and r.student_id = assignment_students.student_id)
  );

-- assignment_questions
create policy "assignment_questions: owner reads" on public.assignment_questions for select to authenticated
  using (private.owns_assignment(assignment_id));
create policy "assignment_questions: recipient reads" on public.assignment_questions for select to authenticated
  using (private.is_recipient(assignment_id));
create policy "assignment_questions: owner adds in draft" on public.assignment_questions for insert to authenticated
  with check (private.owns_assignment(assignment_id) and private.assignment_is_draft(assignment_id));
create policy "assignment_questions: owner updates" on public.assignment_questions for update to authenticated
  using (private.owns_assignment(assignment_id)) with check (private.owns_assignment(assignment_id));
create policy "assignment_questions: owner removes in draft" on public.assignment_questions for delete to authenticated
  using (private.owns_assignment(assignment_id) and private.assignment_is_draft(assignment_id));

-- secret snapshots: only if released to THIS student
create policy "aq_hints: owner reads" on public.assignment_question_hints for select to authenticated
  using (private.owns_aq(assignment_question_id));
create policy "aq_hints: student reads revealed" on public.assignment_question_hints for select to authenticated
  using (private.has_reveal(assignment_question_id, 'hint', level)
         and private.is_recipient(private.aq_assignment(assignment_question_id)));
create policy "aq_solutions: owner reads" on public.assignment_question_solutions for select to authenticated
  using (private.owns_aq(assignment_question_id));
create policy "aq_solutions: student reads revealed" on public.assignment_question_solutions for select to authenticated
  using (private.has_reveal(assignment_question_id, 'solution', 0::smallint)
         and private.is_recipient(private.aq_assignment(assignment_question_id)));

-- answers
create policy "answers: student reads own" on public.answers for select to authenticated
  using (student_id = (select auth.uid()));
create policy "answers: owner teacher reads" on public.answers for select to authenticated
  using (private.owns_aq(assignment_question_id));
create policy "answers: student starts own draft" on public.answers for insert to authenticated
  with check (student_id = (select auth.uid()) and private.can_work_on_aq(assignment_question_id));
create policy "answers: student edits own draft" on public.answers for update to authenticated
  using (student_id = (select auth.uid()) and status = 'draft' and private.can_work_on_aq(assignment_question_id))
  with check (student_id = (select auth.uid()) and status = 'draft' and private.can_work_on_aq(assignment_question_id));

-- answer_submissions / question_reveals: read-only for clients
create policy "submissions: student reads own" on public.answer_submissions for select to authenticated
  using (private.is_my_answer(answer_id));
create policy "submissions: owner teacher reads" on public.answer_submissions for select to authenticated
  using (private.owns_answer(answer_id));
create policy "reveals: student reads own" on public.question_reveals for select to authenticated
  using (student_id = (select auth.uid()));
create policy "reveals: owner teacher reads" on public.question_reveals for select to authenticated
  using (private.owns_aq(assignment_question_id));

-- =====================================================================
-- RPC — TEACHER
-- =====================================================================
create or replace function public.publish_assignment(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_a public.assignments;
  v_questions int;
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

  -- snapshot: what the student sees
  update public.assignment_questions aq set
    title = q.title, body_md = q.body_md, question_type = q.question_type,
    programming_language = q.programming_language, starter_code = q.starter_code,
    hint_count = (select count(*) from public.question_hints h where h.question_id = q.id),
    has_solution = exists (select 1 from public.question_solutions s where s.question_id = q.id
                           and (btrim(s.solution_code) <> '' or btrim(s.explanation_md) <> '')),
    snapshot_at = now()
  from public.questions q
  where q.id = aq.question_id and aq.assignment_id = p_assignment_id;

  -- snapshot: secret parts (levels renumbered 1..n in order)
  insert into public.assignment_question_hints (assignment_question_id, level, content_md)
  select aq.id, row_number() over (partition by aq.id order by h.level), h.content_md
  from public.assignment_questions aq join public.question_hints h on h.question_id = aq.question_id
  where aq.assignment_id = p_assignment_id;

  insert into public.assignment_question_solutions (assignment_question_id, solution_code, explanation_md)
  select aq.id, s.solution_code, s.explanation_md
  from public.assignment_questions aq join public.question_solutions s on s.question_id = aq.question_id
  where aq.assignment_id = p_assignment_id and aq.has_solution;

  update public.assignments set status = 'published', published_at = now(), closed_at = null
  where id = p_assignment_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- back to draft: only if no student has started (no answers, no reveals)
create or replace function public.unpublish_assignment(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_a public.assignments;
begin
  select * into v_a from public.assignments where id = p_assignment_id for update;
  if v_a.id is null or v_a.owner_id <> (select auth.uid()) then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  if v_a.status = 'draft' then
    return jsonb_build_object('ok', false, 'reason', 'already_draft');
  end if;
  if exists (select 1 from public.answers an join public.assignment_questions q on q.id = an.assignment_question_id
             where q.assignment_id = p_assignment_id)
     or exists (select 1 from public.question_reveals r join public.assignment_questions q on q.id = r.assignment_question_id
                where q.assignment_id = p_assignment_id) then
    return jsonb_build_object('ok', false, 'reason', 'students_started');
  end if;
  delete from public.assignment_question_hints where assignment_question_id in
    (select id from public.assignment_questions where assignment_id = p_assignment_id);
  delete from public.assignment_question_solutions where assignment_question_id in
    (select id from public.assignment_questions where assignment_id = p_assignment_id);
  update public.assignment_questions set title = null, body_md = null, question_type = null,
    programming_language = null, starter_code = null, hint_count = 0, has_solution = false, snapshot_at = null
  where assignment_id = p_assignment_id;
  update public.assignments set status = 'draft', published_at = null, closed_at = null where id = p_assignment_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- published ⇄ closed
create or replace function public.set_assignment_closed(p_assignment_id uuid, p_closed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_a public.assignments;
begin
  select * into v_a from public.assignments where id = p_assignment_id for update;
  if v_a.id is null or v_a.owner_id <> (select auth.uid()) then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  if p_closed and v_a.status = 'published' then
    update public.assignments set status = 'closed', closed_at = now() where id = p_assignment_id;
  elsif not p_closed and v_a.status = 'closed' then
    update public.assignments set status = 'published', closed_at = null where id = p_assignment_id;
  else
    return jsonb_build_object('ok', false, 'reason', 'bad_transition');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- =====================================================================
-- RPC — STUDENT
-- =====================================================================
-- Autosave. SECURITY INVOKER: RLS decides (own draft, published, recipient).
create or replace function public.save_answer(p_assignment_question_id uuid, p_content text)
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare v_saved timestamptz;
begin
  insert into public.answers (assignment_question_id, student_id, content)
  values (p_assignment_question_id, (select auth.uid()), coalesce(p_content, ''))
  on conflict (assignment_question_id, student_id) do update set content = excluded.content
  returning draft_saved_at into v_saved;
  if v_saved is null then
    raise exception 'Answer cannot be edited' using errcode = '42501';
  end if;
  return v_saved;
end;
$$;

create or replace function public.submit_answer(p_assignment_question_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_answer public.answers;
  v_attempt int;
begin
  if not exists (
    select 1 from public.assignment_questions q
    join public.assignments a on a.id = q.assignment_id
    join public.assignment_students s on s.assignment_id = a.id and s.student_id = v_uid
    where q.id = p_assignment_question_id and a.status = 'published'
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_answer from public.answers
  where assignment_question_id = p_assignment_question_id and student_id = v_uid for update;
  if v_answer.id is null or btrim(v_answer.content) = '' then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;
  if v_answer.status <> 'draft' then
    return jsonb_build_object('ok', false, 'reason', 'already_submitted');
  end if;
  select coalesce(max(attempt_number), 0) + 1 into v_attempt
  from public.answer_submissions where answer_id = v_answer.id;
  insert into public.answer_submissions (answer_id, attempt_number, content)
  values (v_answer.id, v_attempt, v_answer.content);
  update public.answers set status = 'submitted', submitted_at = now() where id = v_answer.id;
  return jsonb_build_object('ok', true, 'attempt', v_attempt);
end;
$$;

-- Reveal the NEXT hint (in order), if the rule allows it.
create or replace function public.reveal_hint(p_assignment_question_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_q public.assignment_questions;
  v_next smallint;
begin
  select q.* into v_q from public.assignment_questions q
  join public.assignments a on a.id = q.assignment_id
  join public.assignment_students s on s.assignment_id = a.id and s.student_id = v_uid
  where q.id = p_assignment_question_id and a.status in ('published', 'closed');
  if v_q.id is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_q.hint_policy <> 'on_request' then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;
  select coalesce(max(level), 0) + 1 into v_next from public.question_reveals
  where assignment_question_id = v_q.id and student_id = v_uid and kind = 'hint';
  if v_next > v_q.hint_count then
    return jsonb_build_object('ok', false, 'reason', 'no_more_hints');
  end if;
  insert into public.question_reveals (assignment_question_id, student_id, kind, level, revealed_by)
  values (v_q.id, v_uid, 'hint', v_next, v_uid);
  return jsonb_build_object('ok', true, 'level', v_next);
end;
$$;

-- Reveal the solution: rule 'after_submit' + the student's answer is submitted.
create or replace function public.reveal_solution(p_assignment_question_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_q public.assignment_questions;
begin
  select q.* into v_q from public.assignment_questions q
  join public.assignments a on a.id = q.assignment_id
  join public.assignment_students s on s.assignment_id = a.id and s.student_id = v_uid
  where q.id = p_assignment_question_id and a.status in ('published', 'closed');
  if v_q.id is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not v_q.has_solution then
    return jsonb_build_object('ok', false, 'reason', 'no_solution');
  end if;
  if v_q.solution_policy <> 'after_submit' then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;
  if not exists (select 1 from public.answers where assignment_question_id = v_q.id
                 and student_id = v_uid and status = 'submitted') then
    return jsonb_build_object('ok', false, 'reason', 'submit_first');
  end if;
  insert into public.question_reveals (assignment_question_id, student_id, kind, level, revealed_by)
  values (v_q.id, v_uid, 'solution', 0, v_uid)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- =====================================================================
-- function privileges
-- =====================================================================
revoke all on function
  private.owns_assignment(uuid), private.assignment_is_draft(uuid), private.is_recipient(uuid),
  private.aq_assignment(uuid), private.owns_aq(uuid), private.can_work_on_aq(uuid),
  private.has_reveal(uuid, text, smallint), private.owns_answer(uuid), private.is_my_answer(uuid),
  private.check_assignment_question(), private.check_assignment_student(), private.touch_draft_saved_at()
from public;
grant execute on function
  private.owns_assignment(uuid), private.assignment_is_draft(uuid), private.is_recipient(uuid),
  private.aq_assignment(uuid), private.owns_aq(uuid), private.can_work_on_aq(uuid),
  private.has_reveal(uuid, text, smallint), private.owns_answer(uuid), private.is_my_answer(uuid)
to authenticated;

revoke all on function
  public.publish_assignment(uuid), public.unpublish_assignment(uuid), public.set_assignment_closed(uuid, boolean),
  public.save_answer(uuid, text), public.submit_answer(uuid), public.reveal_hint(uuid), public.reveal_solution(uuid)
from public, anon;
grant execute on function
  public.publish_assignment(uuid), public.unpublish_assignment(uuid), public.set_assignment_closed(uuid, boolean),
  public.save_answer(uuid, text), public.submit_answer(uuid), public.reveal_hint(uuid), public.reveal_solution(uuid)
to authenticated;

insert into private.applied_migrations (version, name) values ('20260924000200', 'assignments');

commit;
