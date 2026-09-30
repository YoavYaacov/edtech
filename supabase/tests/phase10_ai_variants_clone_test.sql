-- =====================================================================
-- Phase 10 tests — C2 audit table (ai_variant_runs) + C3 clone to another language.
-- FAKE users, everything ROLLED BACK. Requires migrations up to 20261002000100.
-- =====================================================================
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000001001', 'p10-a@example.invalid'),
  ('00000000-0000-4000-8000-000000001002', 'p10-b@example.invalid'),
  ('00000000-0000-4000-8000-000000001011', 'p10-java@example.invalid'),
  ('00000000-0000-4000-8000-000000001012', 'p10-cs@example.invalid');
update public.profiles set role = 'teacher' where id in ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000001002');
insert into public.teacher_students (teacher_id, student_id) values
  ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000001011'),
  ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000001012');
insert into public.courses (id, owner_id, title, programming_language) values
  ('00000000-0000-4000-8000-0000000010c1', '00000000-0000-4000-8000-000000001001', 'CS', 'java'),
  ('00000000-0000-4000-8000-0000000010c2', '00000000-0000-4000-8000-000000001001', 'מתמטיקה', null);
insert into public.course_languages (course_id, programming_language) values ('00000000-0000-4000-8000-0000000010c1', 'csharp');
insert into public.course_enrollments (course_id, student_id, programming_language) values
  ('00000000-0000-4000-8000-0000000010c1', '00000000-0000-4000-8000-000000001011', 'java'),
  ('00000000-0000-4000-8000-0000000010c1', '00000000-0000-4000-8000-000000001012', 'csharp');

-- q1: Java base + (later) C# variant; q2: language-neutral; q3: Java base, NO variant
insert into public.questions (id, owner_id, course_id, title, body_md, question_type, programming_language, starter_code, status) values
  ('00000000-0000-4000-8000-0000000010f1', '00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-0000000010c1', 'סכום', 'סכמו', 'code', 'java', 'int sum(int[] a){}', 'ready'),
  ('00000000-0000-4000-8000-0000000010f3', '00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-0000000010c1', 'מקסימום', 'מצאו', 'code', 'java', 'int max(int[] a){}', 'ready');
insert into public.questions (id, owner_id, course_id, title, body_md, question_type, is_language_neutral, status) values
  ('00000000-0000-4000-8000-0000000010f2', '00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-0000000010c1', 'הסבר על סיבוכיות', 'הסבירו', 'text', true, 'ready');

insert into public.assignments (id, owner_id, course_id, title, instructions_md, due_at) values
  ('00000000-0000-4000-8000-0000000010a1', '00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-0000000010c1', 'מטלה 3 – לולאות', 'בהצלחה!', now() + interval '7 days');
insert into public.assignment_questions (id, assignment_id, question_id, position, hint_policy, solution_policy) values
  ('00000000-0000-4000-8000-000000010a11', '00000000-0000-4000-8000-0000000010a1', '00000000-0000-4000-8000-0000000010f1', 1, 'on_request', 'after_submit'),
  ('00000000-0000-4000-8000-000000010a12', '00000000-0000-4000-8000-0000000010a1', '00000000-0000-4000-8000-0000000010f2', 2, 'locked', 'locked'),
  ('00000000-0000-4000-8000-000000010a13', '00000000-0000-4000-8000-0000000010a1', '00000000-0000-4000-8000-0000000010f3', 3, 'on_request', 'after_submit');
insert into public.assignment_students (assignment_id, student_id) values
  ('00000000-0000-4000-8000-0000000010a1', '00000000-0000-4000-8000-000000001011');

-- publish the SOURCE (Java) as teacher A, then fingerprint it
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001001","role":"authenticated"}', true);
do $$ begin
  assert (public.publish_assignment('00000000-0000-4000-8000-0000000010a1') ->> 'ok')::boolean, 'FAIL setup: publish source';
