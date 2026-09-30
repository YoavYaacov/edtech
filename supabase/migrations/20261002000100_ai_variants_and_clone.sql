-- =====================================================================
-- Migration: 20261002000100_ai_variants_and_clone
-- Phase 6 final round — C2 (AI-assisted question language variants) + C3 (clone an assignment to another language)
--
-- C2  public.ai_variant_runs — audit trail of AI variant PROPOSALS.
--       * A row is a RECORD. Nothing reads it to create, save or publish a variant; the teacher's explicit
--         "save" goes through the existing save_question_variant RPC (origin = ai_proposed / ai_proposed_edited).
--       * Written ONLY by the ai-variant Edge Function (service role). Clients can read their own runs only.
--       * No PII, no prompt, no API key. structured_result holds the validated proposal (teacher-authored
--         question content), NULL unless status = 'ok'. input_hash identifies the exact input without storing it.
--       * Immutable except teacher_action, set once through set_ai_variant_run_action().
--       * question_id FK is ON DELETE CASCADE (deliberate exception to decision 25): the row holds no history
--         worth protecting and must never block a question delete; same reasoning as ai_runs -> submissions.
--
-- C3  assignment_clone_preflight / clone_assignment_to_language
--       * Preflight: every question of the source assignment must have content for the target language
--         (language-neutral, base = target, unclassified = primary, or an existing variant) — the SAME
--         private.resolve_question rules as publishing. Missing => a list; NOTHING is created (no partial clone).
--       * Clone = a NEW draft assignment: same course, title (given or derived), instructions, due date,
--         question order and hint/solution policies, programming_language = target.
--         NOT copied: recipients, status/published/closed dates, answers, submissions, reviews, reveals, snapshots.
--       * The snapshot of the clone is written by publish_assignment (v2) when the teacher publishes it, exactly
--         like any other draft. The source assignment and its snapshot are never read for content and never written.
--       * No AI is invoked. Variants must already exist (C2 helps the teacher create them first).
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20261001000100') then
    raise exception 'Run 20261001000100_course_sort_order.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20261002000100') then
    raise exception 'Migration 20261002000100 already applied.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- C2: ai_variant_runs
-- ---------------------------------------------------------------------
create table public.ai_variant_runs (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null references public.profiles (id) on delete restrict,
  question_id       uuid not null references public.questions (id) on delete cascade,
  source_language   text not null check (char_length(source_language) between 1 and 30),
  target_language   text not null check (char_length(target_language) between 1 and 30),
  provider          text not null check (char_length(provider) between 1 and 40),
  model             text not null check (char_length(model) between 1 and 100),
  prompt_version    text not null check (char_length(prompt_version) between 1 and 60),
  input_hash        text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  status            text not null check (status in ('ok', 'error', 'timeout', 'quota_exceeded', 'invalid_output')),
  latency_ms        integer check (latency_ms is null or latency_ms >= 0),
  structured_result jsonb,
  error_message     text check (error_message is null or char_length(error_message) <= 200),
  -- what the teacher did with the proposal: saved as-is / saved after editing / discarded
  teacher_action    text check (teacher_action is null or teacher_action in ('saved', 'saved_edited', 'discarded')),
  created_at        timestamptz not null default now(),
  constraint ai_variant_runs_result_iff_ok check ((status = 'ok') = (structured_result is not null))
);
create index ai_variant_runs_question_idx on public.ai_variant_runs (question_id, created_at desc);
create index ai_variant_runs_teacher_idx  on public.ai_variant_runs (teacher_id, created_at desc);

create or replace function private.guard_ai_variant_run()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.teacher_id is distinct from old.teacher_id
     or new.question_id is distinct from old.question_id or new.source_language is distinct from old.source_language
     or new.target_language is distinct from old.target_language or new.provider is distinct from old.provider
     or new.model is distinct from old.model or new.prompt_version is distinct from old.prompt_version
     or new.input_hash is distinct from old.input_hash or new.status is distinct from old.status
     or new.latency_ms is distinct from old.latency_ms or new.structured_result is distinct from old.structured_result
     or new.error_message is distinct from old.error_message or new.created_at is distinct from old.created_at then
    raise exception 'ai_variant_runs rows are immutable (only teacher_action may change)';
  end if;
  return new;
end;
$$;
create trigger ai_variant_runs_guard before update on public.ai_variant_runs
  for each row execute function private.guard_ai_variant_run();

