-- =====================================================================
-- Phase 8 / Workstream C1 tests — course languages, enrollment language,
-- question variants, language resolution, publish v2, no cross-language leakage.
-- Safe for the Supabase SQL Editor: FAKE users, everything ROLLED BACK.
-- Success = finishes with no error. Failure stops with "FAIL: ...".
-- Requires migrations up to 20260930000400.
-- =====================================================================
begin;

-- ---------- fixtures (as postgres) ----------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000801', 'p8-teacher-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000802', 'p8-teacher-b@example.invalid'),
  ('00000000-0000-4000-8000-000000000811', 'p8-java@example.invalid'),
  ('00000000-0000-4000-8000-000000000812', 'p8-csharp@example.invalid'),
  ('00000000-0000-4000-8000-000000000813', 'p8-math@example.invalid');
update public.profiles set role = 'teacher' where id in ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000802');
insert into public.teacher_students (teacher_id, student_id) values
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000811'),
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000812'),
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000813');

-- a Java course (primary language java) and a maths course (no language)
insert into public.courses (id, owner_id, title, programming_language) values
  ('00000000-0000-4000-8000-0000000008c1', '00000000-0000-4000-8000-000000000801', 'מדעי המחשב', 'java');
insert into public.courses (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000008c2', '00000000-0000-4000-8000-000000000801', 'מתמטיקה'),
  ('00000000-0000-4000-8000-0000000008c3', '00000000-0000-4000-8000-000000000801', 'קורס בלי שפה ראשית');

do $$
begin
  -- T1: the primary language is part of the supported set (trigger)
  assert (select count(*) from public.course_languages where course_id = '00000000-0000-4000-8000-0000000008c1') = 1
     and exists (select 1 from public.course_languages where course_id = '00000000-0000-4000-8000-0000000008c1' and programming_language = 'java'),
     'FAIL: T1 primary language not in course_languages';
  assert not exists (select 1 from public.course_languages where course_id = '00000000-0000-4000-8000-0000000008c2'),
     'FAIL: T1 maths course got a language';
  raise notice 'PASS T1: primary language is synced into course_languages';
end $$;

insert into public.course_languages (course_id, programming_language) values
  ('00000000-0000-4000-8000-0000000008c1', 'csharp'),
  ('00000000-0000-4000-8000-0000000008c3', 'java'),
  ('00000000-0000-4000-8000-0000000008c3', 'csharp');

-- ---------- T2: enrollment language ---------------------------------
insert into public.course_enrollments (course_id, student_id) values
  ('00000000-0000-4000-8000-0000000008c1', '00000000-0000-4000-8000-000000000811');   -- no language given -> primary
insert into public.course_enrollments (course_id, student_id, programming_language) values
  ('00000000-0000-4000-8000-0000000008c1', '00000000-0000-4000-8000-000000000812', 'csharp');
insert into public.course_enrollments (course_id, student_id) values
  ('00000000-0000-4000-8000-0000000008c2', '00000000-0000-4000-8000-000000000813');   -- maths: no language
do $$
begin
  assert (select programming_language from public.course_enrollments where student_id = '00000000-0000-4000-8000-000000000811'
          and course_id = '00000000-0000-4000-8000-0000000008c1') = 'java', 'FAIL: T2 default enrollment language';
  assert (select programming_language from public.course_enrollments where student_id = '00000000-0000-4000-8000-000000000813') is null,
         'FAIL: T2 maths enrollment must stay language-free';
  begin   -- language the course does not support
    insert into public.course_enrollments (course_id, student_id, programming_language)
    values ('00000000-0000-4000-8000-0000000008c1', '00000000-0000-4000-8000-000000000813', 'python');
    raise exception 'FAIL: T2 unsupported language accepted';
  exception when foreign_key_violation then null; end;
  begin   -- maths course cannot carry a language
    insert into public.course_enrollments (course_id, student_id, programming_language)
    values ('00000000-0000-4000-8000-0000000008c2', '00000000-0000-4000-8000-000000000811', 'java');
    raise exception 'FAIL: T2 language on a non-programming course accepted';
  exception when check_violation then null; end;
  begin   -- two languages, no primary, none chosen
    insert into public.course_enrollments (course_id, student_id) values
      ('00000000-0000-4000-8000-0000000008c3', '00000000-0000-4000-8000-000000000811');
    raise exception 'FAIL: T2 ambiguous enrollment accepted';
  exception when check_violation then null; end;
  begin   -- a language that students use cannot be removed from the course
    delete from public.course_languages where course_id = '00000000-0000-4000-8000-0000000008c1' and programming_language = 'csharp';
    raise exception 'FAIL: T2 language in use was removed';
  exception when foreign_key_violation then null; end;
  raise notice 'PASS T2: enrollment language rules';
end $$;

-- ---------- questions (owner A) -------------------------------------
insert into public.questions (id, owner_id, course_id, title, body_md, question_type, programming_language, starter_code, status) values
  ('00000000-0000-4000-8000-0000000008f1', '00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-0000000008c1', 'מקסימום במערך', 'כתבו פעולה שמחזירה את הגדול ביותר', 'code', 'java', 'public static int max(int[] a) {}', 'ready'),
  ('00000000-0000-4000-8000-0000000008f2', '00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-0000000008c1', 'מהי רקורסיה', 'הסבירו במילים', 'text', null, '', 'ready'),
  ('00000000-0000-4000-8000-0000000008f3', '00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-0000000008c1', 'שאלה ישנה ללא שפה', 'טקסט ישן', 'code', null, '', 'ready'),
  ('00000000-0000-4000-8000-0000000008f4', '00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-0000000008c1', 'שאלת Java בלבד', 'שאלה ללא גרסת C#', 'code', 'java', 'int f() {}', 'ready');
update public.questions set is_language_neutral = true where id = '00000000-0000-4000-8000-0000000008f2';
insert into public.question_solutions (question_id, solution_code, explanation_md) values
  ('00000000-0000-4000-8000-0000000008f1', 'int m = a[0]; // JAVA-SOLUTION', 'הסבר Java'),
  ('00000000-0000-4000-8000-0000000008f4', 'JAVA-ONLY-SOLUTION', '');
insert into public.question_hints (question_id, level, content_md) values
  ('00000000-0000-4000-8000-0000000008f1', 1, 'רמז 1 משותף'),
  ('00000000-0000-4000-8000-0000000008f1', 2, 'רמז 2 (Java: השתמשו ב-a.length)');

-- ---------- T3: variants -------------------------------------------
do $$
declare v_id uuid;
begin
  insert into public.question_variants (question_id, programming_language, starter_code, solution_code, explanation_md, hints)
  values ('00000000-0000-4000-8000-0000000008f1', 'csharp', 'public static int Max(int[] a) {}', 'int m = a[0]; // CSHARP-SOLUTION', 'הסבר C#',
          '[{"level":1,"content_md":"רמז 1 C#"},{"level":2,"content_md":"רמז 2 (C#: השתמשו ב-a.Length)"}]'::jsonb)
  returning id into v_id;

  begin  -- variant for the base language itself
    insert into public.question_variants (question_id, programming_language) values ('00000000-0000-4000-8000-0000000008f1', 'java');
    raise exception 'FAIL: T3 variant equal to base accepted';
  exception when check_violation then null; end;
  begin  -- language the course does not support
    insert into public.question_variants (question_id, programming_language) values ('00000000-0000-4000-8000-0000000008f1', 'python');
    raise exception 'FAIL: T3 unsupported language accepted';
  exception when check_violation then null; end;
  begin  -- neutral questions never have variants
    insert into public.question_variants (question_id, programming_language) values ('00000000-0000-4000-8000-0000000008f2', 'csharp');
    raise exception 'FAIL: T3 variant on a neutral question accepted';
  exception when check_violation then null; end;
  begin  -- duplicate
    insert into public.question_variants (question_id, programming_language) values ('00000000-0000-4000-8000-0000000008f1', 'csharp');
    raise exception 'FAIL: T3 duplicate variant accepted';
  exception when unique_violation then null; end;
  begin  -- malformed hints
    insert into public.question_variants (question_id, programming_language, hints)
    values ('00000000-0000-4000-8000-0000000008f4', 'csharp', '[{"level":9,"content_md":"x"}]'::jsonb);
    raise exception 'FAIL: T3 malformed hints accepted';
  exception when check_violation then null; end;
  begin  -- base cannot become neutral / change language while variants exist
    update public.questions set is_language_neutral = true, programming_language = null where id = '00000000-0000-4000-8000-0000000008f1';
    raise exception 'FAIL: T3 base made neutral while it has variants';
  exception when check_violation then null; end;
  begin
    update public.questions set programming_language = 'csharp' where id = '00000000-0000-4000-8000-0000000008f1';
    raise exception 'FAIL: T3 base language collides with a variant';
  exception when check_violation then null; end;
  begin  -- neutral + language is contradictory
    update public.questions set is_language_neutral = true where id = '00000000-0000-4000-8000-0000000008f4';
    raise exception 'FAIL: T3 neutral + language accepted';
  exception when check_violation then null; end;
  raise notice 'PASS T3: variant constraints';
end $$;

-- ---------- T4: resolution ------------------------------------------
do $$
declare r jsonb;
begin
  -- Java student: base, no variant needed
  r := private.resolve_question('00000000-0000-4000-8000-0000000008f1', 'java');
  assert (r ->> 'ok')::boolean and r ->> 'source' = 'base' and r ->> 'starter_code' like '%int[] a%' and r ->> 'solution_code' like '%JAVA-SOLUTION%',
         'FAIL: T4 java resolution';
  -- C#: variant overrides code, inherits the body
  r := private.resolve_question('00000000-0000-4000-8000-0000000008f1', 'csharp');
  assert (r ->> 'ok')::boolean and r ->> 'source' = 'variant' and r ->> 'starter_code' like '%Max%'
         and r ->> 'solution_code' like '%CSHARP-SOLUTION%' and r ->> 'body_md' like 'כתבו פעולה%'
         and r ->> 'programming_language' = 'csharp' and r::text not like '%JAVA-SOLUTION%',
         'FAIL: T4 csharp resolution / leakage';
  assert r #>> '{hints,1,content_md}' like '%a.Length%', 'FAIL: T4 csharp hints must come from the variant';
  -- neutral: base for both, snapshot language = the assignment language
  r := private.resolve_question('00000000-0000-4000-8000-0000000008f2', 'csharp');
  assert (r ->> 'ok')::boolean and r ->> 'source' = 'neutral' and r ->> 'programming_language' = 'csharp', 'FAIL: T4 neutral';
  -- unclassified: base for the primary language, blocked otherwise
  r := private.resolve_question('00000000-0000-4000-8000-0000000008f3', 'java');
  assert (r ->> 'ok')::boolean and r ->> 'programming_language' = 'java', 'FAIL: T4 unclassified on primary';
  r := private.resolve_question('00000000-0000-4000-8000-0000000008f3', 'csharp');
  assert not (r ->> 'ok')::boolean and r ->> 'reason' = 'unclassified', 'FAIL: T4 unclassified must block csharp';
  -- java-only question: blocked for C# (never silently converted)
  r := private.resolve_question('00000000-0000-4000-8000-0000000008f4', 'csharp');
  assert not (r ->> 'ok')::boolean and r ->> 'reason' = 'missing_variant', 'FAIL: T4 missing variant must block';
  -- no language at all (legacy / maths): base as before
  r := private.resolve_question('00000000-0000-4000-8000-0000000008f4', null);
  assert (r ->> 'ok')::boolean and r ->> 'programming_language' = 'java', 'FAIL: T4 legacy path';
  raise notice 'PASS T4: language resolution';
end $$;

-- ---------- assignments ---------------------------------------------
insert into public.assignments (id, owner_id, course_id, title) values
  ('00000000-0000-4000-8000-0000000008a1', '00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-0000000008c1', 'מטלת Java (שפה מהברירת מחדל)');
insert into public.assignments (id, owner_id, course_id, title, programming_language) values
  ('00000000-0000-4000-8000-0000000008a2', '00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-0000000008c1', 'מטלת C#', 'csharp');
insert into public.assignments (id, owner_id, course_id, title) values
  ('00000000-0000-4000-8000-0000000008a3', '00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-0000000008c2', 'מטלת מתמטיקה');
do $$
begin
  assert (select programming_language from public.assignments where id = '00000000-0000-4000-8000-0000000008a1') = 'java', 'FAIL: T5 default assignment language';
  assert (select programming_language from public.assignments where id = '00000000-0000-4000-8000-0000000008a3') is null, 'FAIL: T5 maths assignment language';
  raise notice 'PASS T5: assignment language defaults';
end $$;

insert into public.assignment_questions (id, assignment_id, question_id, position) values
  ('00000000-0000-4000-8000-000000000a11', '00000000-0000-4000-8000-0000000008a1', '00000000-0000-4000-8000-0000000008f1', 1),
  ('00000000-0000-4000-8000-000000000a12', '00000000-0000-4000-8000-0000000008a1', '00000000-0000-4000-8000-0000000008f2', 2),
  ('00000000-0000-4000-8000-000000000a13', '00000000-0000-4000-8000-0000000008a1', '00000000-0000-4000-8000-0000000008f3', 3),
  ('00000000-0000-4000-8000-000000000a21', '00000000-0000-4000-8000-0000000008a2', '00000000-0000-4000-8000-0000000008f1', 1),
  ('00000000-0000-4000-8000-000000000a22', '00000000-0000-4000-8000-0000000008a2', '00000000-0000-4000-8000-0000000008f2', 2),
  ('00000000-0000-4000-8000-000000000a23', '00000000-0000-4000-8000-0000000008a2', '00000000-0000-4000-8000-0000000008f3', 3),
  ('00000000-0000-4000-8000-000000000a24', '00000000-0000-4000-8000-0000000008a2', '00000000-0000-4000-8000-0000000008f4', 4);

do $$
begin
  insert into public.assignment_students (assignment_id, student_id) values
    ('00000000-0000-4000-8000-0000000008a1', '00000000-0000-4000-8000-000000000811');
  insert into public.assignment_students (assignment_id, student_id) values
    ('00000000-0000-4000-8000-0000000008a2', '00000000-0000-4000-8000-000000000812');
  begin   -- a C# student cannot receive the Java assignment (and vice versa)
    insert into public.assignment_students (assignment_id, student_id) values
      ('00000000-0000-4000-8000-0000000008a1', '00000000-0000-4000-8000-000000000812');
    raise exception 'FAIL: T6 C# student added to a Java assignment';
  exception when check_violation then null; end;
  begin
    insert into public.assignment_students (assignment_id, student_id) values
      ('00000000-0000-4000-8000-0000000008a2', '00000000-0000-4000-8000-000000000811');
    raise exception 'FAIL: T6 Java student added to a C# assignment';
  exception when check_violation then null; end;
  raise notice 'PASS T6: recipients must study the assignment language';
end $$;
insert into public.assignment_students (assignment_id, student_id) values
  ('00000000-0000-4000-8000-0000000008a3', '00000000-0000-4000-8000-000000000813');
insert into public.questions (id, owner_id, course_id, title, body_md, question_type, status) values
  ('00000000-0000-4000-8000-0000000008f5', '00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-0000000008c2', 'משוואה', 'פתרו', 'text', 'ready');
insert into public.assignment_questions (id, assignment_id, question_id, position) values
  ('00000000-0000-4000-8000-000000000a31', '00000000-0000-4000-8000-0000000008a3', '00000000-0000-4000-8000-0000000008f5', 1);

-- ---------- T7: teacher A flows (as authenticated) --------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated"}', true);
do $$
declare r jsonb; v_id uuid; v_q uuid;
begin
  -- status preview of the C# assignment lists the blockers
  r := public.assignment_language_status('00000000-0000-4000-8000-0000000008a2');
  assert r ->> 'language' = 'csharp', 'FAIL: T7 status language';
  assert (select count(*) from jsonb_array_elements(r -> 'items') i where i ->> 'status' = 'ok') = 2, 'FAIL: T7 ok items';
  assert exists (select 1 from jsonb_array_elements(r -> 'items') i where i ->> 'status' = 'unclassified'), 'FAIL: T7 unclassified item';
  assert exists (select 1 from jsonb_array_elements(r -> 'items') i where i ->> 'status' = 'missing_variant'), 'FAIL: T7 missing item';

  -- publishing is BLOCKED (server-side) and lists ALL blockers
  r := public.publish_assignment('00000000-0000-4000-8000-0000000008a2');
  assert not (r ->> 'ok')::boolean and r ->> 'reason' = 'variants_missing' and jsonb_array_length(r -> 'items') = 2,
         'FAIL: T7 publish must be blocked with two items';
  assert (select status from public.assignments where id = '00000000-0000-4000-8000-0000000008a2') = 'draft', 'FAIL: T7 status changed';
  assert not exists (select 1 from public.assignment_questions where assignment_id = '00000000-0000-4000-8000-0000000008a2' and snapshot_at is not null),
         'FAIL: T7 snapshot written by a blocked publish';

  -- the teacher fixes it: adds a C# variant through the RPC (blank body = inherit)
  v_id := public.save_question_variant(jsonb_build_object(
    'question_id', '00000000-0000-4000-8000-0000000008f4', 'programming_language', 'csharp',
    'body_md', '  ', 'starter_code', 'int F() {}', 'solution_code', 'CSHARP-ONLY-SOLUTION', 'origin', 'manual'));
  assert (select body_md from public.question_variants where id = v_id) is null, 'FAIL: T7 blank body must inherit (NULL)';
  -- upsert, not duplicate
  assert public.save_question_variant(jsonb_build_object(
    'question_id', '00000000-0000-4000-8000-0000000008f4', 'programming_language', 'csharp',
    'starter_code', 'int F2() {}', 'solution_code', 'CSHARP-ONLY-SOLUTION')) = v_id, 'FAIL: T7 upsert';
  -- the unclassified question is classified as neutral through save_question (payload without the key keeps it)
  v_q := public.save_question(jsonb_build_object(
    'id', '00000000-0000-4000-8000-0000000008f3', 'course_id', '00000000-0000-4000-8000-0000000008c1', 'title', 'שאלה ישנה ללא שפה',
    'body_md', 'טקסט ישן', 'question_type', 'text', 'programming_language', 'java', 'is_language_neutral', true));
  assert (select is_language_neutral and programming_language is null from public.questions where id = v_q),
         'FAIL: T7 neutral must force language NULL';
  v_q := public.save_question(jsonb_build_object(
    'id', '00000000-0000-4000-8000-0000000008f3', 'course_id', '00000000-0000-4000-8000-0000000008c1', 'title', 'שאלה ישנה ללא שפה',
    'body_md', 'טקסט ישן', 'question_type', 'text'));
  assert (select is_language_neutral from public.questions where id = v_q), 'FAIL: T7 absent key must keep neutrality';

  r := public.publish_assignment('00000000-0000-4000-8000-0000000008a2');
  assert (r ->> 'ok')::boolean, 'FAIL: T7 publish after fixing: ' || r::text;

  -- the Java assignment publishes as before
  r := public.publish_assignment('00000000-0000-4000-8000-0000000008a1');
  assert (r ->> 'ok')::boolean, 'FAIL: T7 java publish';
  r := public.publish_assignment('00000000-0000-4000-8000-0000000008a3');
  assert (r ->> 'ok')::boolean, 'FAIL: T7 maths (language-free) publish';
  raise notice 'PASS T7: blockers, manual variant, neutral classification, publish';
end $$;

-- snapshots
do $$
begin
  -- Java assignment: Java content
  assert (select starter_code from public.assignment_questions where id = '00000000-0000-4000-8000-000000000a11') like '%int[] a%'
     and (select programming_language from public.assignment_questions where id = '00000000-0000-4000-8000-000000000a11') = 'java'
     and (select hint_count from public.assignment_questions where id = '00000000-0000-4000-8000-000000000a11') = 2
     and (select solution_code from public.assignment_question_solutions where assignment_question_id = '00000000-0000-4000-8000-000000000a11') like '%JAVA-SOLUTION%',
     'FAIL: T8 java snapshot';
  -- C# assignment: C# content, body inherited, no Java code anywhere
  assert (select starter_code from public.assignment_questions where id = '00000000-0000-4000-8000-000000000a21') like '%Max%'
     and (select programming_language from public.assignment_questions where id = '00000000-0000-4000-8000-000000000a21') = 'csharp'
     and (select body_md from public.assignment_questions where id = '00000000-0000-4000-8000-000000000a21') like 'כתבו פעולה%',
     'FAIL: T8 csharp snapshot';
  assert not exists (select 1 from public.assignment_question_hints h join public.assignment_questions aq on aq.id = h.assignment_question_id
                     where aq.assignment_id = '00000000-0000-4000-8000-0000000008a2' and h.content_md like '%a.length%'),
         'FAIL: T8 Java hint leaked into the C# snapshot';
  assert not exists (select 1 from public.assignment_question_solutions s join public.assignment_questions aq on aq.id = s.assignment_question_id
                     where aq.assignment_id = '00000000-0000-4000-8000-0000000008a2' and (s.solution_code like '%JAVA%')),
         'FAIL: T8 Java solution leaked into the C# snapshot';
  assert (select programming_language from public.assignment_questions where id = '00000000-0000-4000-8000-000000000a22') = 'csharp',
         'FAIL: T8 neutral question must carry the assignment language';
  -- maths: no language
  assert (select programming_language is null and snapshot_at is not null from public.assignment_questions where id = '00000000-0000-4000-8000-000000000a31'),
         'FAIL: T8 maths snapshot must be published and language-free';
  raise notice 'PASS T8: snapshots carry the right language and no cross-language content';
end $$;

-- language is locked after publishing
do $$
begin
  begin
    update public.assignments set programming_language = 'java' where id = '00000000-0000-4000-8000-0000000008a2';
    raise exception 'FAIL: T9 language changed after publishing';
  exception when check_violation then null; end;
  raise notice 'PASS T9: assignment language is locked after publishing';
end $$;

-- later edits never touch a published snapshot
do $$
declare before_txt text; after_txt text;
begin
  select starter_code into before_txt from public.assignment_questions where id = '00000000-0000-4000-8000-000000000a21';
  update public.question_variants set starter_code = 'EDITED-AFTER-PUBLISH' where question_id = '00000000-0000-4000-8000-0000000008f1' and programming_language = 'csharp';
  update public.questions set starter_code = 'EDITED-BASE' where id = '00000000-0000-4000-8000-0000000008f1';
  select starter_code into after_txt from public.assignment_questions where id = '00000000-0000-4000-8000-000000000a21';
  assert before_txt = after_txt, 'FAIL: T10 a published snapshot changed after editing the question';
  assert (select starter_code from public.assignment_questions where id = '00000000-0000-4000-8000-000000000a11') like '%int[] a%', 'FAIL: T10 java snapshot changed';
  raise notice 'PASS T10: published snapshots are immutable w.r.t. later edits';
end $$;

-- enrollment language change: allowed for the owner, blocked with a mismatching DRAFT
do $$
declare v_a4 uuid;
begin
  insert into public.assignments (owner_id, course_id, title, programming_language) values
    ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-0000000008c1', 'טיוטת C#', 'csharp')
  returning id into v_a4;
  insert into public.assignment_students (assignment_id, student_id) values (v_a4, '00000000-0000-4000-8000-000000000812');
  begin
    update public.course_enrollments set programming_language = 'java'
    where course_id = '00000000-0000-4000-8000-0000000008c1' and student_id = '00000000-0000-4000-8000-000000000812';
    raise exception 'FAIL: T11 language changed while a mismatching draft exists';
  exception when check_violation then null; end;
  delete from public.assignment_students where assignment_id = v_a4;
  update public.course_enrollments set programming_language = 'java'
  where course_id = '00000000-0000-4000-8000-0000000008c1' and student_id = '00000000-0000-4000-8000-000000000812';
  assert (select programming_language from public.course_enrollments where student_id = '00000000-0000-4000-8000-000000000812'
          and course_id = '00000000-0000-4000-8000-0000000008c1') = 'java', 'FAIL: T11 owner could not change the language';
  update public.course_enrollments set programming_language = 'csharp'
  where course_id = '00000000-0000-4000-8000-0000000008c1' and student_id = '00000000-0000-4000-8000-000000000812';
  raise notice 'PASS T11: enrollment language change rules';
end $$;
reset role;

-- ---------- T12: RLS / no leakage ------------------------------------
-- the C# student sees ONLY the C# assignment content
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000812","role":"authenticated"}', true);
do $$
declare n int;
begin
  assert not exists (select 1 from public.assignment_questions where programming_language = 'java'), 'FAIL: T12 C# student sees a Java snapshot';
  assert exists (select 1 from public.assignment_questions where programming_language = 'csharp'), 'FAIL: T12 C# student sees no C# snapshot';
  assert (select count(*) from public.question_variants) = 0, 'FAIL: T12 student can read variants';
  assert (select count(*) from public.questions) = 0, 'FAIL: T12 student can read the question bank';
  update public.course_enrollments set programming_language = 'java' where student_id = '00000000-0000-4000-8000-000000000812';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: T12 student changed own language';
  raise notice 'PASS T12: C# student sees only C# content; variants and bank are owner-only';
end $$;
-- the Java student sees only Java content
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000811","role":"authenticated"}', true);
do $$
begin
  assert not exists (select 1 from public.assignment_questions where programming_language = 'csharp'), 'FAIL: T12 Java student sees a C# snapshot';
  assert not exists (select 1 from public.assignment_question_solutions s where s.solution_code like '%CSHARP%'), 'FAIL: T12 Java student sees a C# solution';
  raise notice 'PASS T12b: Java student sees only Java content';
end $$;
-- teacher B: no access to A's variants / status / languages
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000802","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.question_variants) = 0, 'FAIL: T12 teacher B reads A variants';
  assert (select count(*) from public.course_languages) = 0, 'FAIL: T12 teacher B reads A course languages';
  begin
    perform public.assignment_language_status('00000000-0000-4000-8000-0000000008a2');
    raise exception 'FAIL: T12 teacher B read A assignment status';
  exception when sqlstate 'P0002' then null; end;
  begin
    perform public.save_question_variant(jsonb_build_object('question_id', '00000000-0000-4000-8000-0000000008f4',
      'programming_language', 'csharp', 'starter_code', 'hijack'));
    raise exception 'FAIL: T12 teacher B wrote a variant on A question';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    insert into public.course_languages (course_id, programming_language) values ('00000000-0000-4000-8000-0000000008c1', 'python');
    raise exception 'FAIL: T12 teacher B added a language to A course';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  raise notice 'PASS T12c: cross-teacher isolation';
end $$;
reset role;

rollback;
