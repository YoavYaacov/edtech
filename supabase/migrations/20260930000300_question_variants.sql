-- =====================================================================
-- Migration: 20260930000300_question_variants
-- Workstream C1 (2/3) — one pedagogical question, language variants only where needed.
--
-- MODEL: "Base + Variants"
--   * The existing question row is the BASE. Its programming_language (already
--     present) says which language the base content is written in.
--       - programming_language = 'java'  -> base is the Java version
--       - NULL + is_language_neutral     -> explicitly language-neutral (works for every language)
--       - NULL + NOT is_language_neutral -> "unclassified": treated as the course's PRIMARY
--                                           language and blocked for any other language
--   * question_variants holds ONLY the other languages (e.g. csharp). NO Java copies are
--     created: existing Java questions are untouched.
--   * A variant overrides: body_md (NULL = inherit), starter_code, solution_code,
--     explanation_md, hints (NULL = inherit). Everything else (title, topics, difficulty,
--     source, tags, teacher notes) is shared.
--   * Variants are owner-only (like the rest of the question bank). Students never read
--     them: they only ever see the snapshot taken when an assignment is published.
--   * Any language already allowed by the CHECK on questions/courses works: adding
--     Python later needs no schema change.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from private.applied_migrations where version = '20260930000200') then
    raise exception 'Run 20260930000200_course_languages.sql first.';
  end if;
  if exists (select 1 from private.applied_migrations where version = '20260930000300') then
    raise exception 'Migration 20260930000300 already applied.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- questions.is_language_neutral  (explicit; default false = nothing changes for existing rows)
-- ---------------------------------------------------------------------
alter table public.questions
  add column is_language_neutral boolean not null default false,
  add constraint questions_neutral_has_no_language check (not (is_language_neutral and programming_language is not null));

grant insert (is_language_neutral) on public.questions to authenticated;
grant update (is_language_neutral) on public.questions to authenticated;

