-- =====================================================================
-- Phase 2 tests: courses, topics, question bank — RLS + integrity.
-- Safe for the Supabase SQL Editor: FAKE users, everything ROLLED BACK.
-- Success = finishes with no error. Failure stops with "FAIL: ...".
-- Requires migrations up to 20260923000200.
-- =====================================================================
begin;

-- ---------- fixtures (as postgres) ----------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 't2-teacher-a@example.invalid', '{"full_name":"מורה א"}'),
  ('00000000-0000-4000-8000-0000000000a2', 't2-teacher-b@example.invalid', '{"full_name":"מורה ב"}'),
  ('00000000-0000-4000-8000-0000000000b1', 't2-student-1@example.invalid', '{"full_name":"תלמיד 1"}'),
  ('00000000-0000-4000-8000-0000000000b2', 't2-student-2@example.invalid', '{"full_name":"תלמיד 2"}');
update public.profiles set role = 'teacher'
where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2');
insert into public.teacher_students (teacher_id, student_id) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b2');

insert into public.courses (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'קורס א'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a2', 'קורס ב');
insert into public.topics (id, course_id, parent_id, title, position) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', null, 'יחידה 1', 1),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000c1', null, 'יחידה 2', 2),
  ('00000000-0000-4000-8000-0000000000d9', '00000000-0000-4000-8000-0000000000c2', null, 'יחידה של ב', 1);
insert into public.topics (id, course_id, parent_id, title) values
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d1', 'נושא');
insert into public.topics (id, course_id, parent_id, title) values
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d2', 'תת-נושא');
insert into public.course_enrollments (course_id, student_id) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1');

-- T0: ledger
do $$ begin
  assert (select count(*) from private.applied_migrations
          where version in ('20260922000100','20260923000000','20260923000100','20260923000200')) = 4,
         'FAIL: T0 migration ledger incomplete';
  raise notice 'PASS T0: migration ledger lists all applied migrations';
end $$;

-- T1: tree integrity (triggers apply to everyone)
do $$ begin
  begin
    insert into public.topics (course_id, parent_id, title)
    values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d3', 'רמה 4');
    raise exception 'FAIL: T1 depth 4 accepted';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    update public.topics set parent_id = '00000000-0000-4000-8000-0000000000d3'
    where id = '00000000-0000-4000-8000-0000000000d1';
    raise exception 'FAIL: T1 cycle accepted';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    insert into public.topics (course_id, parent_id, title)
    values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d9', 'חוצה קורסים');
    raise exception 'FAIL: T1 cross-course parent accepted';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    update public.topics set parent_id = '00000000-0000-4000-8000-0000000000d4'
    where id = '00000000-0000-4000-8000-0000000000d1';  -- subtree height 2 → depth 4
    raise exception 'FAIL: T1 move creating depth 4 accepted';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  -- a legal move (topic with one child under another unit → depth 3) must work, then revert
  update public.topics set parent_id = '00000000-0000-4000-8000-0000000000d4'
  where id = '00000000-0000-4000-8000-0000000000d2';
  update public.topics set parent_id = '00000000-0000-4000-8000-0000000000d1'
  where id = '00000000-0000-4000-8000-0000000000d2';
  raise notice 'PASS T1: depth limit, cycles, cross-course parents rejected; legal move works';
end $$;

-- ---------- as TEACHER A --------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

do $$
declare v_course uuid;
begin
  assert (select count(*) from public.courses) = 1, 'FAIL: T2 teacher A sees wrong courses';
  insert into public.courses (owner_id, title) values ('00000000-0000-4000-8000-0000000000a1', 'קורס חדש')
  returning id into v_course;
  perform set_config('test.new_course', v_course::text, true);
  assert (select count(*) from public.courses) = 2, 'FAIL: T2 new course not visible';
  begin
    insert into public.courses (owner_id, title) values ('00000000-0000-4000-8000-0000000000a2', 'בשם מורה אחר');
    raise exception 'FAIL: T2 created course for another teacher';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  raise notice 'PASS T2: teacher sees/creates only own courses';
end $$;