end $$;
reset role;
create temp table fp_before as
  select (select md5(string_agg(x::text, '|' order by x.id)) from public.assignment_questions x where x.assignment_id = '00000000-0000-4000-8000-0000000010a1') as aq,
         (select md5(string_agg(h::text, '|' order by h.assignment_question_id, h.level)) from public.assignment_question_hints h join public.assignment_questions q on q.id = h.assignment_question_id where q.assignment_id = '00000000-0000-4000-8000-0000000010a1') as hints,
         (select md5(string_agg(s::text, '|' order by s.assignment_question_id)) from public.assignment_question_solutions s join public.assignment_questions q on q.id = s.assignment_question_id where q.assignment_id = '00000000-0000-4000-8000-0000000010a1') as sols,
         (select md5(a::text) from public.assignments a where a.id = '00000000-0000-4000-8000-0000000010a1') as asg,
         (select md5(string_agg(r::text, '|' order by r.student_id)) from public.assignment_students r where r.assignment_id = '00000000-0000-4000-8000-0000000010a1') as rec;
grant select on fp_before to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001001","role":"authenticated"}', true);
do $$
declare r jsonb; n_before int; n_after int;
begin
  select count(*) into n_before from public.assignments;

  -- T1 preflight: q3 has no C# variant -> blocked, lists exactly that question, creates nothing
  r := public.assignment_clone_preflight('00000000-0000-4000-8000-0000000010a1', 'csharp');
  assert not (r ->> 'ok')::boolean and r ->> 'reason' = 'variants_missing', 'FAIL T1 reason: ' || r::text;
  assert jsonb_array_length(r -> 'items') = 2, 'FAIL T1 items (q1 and q3 lack a variant): ' || r::text;
  assert exists (select 1 from jsonb_array_elements(r -> 'items') i where i ->> 'question_id' = '00000000-0000-4000-8000-0000000010f3' and i ->> 'kind' = 'missing_variant'), 'FAIL T1 q3';
  raise notice 'PASS T1 preflight lists missing variants';

  -- T2 clone is refused and NOTHING is created (no partial clone)
  r := public.clone_assignment_to_language('00000000-0000-4000-8000-0000000010a1', 'csharp', 'C# – לולאות');
  assert not (r ->> 'ok')::boolean and r ->> 'reason' = 'variants_missing', 'FAIL T2';
  select count(*) into n_after from public.assignments;
  assert n_after = n_before, 'FAIL T2 partial clone created an assignment';
  raise notice 'PASS T2 blocked clone creates nothing';

  -- T3 other validations
  assert public.assignment_clone_preflight('00000000-0000-4000-8000-0000000010a1', 'java') ->> 'reason' = 'same_language', 'FAIL T3 same';
  assert public.assignment_clone_preflight('00000000-0000-4000-8000-0000000010a1', 'python') ->> 'reason' = 'invalid_language', 'FAIL T3 lang';
  raise notice 'PASS T3 same / unsupported language';

  -- create the missing variants (manual path, as the UI does)
  perform public.save_question_variant(jsonb_build_object('question_id', '00000000-0000-4000-8000-0000000010f1', 'programming_language', 'csharp',
     'starter_code', 'int Sum(int[] a){}', 'solution_code', 'return a.Sum();', 'explanation_md', 'LINQ', 'origin', 'ai_proposed_edited'));
  perform public.save_question_variant(jsonb_build_object('question_id', '00000000-0000-4000-8000-0000000010f3', 'programming_language', 'csharp',
     'starter_code', 'int Max(int[] a){}', 'solution_code', 'return a.Max();', 'explanation_md', ''));
end $$;

