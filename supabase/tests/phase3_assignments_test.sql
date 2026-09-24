-- =====================================================================
-- Phase 3 tests: assignments, snapshot, student work, hints/solution,
-- privacy between students, teacher least privilege.
-- Safe for the Supabase SQL Editor: FAKE users, everything ROLLED BACK.
-- Success = finishes with no error. Failure stops with "FAIL: ...".
-- =====================================================================
begin;

-- ---------- fixtures (as postgres) ----------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'p3-teacher-a@example.invalid'),
  ('00000000-0000-4000-8000-0000000000a2', 'p3-teacher-b@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b1', 'p3-student-1@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b2', 'p3-student-2@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b3', 'p3-student-3@example.invalid');
update public.profiles set role = 'teacher'
where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2');
insert into public.teacher_students (teacher_id, student_id) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b3');
insert into public.courses (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'קורס א'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a2', 'קורס ב');
insert into public.course_enrollments (course_id, student_id) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b2');
insert into public.questions (id, owner_id, course_id, title, body_md, starter_code, status) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'שאלה 1 מקורית', 'נוסח 1', 'code 1', 'ready'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'שאלה 2', 'נוסח 2', '', 'ready'),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'שאלה בארכיון', '', '', 'archived'),
  ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c2', 'שאלה של מורה ב', '', '', 'ready');
insert into public.question_hints (question_id, level, content_md) values
  ('00000000-0000-4000-8000-0000000000f1', 1, 'רמז 1 מקורי'),
  ('00000000-0000-4000-8000-0000000000f1', 2, 'רמז 2 מקורי');
insert into public.question_solutions (question_id, solution_code, explanation_md) values
  ('00000000-0000-4000-8000-0000000000f1', 'פתרון מקורי', 'הסבר מקורי');

do $$ begin
  assert exists (select 1 from private.applied_migrations where version = '20260924000200'), 'FAIL: P0 migration not in ledger';
  raise notice 'PASS P0: assignments migration recorded in ledger';
end $$;

-- ---------- TEACHER A builds assignments ------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

do $$
declare v_a1 uuid; v_a2 uuid; v_q1 uuid; v_q2 uuid;
begin
  insert into public.assignments (owner_id, course_id, title)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'מטלה 1') returning id into v_a1;
  insert into public.assignments (owner_id, course_id, title)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'מטלה בטיוטה') returning id into v_a2;
  insert into public.assignment_questions (assignment_id, question_id, position)
  values (v_a1, '00000000-0000-4000-8000-0000000000f1', 1) returning id into v_q1;
  insert into public.assignment_questions (assignment_id, question_id, position)
  values (v_a1, '00000000-0000-4000-8000-0000000000f2', 2) returning id into v_q2;
  insert into public.assignment_questions (assignment_id, question_id, position)
  values (v_a2, '00000000-0000-4000-8000-0000000000f1', 1);
  insert into public.assignment_students (assignment_id, student_id) values
    (v_a1, '00000000-0000-4000-8000-0000000000b1'),
    (v_a2, '00000000-0000-4000-8000-0000000000b1');
  perform set_config('test.a1', v_a1::text, true);
  perform set_config('test.a2', v_a2::text, true);
  perform set_config('test.q1', v_q1::text, true);
  perform set_config('test.q2', v_q2::text, true);

  begin insert into public.assignment_questions (assignment_id, question_id) values (v_a1, '00000000-0000-4000-8000-0000000000f3');
        raise exception 'FAIL: P1 archived question added';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin insert into public.assignment_questions (assignment_id, question_id) values (v_a1, '00000000-0000-4000-8000-0000000000f9');
        raise exception 'FAIL: P1 foreign teacher''s question added';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin insert into public.assignment_students (assignment_id, student_id) values (v_a1, '00000000-0000-4000-8000-0000000000b3');
        raise exception 'FAIL: P1 non-enrolled student assigned';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin insert into public.assignments (owner_id, course_id, title)
        values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c2', 'בקורס זר');
        raise exception 'FAIL: P1 assignment in foreign course';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  raise notice 'PASS P1: assignment building rules (course, owner, archived, enrollment)';