do $$
declare n int;
begin
  begin
    insert into public.topics (course_id, title) values ('00000000-0000-4000-8000-0000000000c2', 'פלישה');
    raise exception 'FAIL: T3 topic added to another teacher''s course';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  update public.courses set title = 'x' where id = '00000000-0000-4000-8000-0000000000c2';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: T3 updated another teacher''s course';
  begin
    delete from public.courses where id = '00000000-0000-4000-8000-0000000000c1';
    raise exception 'FAIL: T3 course hard-deleted';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS T3: no access to other courses; no hard delete';
end $$;

do $$ begin
  begin
    insert into public.course_enrollments (course_id, student_id)
    values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b2');
    raise exception 'FAIL: T4 enrolled a student that is not mine';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  insert into public.course_enrollments (course_id, student_id)
  values (current_setting('test.new_course')::uuid, '00000000-0000-4000-8000-0000000000b1');
  raise notice 'PASS T4: enroll only own students';
end $$;

do $$
declare v_q uuid;
begin
  v_q := public.save_question(jsonb_build_object(
    'course_id', '00000000-0000-4000-8000-0000000000c1',
    'title', 'היפוך שרשרת', 'body_md', 'כתבו פעולה...', 'question_type', 'code',
    'programming_language', 'java', 'difficulty', 'bagrut', 'source_type', 'bagrut', 'source_year', '2024',
    'tags', jsonb_build_array('Node', ' ', 'רקורסיה'),
    'topic_ids', jsonb_build_array('00000000-0000-4000-8000-0000000000d2'),
    'hints', jsonb_build_array(jsonb_build_object('level', 1, 'content_md', 'רמז 1'),
                               jsonb_build_object('level', 2, 'content_md', 'רמז 2')),
    'solution', jsonb_build_object('solution_code', 'public static void f()', 'explanation_md', 'הסבר'),
    'teacher_notes', 'הערה פרטית'));
  perform set_config('test.q', v_q::text, true);
  assert (select count(*) from public.question_hints where question_id = v_q) = 2, 'FAIL: T5 hints';
  assert (select count(*) from public.question_solutions where question_id = v_q) = 1, 'FAIL: T5 solution';
  assert (select count(*) from public.question_teacher_notes where question_id = v_q) = 1, 'FAIL: T5 notes';
  assert (select count(*) from public.question_topics where question_id = v_q) = 1, 'FAIL: T5 topics';
  assert (select tags from public.questions where id = v_q) = array['Node','רקורסיה'], 'FAIL: T5 tags not cleaned';
  raise notice 'PASS T5: save_question creates question + hints + solution + notes + topics';
end $$;

do $$
declare v_q uuid := current_setting('test.q')::uuid;
begin
  perform public.save_question(jsonb_build_object('id', v_q,
    'course_id', '00000000-0000-4000-8000-0000000000c1', 'title', 'היפוך שרשרת (עודכן)',
    'hints', jsonb_build_array(jsonb_build_object('level', 1, 'content_md', 'רמז 1 מעודכן')),
    'topic_ids', jsonb_build_array('00000000-0000-4000-8000-0000000000d3')));
  assert (select count(*) from public.question_hints where question_id = v_q) = 1, 'FAIL: T6 removed hint remains';
  assert (select topic_id from public.question_topics where question_id = v_q) = '00000000-0000-4000-8000-0000000000d3',
         'FAIL: T6 topics not replaced';
  begin
    perform public.save_question(jsonb_build_object('id', v_q,
      'course_id', '00000000-0000-4000-8000-0000000000c1', 'title', 'x',
      'topic_ids', jsonb_build_array('00000000-0000-4000-8000-0000000000d9')));
    raise exception 'FAIL: T6 topic from another course accepted';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  -- the failed call must not have left partial changes
  assert (select title from public.questions where id = v_q) = 'היפוך שרשרת (עודכן)', 'FAIL: T6 partial update persisted';
  raise notice 'PASS T6: update replaces hints/topics atomically; cross-course topic rejected';
end $$;

do $$ begin
  begin
    perform public.save_question(jsonb_build_object('course_id', '00000000-0000-4000-8000-0000000000c2', 'title', 'לקורס זר'));
    raise exception 'FAIL: T7 question created in another teacher''s course';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    delete from public.questions;
    raise exception 'FAIL: T7 question hard-deleted';
  exception when insufficient_privilege then null; end;
  update public.topics set is_archived = true where id = '00000000-0000-4000-8000-0000000000d4';
  raise notice 'PASS T7: no questions in foreign courses; no hard delete';
end $$;

