-- =====================================================================
-- Migration: 20260923000200_questions
-- Phase 2 — question bank. Secret text (hints, solutions, teacher notes)
-- lives in separate tables (RLS is row-level, not column-level).
-- In this phase ONLY the owning teacher can read any of these tables.
-- Student access to questions (via assignments) is added in Phase 3.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20260923000100') then
    raise exception 'Run 20260923000100_content.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20260923000200') then
    raise exception 'Migration 20260923000200 already applied.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- questions
-- ---------------------------------------------------------------------
create table public.questions (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.profiles (id) on delete restrict,
  course_id             uuid not null references public.courses (id) on delete restrict,
  title                 text not null check (char_length(btrim(title)) between 1 and 300),
  body_md               text not null default '' check (char_length(body_md) <= 50000),
  question_type         text not null default 'code' check (question_type in ('code', 'text', 'tracing')),
  programming_language  text check (programming_language in ('java', 'python', 'csharp', 'c', 'cpp', 'javascript')),
  starter_code          text not null default '' check (char_length(starter_code) <= 50000),
  difficulty            text not null default 'intermediate'
                        check (difficulty in ('basic', 'intermediate', 'advanced', 'bagrut')),
  source_type           text not null default 'original'
                        check (source_type in ('original', 'homework', 'bagrut', 'exam', 'practice')),
  source_year           integer check (source_year between 1990 and 2100),
  source_exam           text not null default '' check (char_length(source_exam) <= 200),
  tags                  text[] not null default '{}' check (cardinality(tags) <= 30),
  status                text not null default 'draft' check (status in ('draft', 'ready', 'archived')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index questions_owner_idx  on public.questions (owner_id, updated_at desc);
create index questions_course_idx on public.questions (course_id);
create index questions_tags_idx   on public.questions using gin (tags);
create trigger questions_set_updated_at before update on public.questions
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- question_topics (M:N) — topic must belong to the question's course
-- ---------------------------------------------------------------------
create table public.question_topics (
  question_id  uuid not null references public.questions (id) on delete cascade,
  topic_id     uuid not null references public.topics (id) on delete restrict,
  primary key (question_id, topic_id)
);
create index question_topics_topic_idx on public.question_topics (topic_id);

create or replace function private.check_question_topic()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select course_id from public.questions where id = new.question_id)
     is distinct from (select course_id from public.topics where id = new.topic_id) then
    raise exception 'Topic belongs to another course';
  end if;
  return new;
end;
$$;
create trigger question_topics_check_course before insert or update on public.question_topics
  for each row execute function private.check_question_topic();

create or replace function private.check_question_course_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.course_id <> old.course_id and exists (
    select 1 from public.question_topics qt
    join public.topics t on t.id = qt.topic_id
    where qt.question_id = new.id and t.course_id <> new.course_id
  ) then
    raise exception 'Remove topics from the old course before changing course';
  end if;
  return new;
end;
$$;
create trigger questions_check_course_change before update of course_id on public.questions
  for each row execute function private.check_question_course_change();

-- ---------------------------------------------------------------------
-- secret content (separate tables)
-- ---------------------------------------------------------------------
create table public.question_hints (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.questions (id) on delete cascade,
  level        smallint not null check (level between 1 and 3),
  content_md   text not null check (char_length(btrim(content_md)) between 1 and 20000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (question_id, level)
);
create trigger question_hints_set_updated_at before update on public.question_hints
  for each row execute function private.set_updated_at();

create table public.question_solutions (
  question_id     uuid primary key references public.questions (id) on delete cascade,
  solution_code   text not null default '' check (char_length(solution_code) <= 50000),
  explanation_md  text not null default '' check (char_length(explanation_md) <= 50000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger question_solutions_set_updated_at before update on public.question_solutions
  for each row execute function private.set_updated_at();

create table public.question_teacher_notes (
  question_id  uuid primary key references public.questions (id) on delete cascade,
  notes_md     text not null default '' check (char_length(notes_md) <= 20000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger question_teacher_notes_set_updated_at before update on public.question_teacher_notes
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- helper
-- ---------------------------------------------------------------------
create or replace function private.owns_question(p_question_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.questions
    where id = p_question_id and owner_id = (select auth.uid())
  );
$$;
revoke all on function private.owns_question(uuid), private.check_question_topic(),
  private.check_question_course_change() from public;
grant execute on function private.owns_question(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- privileges (no DELETE on questions: archive via status)
-- ---------------------------------------------------------------------
revoke all on public.questions, public.question_topics, public.question_hints,
  public.question_solutions, public.question_teacher_notes from anon, authenticated;

grant select on public.questions to authenticated;
grant insert (owner_id, course_id, title, body_md, question_type, programming_language, starter_code,
              difficulty, source_type, source_year, source_exam, tags, status)
  on public.questions to authenticated;
grant update (course_id, title, body_md, question_type, programming_language, starter_code,
              difficulty, source_type, source_year, source_exam, tags, status)
  on public.questions to authenticated;

grant select, insert, delete on public.question_topics to authenticated;
grant select, insert, delete on public.question_hints to authenticated;
grant update (content_md) on public.question_hints to authenticated;
grant select, insert on public.question_solutions to authenticated;
grant update (solution_code, explanation_md) on public.question_solutions to authenticated;
grant select, insert on public.question_teacher_notes to authenticated;
grant update (notes_md) on public.question_teacher_notes to authenticated;

-- ---------------------------------------------------------------------
-- RLS — owner teacher only
-- ---------------------------------------------------------------------
alter table public.questions              enable row level security;
alter table public.question_topics        enable row level security;
alter table public.question_hints         enable row level security;
alter table public.question_solutions     enable row level security;
alter table public.question_teacher_notes enable row level security;

create policy "questions: owner reads"
  on public.questions for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "questions: teacher creates in own course"
  on public.questions for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.is_teacher() and private.owns_course(course_id));
create policy "questions: owner updates"
  on public.questions for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and private.owns_course(course_id));

create policy "question_topics: owner all"
  on public.question_topics for all to authenticated
  using (private.owns_question(question_id))
  with check (private.owns_question(question_id));
create policy "question_hints: owner all"
  on public.question_hints for all to authenticated
  using (private.owns_question(question_id))
  with check (private.owns_question(question_id));
create policy "question_solutions: owner all"
  on public.question_solutions for all to authenticated
  using (private.owns_question(question_id))
  with check (private.owns_question(question_id));
create policy "question_teacher_notes: owner all"
  on public.question_teacher_notes for all to authenticated
  using (private.owns_question(question_id))
  with check (private.owns_question(question_id));

-- ---------------------------------------------------------------------
-- save_question: create/update a question with its topics, hints,
-- solution and notes in ONE transaction. SECURITY INVOKER → every
-- statement is still checked by the caller's RLS.
-- ---------------------------------------------------------------------
create or replace function public.save_question(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id     uuid := nullif(p ->> 'id', '')::uuid;
  v_hint   jsonb;
  v_levels smallint[] := '{}';
  v_tags   text[] := coalesce(array(select btrim(t) from jsonb_array_elements_text(coalesce(p -> 'tags', '[]'::jsonb)) t
                                    where btrim(t) <> ''), '{}');
begin
  if v_id is null then
    insert into public.questions (owner_id, course_id, title, body_md, question_type, programming_language,
      starter_code, difficulty, source_type, source_year, source_exam, tags, status)
    values ((select auth.uid()), (p ->> 'course_id')::uuid, btrim(p ->> 'title'), coalesce(p ->> 'body_md', ''),
      coalesce(p ->> 'question_type', 'code'), nullif(p ->> 'programming_language', ''),
      coalesce(p ->> 'starter_code', ''), coalesce(p ->> 'difficulty', 'intermediate'),
      coalesce(p ->> 'source_type', 'original'), nullif(p ->> 'source_year', '')::integer,
      coalesce(p ->> 'source_exam', ''), v_tags, coalesce(p ->> 'status', 'draft'))
    returning id into v_id;
  else
    delete from public.question_topics where question_id = v_id;
    update public.questions set
      course_id = (p ->> 'course_id')::uuid,
      title = btrim(p ->> 'title'),
      body_md = coalesce(p ->> 'body_md', ''),
      question_type = coalesce(p ->> 'question_type', 'code'),
      programming_language = nullif(p ->> 'programming_language', ''),
      starter_code = coalesce(p ->> 'starter_code', ''),
      difficulty = coalesce(p ->> 'difficulty', 'intermediate'),
      source_type = coalesce(p ->> 'source_type', 'original'),
      source_year = nullif(p ->> 'source_year', '')::integer,
      source_exam = coalesce(p ->> 'source_exam', ''),
      tags = v_tags,
      status = coalesce(p ->> 'status', 'draft')
    where id = v_id;
    if not found then
      raise exception 'Question not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.question_topics (question_id, topic_id)
  select v_id, t::uuid from jsonb_array_elements_text(coalesce(p -> 'topic_ids', '[]'::jsonb)) t
  on conflict do nothing;

  for v_hint in select * from jsonb_array_elements(coalesce(p -> 'hints', '[]'::jsonb)) loop
    if btrim(coalesce(v_hint ->> 'content_md', '')) <> '' then
      insert into public.question_hints (question_id, level, content_md)
      values (v_id, (v_hint ->> 'level')::smallint, v_hint ->> 'content_md')
      on conflict (question_id, level) do update set content_md = excluded.content_md;
      v_levels := v_levels || (v_hint ->> 'level')::smallint;
    end if;
  end loop;
  delete from public.question_hints where question_id = v_id and not (level = any (v_levels));

  insert into public.question_solutions (question_id, solution_code, explanation_md)
  values (v_id, coalesce(p -> 'solution' ->> 'solution_code', ''), coalesce(p -> 'solution' ->> 'explanation_md', ''))
  on conflict (question_id) do update
    set solution_code = excluded.solution_code, explanation_md = excluded.explanation_md;

  insert into public.question_teacher_notes (question_id, notes_md)
  values (v_id, coalesce(p ->> 'teacher_notes', ''))
  on conflict (question_id) do update set notes_md = excluded.notes_md;

  return v_id;
end;
$$;

revoke all on function public.save_question(jsonb) from public, anon;
grant execute on function public.save_question(jsonb) to authenticated;

insert into private.applied_migrations (version, name) values ('20260923000200', 'questions');

commit;