end $$;

do $$
declare r jsonb; v_a1 uuid := current_setting('test.a1')::uuid; v_q1 uuid := current_setting('test.q1')::uuid;
begin
  begin update public.assignments set status = 'published' where id = v_a1;
        raise exception 'FAIL: P2 status written directly';
  exception when insufficient_privilege then null; end;
  r := public.publish_assignment(v_a1);
  assert r ->> 'ok' = 'true', 'FAIL: P2 publish failed: ' || r::text;
  assert (select status from public.assignments where id = v_a1) = 'published', 'FAIL: P2 status';
  assert (select title from public.assignment_questions where id = v_q1) = 'שאלה 1 מקורית', 'FAIL: P2 snapshot title';
  assert (select hint_count from public.assignment_questions where id = v_q1) = 2, 'FAIL: P2 hint_count';
  assert (select has_solution from public.assignment_questions where id = v_q1), 'FAIL: P2 has_solution';
  assert (select count(*) from public.assignment_question_hints where assignment_question_id = v_q1) = 2, 'FAIL: P2 hints snapshot';
  raise notice 'PASS P2: publish only via RPC; snapshot of content, hints and solution';
end $$;

do $$
declare n int; v_a1 uuid := current_setting('test.a1')::uuid;
begin
  begin insert into public.assignment_questions (assignment_id, question_id) values (v_a1, '00000000-0000-4000-8000-0000000000f3');
        raise exception 'FAIL: P3 question added after publish';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  delete from public.assignment_questions where assignment_id = v_a1;
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: P3 question removed after publish';
  begin update public.assignment_questions set position = 9 where id = current_setting('test.q1')::uuid;
        raise exception 'FAIL: P3 order changed after publish';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  update public.assignments set title = 'מטלה 1 (עודכן)' where id = v_a1;
  get diagnostics n = row_count;
  assert n = 1, 'FAIL: P3 title edit after publish refused';
  raise notice 'PASS P3: after publish only title/instructions/due date change; questions frozen';
end $$;

-- ---------- STUDENT 1 (recipient) -----------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);

do $$ begin
  assert (select count(*) from public.assignments) = 1, 'FAIL: P4 student sees wrong assignments (draft visible?)';
  assert not exists (select 1 from public.assignments where id = current_setting('test.a2')::uuid), 'FAIL: P4 draft visible';
  assert (select count(*) from public.assignment_questions) = 2, 'FAIL: P4 student sees wrong assignment questions';
  assert (select title from public.assignment_questions where id = current_setting('test.q1')::uuid) = 'שאלה 1 מקורית',
         'FAIL: P4 snapshot not visible';
  raise notice 'PASS P4: student sees his published assignment, not the draft';
end $$;

do $$ begin
  assert (select count(*) from public.questions) = 0, 'FAIL: P5 student reads bank questions';
  assert (select count(*) from public.question_hints) = 0, 'FAIL: P5 student reads bank hints';
  assert (select count(*) from public.question_solutions) = 0, 'FAIL: P5 student reads bank solutions';
  assert (select count(*) from public.assignment_question_hints) = 0, 'FAIL: P5 unrevealed hints readable';
  assert (select count(*) from public.assignment_question_solutions) = 0, 'FAIL: P5 unrevealed solution readable';
  raise notice 'PASS P5: no bank access; no unrevealed hint or solution';
end $$;

do $$
declare t1 timestamptz; v_q1 uuid := current_setting('test.q1')::uuid;
begin
  t1 := public.save_answer(v_q1, 'טיוטה ראשונה');
  assert t1 is not null, 'FAIL: P6 save returned nothing';
  perform public.save_answer(v_q1, 'טיוטה שנייה');
  assert (select content from public.answers where assignment_question_id = v_q1) = 'טיוטה שנייה', 'FAIL: P6 autosave';
  assert (select count(*) from public.answers) = 1, 'FAIL: P6 duplicate answers';
  raise notice 'PASS P6: autosave creates then updates one draft';