do $$
declare r jsonb; v_new uuid;
begin
  -- T4 clone succeeds now
  r := public.clone_assignment_to_language('00000000-0000-4000-8000-0000000010a1', 'csharp', '  C# – לולאות ');
  assert (r ->> 'ok')::boolean, 'FAIL T4 ' || r::text;
  v_new := (r ->> 'assignment_id')::uuid;
  create temp table cloned as select v_new as id;
  grant select on cloned to authenticated;

  -- T5 what the clone is, and is not
  assert (select status from public.assignments where id = v_new) = 'draft', 'FAIL T5 must be draft';
  assert (select programming_language from public.assignments where id = v_new) = 'csharp', 'FAIL T5 language';
  assert (select title from public.assignments where id = v_new) = 'C# – לולאות', 'FAIL T5 title trimmed';
  assert (select instructions_md from public.assignments where id = v_new) = 'בהצלחה!', 'FAIL T5 instructions';
  assert (select published_at from public.assignments where id = v_new) is null, 'FAIL T5 published_at';
  assert not exists (select 1 from public.assignment_students where assignment_id = v_new), 'FAIL T5 recipients must NOT be copied';
  assert (select string_agg(question_id::text || ':' || position || ':' || hint_policy || ':' || solution_policy, ',' order by position) from public.assignment_questions where assignment_id = v_new)
       = (select string_agg(question_id::text || ':' || position || ':' || hint_policy || ':' || solution_policy, ',' order by position) from public.assignment_questions where assignment_id = '00000000-0000-4000-8000-0000000010a1'), 'FAIL T5 order/policies';
  assert not exists (select 1 from public.assignment_questions where assignment_id = v_new and snapshot_at is not null), 'FAIL T5 draft has no snapshot';
  raise notice 'PASS T4/T5 clone = new separate Draft, same order/policies, no recipients, no snapshot';
end $$;

-- T6 source untouched
reset role;
do $$
declare f record; n record;
begin
  select * into f from fp_before;
  select (select md5(string_agg(x::text, '|' order by x.id)) from public.assignment_questions x where x.assignment_id = '00000000-0000-4000-8000-0000000010a1') as aq,
         (select md5(string_agg(h::text, '|' order by h.assignment_question_id, h.level)) from public.assignment_question_hints h join public.assignment_questions q on q.id = h.assignment_question_id where q.assignment_id = '00000000-0000-4000-8000-0000000010a1') as hints,
         (select md5(string_agg(s::text, '|' order by s.assignment_question_id)) from public.assignment_question_solutions s join public.assignment_questions q on q.id = s.assignment_question_id where q.assignment_id = '00000000-0000-4000-8000-0000000010a1') as sols,
         (select md5(a::text) from public.assignments a where a.id = '00000000-0000-4000-8000-0000000010a1') as asg,
         (select md5(string_agg(r::text, '|' order by r.student_id)) from public.assignment_students r where r.assignment_id = '00000000-0000-4000-8000-0000000010a1') as rec into n;
  assert f.aq = n.aq and f.hints is not distinct from n.hints and f.sols is not distinct from n.sols and f.asg = n.asg and f.rec = n.rec,
     'FAIL T6 source assignment/snapshot changed by preflight, refused clone or clone';
  assert (select status from public.assignments where id = '00000000-0000-4000-8000-0000000010a1') = 'published', 'FAIL T6 status';
  raise notice 'PASS T6 source assignment + snapshot fingerprints identical';
end $$;

-- T7 the clone publishes through the normal path: C# content, C# recipient only
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001001","role":"authenticated"}', true);
do $$
declare v_new uuid := (select id from cloned); r jsonb;
begin
  r := public.publish_assignment(v_new);
  assert r ->> 'reason' = 'no_students', 'FAIL T7 must need recipients first: ' || r::text;
  begin
    insert into public.assignment_students (assignment_id, student_id) values (v_new, '00000000-0000-4000-8000-000000001011');
    raise exception 'FAIL T7 Java student accepted on a C# clone';
  exception when check_violation then null; end;
  insert into public.assignment_students (assignment_id, student_id) values (v_new, '00000000-0000-4000-8000-000000001012');
  r := public.publish_assignment(v_new);
  assert (r ->> 'ok')::boolean, 'FAIL T7 publish ' || r::text;
  assert (select starter_code from public.assignment_questions where assignment_id = v_new and question_id = '00000000-0000-4000-8000-0000000010f1') like '%Sum%', 'FAIL T7 C# variant content';
  assert (select programming_language from public.assignment_questions where assignment_id = v_new and question_id = '00000000-0000-4000-8000-0000000010f1') = 'csharp', 'FAIL T7 snapshot language';
  assert (select programming_language from public.assignment_questions where assignment_id = '00000000-0000-4000-8000-0000000010a1' and question_id = '00000000-0000-4000-8000-0000000010f1') = 'java', 'FAIL T7 source still java';
  raise notice 'PASS T7 clone publishes with C# snapshot; source stays Java';
