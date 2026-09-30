begin;
-- Post-upgrade assertions on the Production-shaped data (run after fingerprint comparison).
do $$
begin
  -- metadata backfill: Java course -> exactly one language; maths -> none
  assert (select count(*) from public.course_languages where course_id = '00000000-0000-4000-8000-0000000009c1' and programming_language = 'java') = 1
     and (select count(*) from public.course_languages) = 1, 'FAIL: course_languages backfill';
  assert not exists (select 1 from public.course_enrollments where programming_language is distinct from 'java'), 'FAIL: enrollment backfill';
  assert (select count(*) from public.assignments where programming_language = 'java') = 12, 'FAIL: assignment backfill (11 legacy + the draft twin)';
  assert not exists (select 1 from public.assignments where course_id = '00000000-0000-4000-8000-0000000009c2' and programming_language is not null), 'FAIL: maths assignments must stay language-free';
  assert (select count(*) from public.questions where is_language_neutral) = 0, 'FAIL: no question may be auto-classified';
  assert (select count(*) from public.question_variants) = 0, 'FAIL: no Java variants may be created';
  -- the 11 published/closed snapshots still say java and still have their content
  assert (select count(*) from public.assignments where status in ('published', 'closed') and id <> '00000000-0000-4000-8000-00000000a0d1') = 11, 'FAIL: 11 legacy assignments';
  assert (select count(*) from public.assignments where status = 'closed') = 2, 'FAIL: 2 closed';
  assert not exists (select 1 from public.assignment_questions aq join public.assignments a on a.id = aq.assignment_id
                     where a.status <> 'draft' and (aq.programming_language is distinct from 'java' or aq.starter_code is null or aq.body_md is null)), 'FAIL: legacy snapshot changed';
  raise notice 'PASS backfill is metadata-only; no auto-classification; no Java variants';
end $$;

-- v1 == v2: publish the draft twin AFTER the upgrade (new publish_assignment) and compare with its v1-published twin
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009a1","role":"authenticated"}', true);
select public.publish_assignment('00000000-0000-4000-8000-00000000a0d1') as r \gset
reset role;
do $$
begin
  assert (select count(*) from public.assignment_questions where assignment_id = '00000000-0000-4000-8000-00000000a0d1' and snapshot_at is not null) > 0, 'FAIL: twin not published by v2';
  assert not exists (
    select 1 from public.assignment_questions a
    join public.assignment_questions b on b.position = a.position and b.assignment_id = '00000000-0000-4000-8000-00000000a0d1'
    where a.assignment_id = '00000000-0000-4000-8000-00000000a003'
      and (a.title, a.body_md, a.question_type, a.programming_language, a.starter_code, a.hint_count, a.has_solution)
          is distinct from (b.title, b.body_md, b.question_type, b.programming_language, b.starter_code, b.hint_count, b.has_solution)), 'FAIL: v2 snapshot differs from the v1 snapshot';
  assert not exists (
    select 1 from public.assignment_questions a
    join public.assignment_questions b on b.position = a.position and b.assignment_id = '00000000-0000-4000-8000-00000000a0d1'
    where a.assignment_id = '00000000-0000-4000-8000-00000000a003'
      and ((select string_agg(level || content_md, '|' order by level) from public.assignment_question_hints where assignment_question_id = a.id)
           is distinct from (select string_agg(level || content_md, '|' order by level) from public.assignment_question_hints where assignment_question_id = b.id)
        or (select solution_code || explanation_md from public.assignment_question_solutions where assignment_question_id = a.id)
           is distinct from (select solution_code || explanation_md from public.assignment_question_solutions where assignment_question_id = b.id))), 'FAIL: v2 hints/solutions differ from v1';
  raise notice 'PASS publish_assignment v2 produces exactly the v1 snapshot for Java questions';
end $$;

-- students still read their snapshots and can work (RLS + RPCs unchanged)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009b2","role":"authenticated"}', true);
do $$
declare aq uuid;
begin
  assert (select count(*) from public.assignment_questions where programming_language = 'java') > 10, 'FAIL: student cannot read snapshots';
  select id into aq from public.assignment_questions where assignment_id = '00000000-0000-4000-8000-00000000a002' order by position limit 1;
  perform public.save_answer(aq, 'int y = 2;');
  perform public.submit_answer(aq);
  raise notice 'PASS students read snapshots and submit as before';
end $$;
reset role;

-- adding C# to the course later does NOT touch Java assignments; a Java-only question blocks a C# assignment
insert into public.course_languages (course_id, programming_language) values ('00000000-0000-4000-8000-0000000009c1', 'csharp');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009a1","role":"authenticated"}', true);
do $$
declare a uuid; r jsonb;
begin
  insert into public.assignments (owner_id, course_id, title, programming_language)
  values ('00000000-0000-4000-8000-0000000009a1', '00000000-0000-4000-8000-0000000009c1', 'C#', 'csharp') returning id into a;
  insert into public.assignment_questions (assignment_id, question_id, position)
  values (a, '00000000-0000-4000-8000-00000000d001', 1);
  r := public.assignment_language_status(a);
  assert r #>> '{items,0,status}' = 'missing_variant', 'FAIL: existing Java question must be blocked for C#';
  raise notice 'PASS existing Java questions stay Java; C# use is blocked until a variant exists';
end $$;
reset role;
rollback;