end $$;

do $$
declare r jsonb; v_q1 uuid := current_setting('test.q1')::uuid;
begin
  r := public.reveal_hint(v_q1);
  assert r ->> 'level' = '1', 'FAIL: P7 first hint';
  assert (select count(*) from public.assignment_question_hints) = 1, 'FAIL: P7 more than the revealed hint visible';
  assert (select level from public.assignment_question_hints) = 1, 'FAIL: P7 wrong hint visible';
  r := public.reveal_hint(v_q1);
  assert r ->> 'level' = '2', 'FAIL: P7 second hint';
  r := public.reveal_hint(v_q1);
  assert r ->> 'reason' = 'no_more_hints', 'FAIL: P7 third hint';
  begin insert into public.question_reveals (assignment_question_id, student_id, kind, level, revealed_by)
        values (current_setting('test.q2')::uuid, '00000000-0000-4000-8000-0000000000b1', 'hint', 1, '00000000-0000-4000-8000-0000000000b1');
        raise exception 'FAIL: P7 student wrote a reveal directly';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS P7: hints revealed one by one, only via RPC; each reveal unlocks exactly one hint';
end $$;

do $$
declare r jsonb; v_q1 uuid := current_setting('test.q1')::uuid;
begin
  r := public.reveal_solution(v_q1);
  assert r ->> 'reason' = 'submit_first', 'FAIL: P8 solution before submit';
  assert (select count(*) from public.assignment_question_solutions) = 0, 'FAIL: P8 solution leaked';
  r := public.submit_answer(v_q1);
  assert r ->> 'ok' = 'true' and r ->> 'attempt' = '1', 'FAIL: P8 submit';
  assert (select status from public.answers where assignment_question_id = v_q1) = 'submitted', 'FAIL: P8 status';
  assert (select count(*) from public.answer_submissions) = 1, 'FAIL: P8 submission snapshot';
  begin perform public.save_answer(v_q1, 'שינוי אחרי הגשה');
        raise exception 'FAIL: P8 edit after submit';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  assert (select content from public.answers where assignment_question_id = v_q1) = 'טיוטה שנייה', 'FAIL: P8 content changed';
  r := public.reveal_solution(v_q1);
  assert r ->> 'ok' = 'true', 'FAIL: P8 reveal after submit';
  assert (select count(*) from public.assignment_question_solutions) = 1, 'FAIL: P8 solution not visible';
  r := public.submit_answer(current_setting('test.q2')::uuid);
  assert r ->> 'reason' = 'empty', 'FAIL: P8 empty submit accepted';
  raise notice 'PASS P8: solution only after submit; submitted answer is frozen';
end $$;

do $$ begin
  begin update public.answers set status = 'draft';
        raise exception 'FAIL: P9 student changed status directly';
  exception when insufficient_privilege then null; end;
  begin insert into public.answer_submissions (answer_id, attempt_number, content)
        select id, 2, 'זיוף' from public.answers limit 1;
        raise exception 'FAIL: P9 student forged a submission';
  exception when insufficient_privilege then null; end;
  begin insert into public.answers (assignment_question_id, student_id, content)
        values (current_setting('test.q2')::uuid, '00000000-0000-4000-8000-0000000000b2', 'בשם תלמיד אחר');
        raise exception 'FAIL: P9 answer written for another student';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  raise notice 'PASS P9: no direct status/submission writes; no writing for others';
end $$;