revoke all on public.ai_variant_runs from anon, authenticated;
grant select on public.ai_variant_runs to authenticated;
grant select, insert on public.ai_variant_runs to service_role;
alter table public.ai_variant_runs enable row level security;
create policy "ai_variant_runs: teacher reads own" on public.ai_variant_runs for select to authenticated
  using (teacher_id = (select auth.uid()));

-- The teacher's reaction, recorded once, only by the owner. Best-effort from the client.
revoke all on function private.guard_ai_variant_run() from public;

create or replace function public.set_ai_variant_run_action(p_run_id uuid, p_action text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if p_action not in ('saved', 'saved_edited', 'discarded') then
    raise exception 'invalid action' using errcode = '22023';
  end if;
  update public.ai_variant_runs set teacher_action = p_action
  where id = p_run_id and teacher_id = (select auth.uid()) and teacher_action is null and status = 'ok';
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;
revoke all on function public.set_ai_variant_run_action(uuid, text) from public, anon;
grant execute on function public.set_ai_variant_run_action(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- C3: preflight + clone
-- ---------------------------------------------------------------------
-- Items that block cloning to p_target: [{ question_id, title, kind: missing_variant | unclassified | archived }]
create or replace function private.clone_blockers(p_source_id uuid, p_target text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('question_id', x.question_id, 'title', x.title, 'kind', x.kind) order by x.position), '[]'::jsonb)
  from (
    select aq.position, q.id as question_id, q.title,
           case when q.status = 'archived' then 'archived'
                else private.resolve_question(q.id, p_target) ->> 'reason' end as kind
    from public.assignment_questions aq join public.questions q on q.id = aq.question_id
    where aq.assignment_id = p_source_id
  ) x
  where x.kind is not null;
$$;
revoke all on function private.clone_blockers(uuid, text) from public, anon, authenticated;

create or replace function public.assignment_clone_preflight(p_source_id uuid, p_target_language text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_a public.assignments;
  v_items jsonb;
begin
  select * into v_a from public.assignments where id = p_source_id;
  if v_a.id is null or v_a.owner_id <> (select auth.uid()) then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  if v_a.programming_language is null then return jsonb_build_object('ok', false, 'reason', 'not_programming'); end if;
  if not exists (select 1 from public.course_languages where course_id = v_a.course_id and programming_language = p_target_language) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_language');
  end if;
  if p_target_language = v_a.programming_language then return jsonb_build_object('ok', false, 'reason', 'same_language'); end if;
  if not exists (select 1 from public.assignment_questions where assignment_id = p_source_id) then
    return jsonb_build_object('ok', false, 'reason', 'no_questions');
  end if;
  v_items := private.clone_blockers(p_source_id, p_target_language);
  if jsonb_array_length(v_items) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'variants_missing', 'items', v_items, 'language', p_target_language);
  end if;
  return jsonb_build_object('ok', true, 'language', p_target_language);
end;
$$;
revoke all on function public.assignment_clone_preflight(uuid, text) from public, anon;
grant execute on function public.assignment_clone_preflight(uuid, text) to authenticated;

create or replace function public.clone_assignment_to_language(p_source_id uuid, p_target_language text, p_title text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_a       public.assignments;
  v_pre     jsonb;
  v_new     uuid;
  v_title   text;
begin
  -- lock the source row so the check and the copy see one consistent state
  select * into v_a from public.assignments where id = p_source_id for share;
  if v_a.id is null or v_a.owner_id <> (select auth.uid()) then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;

  v_pre := public.assignment_clone_preflight(p_source_id, p_target_language);
  if not (v_pre ->> 'ok')::boolean then return v_pre; end if;   -- nothing has been written

  v_title := nullif(btrim(coalesce(p_title, '')), '');
  if v_title is null then v_title := v_a.title; end if;
  v_title := left(v_title, 200);

  insert into public.assignments (owner_id, course_id, title, instructions_md, due_at, status, programming_language)
  values (v_a.owner_id, v_a.course_id, v_title, v_a.instructions_md, v_a.due_at, 'draft', p_target_language)
  returning id into v_new;

  insert into public.assignment_questions (assignment_id, question_id, position, hint_policy, solution_policy)
  select v_new, aq.question_id, aq.position, aq.hint_policy, aq.solution_policy
  from public.assignment_questions aq where aq.assignment_id = p_source_id order by aq.position;

  return jsonb_build_object('ok', true, 'assignment_id', v_new);
end;
$$;
revoke all on function public.clone_assignment_to_language(uuid, text, text) from public, anon;
grant execute on function public.clone_assignment_to_language(uuid, text, text) to authenticated;

insert into private.applied_migrations (version, name) values ('20261002000100', 'ai_variants_and_clone');

commit;