end $$;

-- T8 isolation: another teacher cannot preflight/clone
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001002","role":"authenticated"}', true);
do $$ begin
  begin perform public.assignment_clone_preflight('00000000-0000-4000-8000-0000000010a1', 'csharp'); raise exception 'FAIL T8 preflight'; exception when sqlstate 'P0002' then null; end;
  begin perform public.clone_assignment_to_language('00000000-0000-4000-8000-0000000010a1', 'csharp', null); raise exception 'FAIL T8 clone'; exception when sqlstate 'P0002' then null; end;
  raise notice 'PASS T8 clone is owner-only';
end $$;

-- ---------- C2: ai_variant_runs ---------------------------------------
reset role;
insert into public.ai_variant_runs (id, teacher_id, question_id, source_language, target_language, provider, model, prompt_version, input_hash, status, latency_ms, structured_result)
values ('00000000-0000-4000-8000-0000000010e1', '00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-0000000010f1', 'java', 'csharp', 'google', 'm', 'ai-variant-v1', repeat('a', 64), 'ok', 900, '{"body_md":"x"}'::jsonb),
       ('00000000-0000-4000-8000-0000000010e2', '00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-0000000010f3', 'java', 'csharp', 'google', 'm', 'ai-variant-v1', repeat('b', 64), 'timeout', 20000, null);
do $$ begin
  begin  -- ok <=> structured_result
    insert into public.ai_variant_runs (teacher_id, question_id, source_language, target_language, provider, model, prompt_version, input_hash, status)
    values ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-0000000010f1', 'java', 'csharp', 'g', 'm', 'v', repeat('c', 64), 'ok');
    raise exception 'FAIL T9 ok without result';
  exception when check_violation then null; end;
  raise notice 'PASS T9 ok <=> structured_result';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001001","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.ai_variant_runs) = 2, 'FAIL T10 teacher reads own runs';
  begin insert into public.ai_variant_runs (teacher_id, question_id, source_language, target_language, provider, model, prompt_version, input_hash, status)
        values ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-0000000010f1', 'java', 'csharp', 'g', 'm', 'v', repeat('d', 64), 'error');
        raise exception 'FAIL T10 client insert'; exception when insufficient_privilege then null; end;
  begin update public.ai_variant_runs set status = 'error'; raise exception 'FAIL T10 client update'; exception when insufficient_privilege then null; end;
  raise notice 'PASS T10 clients read own runs only; cannot forge or edit';
  -- teacher action: once, only for ok runs
  assert public.set_ai_variant_run_action('00000000-0000-4000-8000-0000000010e1', 'saved_edited'), 'FAIL T11 first';
  assert not public.set_ai_variant_run_action('00000000-0000-4000-8000-0000000010e1', 'discarded'), 'FAIL T11 second must be refused';
  assert not public.set_ai_variant_run_action('00000000-0000-4000-8000-0000000010e2', 'discarded'), 'FAIL T11 non-ok run';
  begin perform public.set_ai_variant_run_action('00000000-0000-4000-8000-0000000010e1', 'bogus'); raise exception 'FAIL T11 bogus'; exception when sqlstate '22023' then null; end;
  raise notice 'PASS T11 teacher action recorded once';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001002","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.ai_variant_runs) = 0, 'FAIL T12 other teacher must not see runs';
  assert not public.set_ai_variant_run_action('00000000-0000-4000-8000-0000000010e1', 'discarded'), 'FAIL T12 other teacher action';
  raise notice 'PASS T12 runs are private to their teacher';
end $$;
-- T13 the question variants created via the AI origin are plain variants (resolution unaffected)
reset role;
do $$ begin
  assert (select origin from public.question_variants where question_id = '00000000-0000-4000-8000-0000000010f1') = 'ai_proposed_edited', 'FAIL T13 origin';
  raise notice 'PASS T13 origin recorded on the variant';
end $$;
rollback;