-- ---------- STUDENT 2 (enrolled, NOT a recipient) --------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.assignments) = 0, 'FAIL: P10 sees assignment not assigned to her';
  assert (select count(*) from public.assignment_students) = 0, 'FAIL: P10 sees recipients';
  assert (select count(*) from public.assignment_questions) = 0, 'FAIL: P10 sees questions';
  assert (select count(*) from public.answers) = 0, 'FAIL: P10 reads another student''s answer';
  assert (select count(*) from public.answer_submissions) = 0, 'FAIL: P10 reads another student''s submission';
  assert (select count(*) from public.question_reveals) = 0, 'FAIL: P10 reads another student''s reveals';
  assert (select count(*) from public.assignment_question_hints) = 0, 'FAIL: P10 reads hints revealed to another student';
  assert (select count(*) from public.assignment_question_solutions) = 0, 'FAIL: P10 reads solution revealed to another student';
  begin perform public.save_answer(current_setting('test.q2')::uuid, 'x'); raise exception 'FAIL: P10 saved in foreign assignment';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.reveal_hint(current_setting('test.q1')::uuid); raise exception 'FAIL: P10 revealed in foreign assignment';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.reveal_solution(current_setting('test.q1')::uuid); raise exception 'FAIL: P10 solution in foreign assignment';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  raise notice 'PASS P10: complete privacy between students (read and write)';
end $$;

-- ---------- TEACHER B (not the owner) --------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
do $$
declare n int;
begin
  assert (select count(*) from public.assignments) = 0, 'FAIL: P11 teacher B sees A''s assignments';
  assert (select count(*) from public.answers) = 0, 'FAIL: P11 teacher B reads answers';
  assert (select count(*) from public.question_reveals) = 0, 'FAIL: P11 teacher B reads reveals';
  assert (select count(*) from public.assignment_question_hints) = 0, 'FAIL: P11 teacher B reads hints';
  assert (select count(*) from public.assignment_question_solutions) = 0, 'FAIL: P11 teacher B reads solutions';
  update public.assignments set title = 'x';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: P11 teacher B edited';
  begin perform public.publish_assignment(current_setting('test.a2')::uuid); raise exception 'FAIL: P11 teacher B published';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.set_assignment_closed(current_setting('test.a1')::uuid, true); raise exception 'FAIL: P11 teacher B closed';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  raise notice 'PASS P11: a non-owner teacher gets no access';
end $$;

-- ---------- TEACHER A: sees what is needed, cannot write student work --
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$
declare n int; r jsonb; v_a1 uuid := current_setting('test.a1')::uuid;
begin
  assert (select count(*) from public.answers) = 1, 'FAIL: P12 teacher cannot see the answer';
  assert (select count(*) from public.answer_submissions) = 1, 'FAIL: P12 teacher cannot see the submission';
  assert (select count(*) from public.question_reveals) = 3, 'FAIL: P12 teacher cannot see reveals';
  update public.answers set content = 'המורה שינה';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: P12 teacher edited a student answer';
  begin insert into public.question_reveals (assignment_question_id, student_id, kind, level, revealed_by)
        values (current_setting('test.q2')::uuid, '00000000-0000-4000-8000-0000000000b1', 'hint', 1, '00000000-0000-4000-8000-0000000000a1');
        raise exception 'FAIL: P12 teacher wrote a reveal directly (Phase 4 feature)';
  exception when insufficient_privilege then null; end;
  delete from public.assignment_students where assignment_id = v_a1 and student_id = '00000000-0000-4000-8000-0000000000b1';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: P12 removed a student who already worked';
  r := public.unpublish_assignment(v_a1);
  assert r ->> 'reason' = 'students_started', 'FAIL: P12 unpublished after students started';
  delete from public.assignments where id = v_a1;
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: P12 published assignment deleted';
  raise notice 'PASS P12: teacher reads student work, cannot alter it; started work is protected';
end $$;