-- ---------- as TEACHER B --------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
do $$
declare n int;
begin
  assert (select count(*) from public.courses) = 1, 'FAIL: T8 teacher B sees A''s courses';
  assert (select count(*) from public.questions) = 0, 'FAIL: T8 teacher B sees A''s questions';
  assert (select count(*) from public.question_hints) = 0, 'FAIL: T8 hints leak';
  assert (select count(*) from public.question_solutions) = 0, 'FAIL: T8 solutions leak';
  assert (select count(*) from public.question_teacher_notes) = 0, 'FAIL: T8 notes leak';
  begin
    perform public.save_question(jsonb_build_object('id', current_setting('test.q'),
      'course_id', '00000000-0000-4000-8000-0000000000c2', 'title', 'השתלטות'));
    raise exception 'FAIL: T8 teacher B updated A''s question';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  update public.topics set title = 'x' where course_id = '00000000-0000-4000-8000-0000000000c1';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: T8 teacher B renamed A''s topics';
  raise notice 'PASS T8: teachers are fully isolated';
end $$;

-- ---------- as STUDENT 1 (enrolled in A's courses) ------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.courses) = 2, 'FAIL: T9 student sees wrong number of courses';
  assert not exists (select 1 from public.courses where id = '00000000-0000-4000-8000-0000000000c2'),
         'FAIL: T9 student sees a course he is not enrolled in';
  assert (select count(*) from public.topics) = 3, 'FAIL: T9 student sees wrong topics (archived must be hidden)';
  raise notice 'PASS T9: student sees enrolled courses and active topics only';
end $$;

do $$ begin
  assert (select count(*) from public.questions) = 0, 'FAIL: T10 student reads questions';
  assert (select count(*) from public.question_hints) = 0, 'FAIL: T10 student reads hints';
  assert (select count(*) from public.question_solutions) = 0, 'FAIL: T10 student reads solutions';
  assert (select count(*) from public.question_teacher_notes) = 0, 'FAIL: T10 student reads teacher notes';
  assert (select count(*) from public.question_topics) = 0, 'FAIL: T10 student reads question topics';
  raise notice 'PASS T10: student cannot read any question-bank table';
end $$;

do $$
declare n int;
begin
  begin
    perform public.save_question(jsonb_build_object('course_id', '00000000-0000-4000-8000-0000000000c1', 'title', 'x'));
    raise exception 'FAIL: T11 student created a question';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    insert into public.courses (owner_id, title) values ('00000000-0000-4000-8000-0000000000b1', 'x');
    raise exception 'FAIL: T11 student created a course';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    insert into public.course_enrollments (course_id, student_id)
    values ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b1');
    raise exception 'FAIL: T11 student self-enrolled';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  update public.courses set title = 'x';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: T11 student renamed a course';
  update public.topics set title = 'x';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: T11 student renamed a topic';
  raise notice 'PASS T11: student cannot write content';
end $$;

-- archived course disappears for the student
reset role;
update public.courses set is_archived = true where id = current_setting('test.new_course')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.courses) = 1, 'FAIL: T12 archived course still visible to student';
  raise notice 'PASS T12: archived course hidden from student';
end $$;

-- ---------- as STUDENT 2 (not enrolled anywhere) --------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.courses) = 0, 'FAIL: T13 unenrolled student sees courses';
  assert (select count(*) from public.topics) = 0, 'FAIL: T13 unenrolled student sees topics';
  raise notice 'PASS T13: unenrolled student sees nothing';
end $$;

-- ---------- as ANON --------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin perform 1 from public.courses; raise exception 'FAIL: T14 anon reads courses';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.questions; raise exception 'FAIL: T14 anon reads questions';
  exception when insufficient_privilege then null; end;
  begin perform public.save_question('{}'::jsonb); raise exception 'FAIL: T14 anon calls save_question';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS T14: anon has no access';
end $$;

-- ---------- cascade still works (Phase 1 behaviour) ------------------
reset role;
do $$ begin
  delete from auth.users where id = '00000000-0000-4000-8000-0000000000b1';
  assert not exists (select 1 from public.course_enrollments where student_id = '00000000-0000-4000-8000-0000000000b1'),
         'FAIL: T15 enrollments not cleaned on student delete';
  raise notice 'PASS T15: deleting a student still cascades cleanly';
end $$;

rollback;