-- ---------------------------------------------------------------------
-- validation helper for the hints override
-- ---------------------------------------------------------------------
create or replace function private.valid_variant_hints(h jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select h is null or (
    jsonb_typeof(h) = 'array'
    and jsonb_array_length(h) <= 3
    and not exists (
      select 1 from jsonb_array_elements(h) e
      where jsonb_typeof(e) <> 'object'
         or (e ->> 'level') is null or (e ->> 'level') !~ '^[1-3]$'
         or coalesce(jsonb_typeof(e -> 'content_md'), '') <> 'string'
         or btrim(e ->> 'content_md') = ''
         or char_length(e ->> 'content_md') > 20000
    )
    and (select count(distinct e ->> 'level') from jsonb_array_elements(h) e) = jsonb_array_length(h)
  );
$$;

-- ---------------------------------------------------------------------
-- question_variants
-- ---------------------------------------------------------------------
create table public.question_variants (
  id                    uuid primary key default gen_random_uuid(),
  question_id           uuid not null references public.questions (id) on delete cascade,
  programming_language  text not null check (programming_language in ('java', 'python', 'csharp', 'c', 'cpp', 'javascript')),
  body_md               text check (body_md is null or char_length(body_md) <= 50000),
  starter_code          text not null default '' check (char_length(starter_code) <= 50000),
  solution_code         text not null default '' check (char_length(solution_code) <= 50000),
  explanation_md        text not null default '' check (char_length(explanation_md) <= 50000),
  hints                 jsonb check (private.valid_variant_hints(hints)),
  origin                text not null default 'manual' check (origin in ('manual', 'ai_proposed', 'ai_proposed_edited')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (question_id, programming_language)
);
create trigger question_variants_set_updated_at before update on public.question_variants
  for each row execute function private.set_updated_at();

-- A variant must be for a language the course supports, different from the base language.
create or replace function private.check_question_variant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_q public.questions; v_primary text;
begin
  select * into v_q from public.questions where id = new.question_id;
  if v_q.id is null then raise exception 'Question not found' using errcode = 'P0002'; end if;
  if v_q.is_language_neutral then
    raise exception 'language_neutral_question' using errcode = '23514';
  end if;
  select programming_language into v_primary from public.courses where id = v_q.course_id;
  if new.programming_language = coalesce(v_q.programming_language, v_primary) then
    raise exception 'variant_equals_base' using errcode = '23514';
  end if;
  if not exists (select 1 from public.course_languages
                 where course_id = v_q.course_id and programming_language = new.programming_language) then
    raise exception 'language_not_in_course' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger question_variants_check before insert or update of question_id, programming_language on public.question_variants
  for each row execute function private.check_question_variant();

-- Changing the base language / neutrality / course of a question that has variants.
create or replace function private.check_question_language_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_primary text;
begin
  if not exists (select 1 from public.question_variants where question_id = new.id) then
    return new;
  end if;
  if new.is_language_neutral then
    raise exception 'question_has_variants' using errcode = '23514';
  end if;
  select programming_language into v_primary from public.courses where id = new.course_id;
  if exists (select 1 from public.question_variants v
             where v.question_id = new.id and v.programming_language = coalesce(new.programming_language, v_primary)) then
    raise exception 'variant_language_conflict' using errcode = '23514';
  end if;
  if new.course_id <> old.course_id and exists (
    select 1 from public.question_variants v
    where v.question_id = new.id
      and not exists (select 1 from public.course_languages cl
                      where cl.course_id = new.course_id and cl.programming_language = v.programming_language)
  ) then
    raise exception 'language_not_in_course' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger questions_check_language_change
  before update of programming_language, is_language_neutral, course_id on public.questions
  for each row execute function private.check_question_language_change();

-- ---------------------------------------------------------------------
-- privileges + RLS (owner teacher only; students have NO access)
-- ---------------------------------------------------------------------
revoke all on public.question_variants from anon, authenticated;
grant select, insert, delete on public.question_variants to authenticated;
grant update (body_md, starter_code, solution_code, explanation_md, hints, origin) on public.question_variants to authenticated;
alter table public.question_variants enable row level security;

create policy "question_variants: owner all" on public.question_variants for all to authenticated
  using (private.owns_question(question_id))
  with check (private.owns_question(question_id));

revoke all on function private.valid_variant_hints(jsonb), private.check_question_variant(),
  private.check_question_language_change() from public;
grant execute on function private.valid_variant_hints(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- save_question v2 — identical to v1 plus is_language_neutral
--   (key absent in the payload = keep the current value; neutral forces language NULL)
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
  v_neutral boolean := (p ->> 'is_language_neutral')::boolean;   -- NULL when the key is absent
  v_lang    text := nullif(p ->> 'programming_language', '');
begin
  if v_id is null then
    v_neutral := coalesce(v_neutral, false);
    if v_neutral then v_lang := null; end if;
    insert into public.questions (owner_id, course_id, title, body_md, question_type, programming_language,
      is_language_neutral, starter_code, difficulty, source_type, source_year, source_exam, tags, status)
    values ((select auth.uid()), (p ->> 'course_id')::uuid, btrim(p ->> 'title'), coalesce(p ->> 'body_md', ''),
      coalesce(p ->> 'question_type', 'code'), v_lang, v_neutral,
      coalesce(p ->> 'starter_code', ''), coalesce(p ->> 'difficulty', 'intermediate'),
      coalesce(p ->> 'source_type', 'original'), nullif(p ->> 'source_year', '')::integer,
      coalesce(p ->> 'source_exam', ''), v_tags, coalesce(p ->> 'status', 'draft'))
    returning id into v_id;
  else
    delete from public.question_topics where question_id = v_id;
    if coalesce(v_neutral, (select is_language_neutral from public.questions where id = v_id), false) then
      v_lang := null;
    end if;
    update public.questions set
      course_id = (p ->> 'course_id')::uuid,
      title = btrim(p ->> 'title'),
      body_md = coalesce(p ->> 'body_md', ''),
      question_type = coalesce(p ->> 'question_type', 'code'),
      programming_language = v_lang,
      is_language_neutral = coalesce(v_neutral, is_language_neutral),
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

-- ---------------------------------------------------------------------
-- save_question_variant — upsert one variant (SECURITY INVOKER: RLS applies)
--   p = { question_id, programming_language, body_md?, starter_code, solution_code,
--         explanation_md, hints?: [{level, content_md}], origin? }
--   blank body_md / absent hints  =>  NULL (inherit from the base)
-- ---------------------------------------------------------------------
create or replace function public.save_question_variant(p jsonb)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id    uuid;
  v_body  text := case when btrim(coalesce(p ->> 'body_md', '')) = '' then null else p ->> 'body_md' end;
  v_hints jsonb := case when jsonb_typeof(p -> 'hints') = 'array' then p -> 'hints' else null end;
begin
  insert into public.question_variants
    (question_id, programming_language, body_md, starter_code, solution_code, explanation_md, hints, origin)
  values ((p ->> 'question_id')::uuid, p ->> 'programming_language', v_body,
          coalesce(p ->> 'starter_code', ''), coalesce(p ->> 'solution_code', ''),
          coalesce(p ->> 'explanation_md', ''), v_hints, coalesce(nullif(p ->> 'origin', ''), 'manual'))
  on conflict (question_id, programming_language) do update set
    body_md = excluded.body_md, starter_code = excluded.starter_code, solution_code = excluded.solution_code,
    explanation_md = excluded.explanation_md, hints = excluded.hints, origin = excluded.origin
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.save_question_variant(jsonb) from public, anon;
grant execute on function public.save_question_variant(jsonb) to authenticated;

insert into private.applied_migrations (version, name) values ('20260930000300', 'question_variants');

commit;