-- snapshot integrity: editing the bank after publish must not change the assignment
do $$
declare v_q1 uuid := current_setting('test.q1')::uuid;
begin
  perform public.save_question(jsonb_build_object('id', '00000000-0000-4000-8000-0000000000f1',
    'course_id', '00000000-0000-4000-8000-0000000000c1', 'title', 'שאלה 1 אחרי עריכה', 'body_md', 'נוסח חדש',
    'status', 'ready',
    'hints', jsonb_build_array(jsonb_build_object('level', 1, 'content_md', 'רמז חדש')),
    'solution', jsonb_build_object('solution_code', 'פתרון חדש', 'explanation_md', 'הסבר חדש')));
  assert (select title from public.assignment_questions where id = v_q1) = 'שאלה 1 מקורית', 'FAIL: P13 snapshot title changed';
  assert (select body_md from public.assignment_questions where id = v_q1) = 'נוסח 1', 'FAIL: P13 snapshot body changed';
  assert (select hint_count from public.assignment_questions where id = v_q1) = 2, 'FAIL: P13 hint count changed';
  assert (select content_md from public.assignment_question_hints where assignment_question_id = v_q1 and level = 2) = 'רמז 2 מקורי',
         'FAIL: P13 snapshot hint changed/lost';
  assert (select solution_code from public.assignment_question_solutions where assignment_question_id = v_q1) = 'פתרון מקורי',
         'FAIL: P13 snapshot solution changed';
  raise notice 'PASS P13: bank edits after publish do not change the published assignment';
end $$;

-- student still sees the original text
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  assert (select title from public.assignment_questions where id = current_setting('test.q1')::uuid) = 'שאלה 1 מקורית',
         'FAIL: P13b student sees changed title';
  assert (select content_md from public.assignment_question_hints where level = 1) = 'רמז 1 מקורי', 'FAIL: P13b student hint changed';
  raise notice 'PASS P13b: the student keeps seeing exactly what was published';
end $$;

-- closed assignment: visible, not editable; reopen restores editing
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  assert (public.set_assignment_closed(current_setting('test.a1')::uuid, true)) ->> 'ok' = 'true', 'FAIL: P14 close';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.assignments) = 1, 'FAIL: P14 closed assignment hidden';
  begin perform public.save_answer(current_setting('test.q2')::uuid, 'אחרי סגירה');
        raise exception 'FAIL: P14 saved in closed assignment';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  raise notice 'PASS P14: closed assignment stays visible and becomes read-only';
end $$;

-- draft lifecycle: publish → unpublish (no work) → delete
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$
declare n int; v_a2 uuid := current_setting('test.a2')::uuid;
begin
  assert (public.publish_assignment(v_a2)) ->> 'ok' = 'true', 'FAIL: P15 publish a2';
  assert (public.unpublish_assignment(v_a2)) ->> 'ok' = 'true', 'FAIL: P15 unpublish without work';
  assert (select count(*) from public.assignment_question_hints h join public.assignment_questions q on q.id = h.assignment_question_id
          where q.assignment_id = v_a2) = 0, 'FAIL: P15 snapshot not cleared';
  delete from public.assignments where id = v_a2;
  get diagnostics n = row_count;
  assert n = 1, 'FAIL: P15 draft not deletable';
  raise notice 'PASS P15: unpublish only without work; drafts can be deleted';
end $$;

-- ---------- ANON ------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin perform 1 from public.assignments; raise exception 'FAIL: P16 anon reads assignments';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.answers; raise exception 'FAIL: P16 anon reads answers';
  exception when insufficient_privilege then null; end;
  begin perform public.save_answer(current_setting('test.q1')::uuid, 'x'); raise exception 'FAIL: P16 anon saves';
  exception when insufficient_privilege then null; end;
  begin perform public.reveal_hint(current_setting('test.q1')::uuid); raise exception 'FAIL: P16 anon reveals';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS P16: anon has no access';
end $$;

-- ---------- cascade: deleting a student account cleans his work -------
reset role;
do $$ begin
  delete from auth.users where id = '00000000-0000-4000-8000-0000000000b1';
  assert not exists (select 1 from public.answers where student_id = '00000000-0000-4000-8000-0000000000b1'), 'FAIL: P17 answers remain';
  assert not exists (select 1 from public.question_reveals where student_id = '00000000-0000-4000-8000-0000000000b1'), 'FAIL: P17 reveals remain';
  raise notice 'PASS P17: deleting a test student still cascades cleanly';
end $$;

rollback;
