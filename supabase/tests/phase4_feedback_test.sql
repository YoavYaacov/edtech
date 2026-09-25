-- =====================================================================
-- Phase 4 tests: review & feedback — RLS, invariants, workflow.
-- Safe for the Supabase SQL Editor: FAKE users, everything ROLLED BACK.
-- Success = finishes with no error. Failure stops with "FAIL: ...".
-- Requires migrations up to 20260925000300.
-- =====================================================================
begin;

-- ---------- fixtures (as postgres) ----------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'p4-teacher-a@example.invalid'),
  ('00000000-0000-4000-8000-0000000000a2', 'p4-teacher-b@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b1', 'p4-student-1@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b2', 'p4-student-2@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b3', 'p4-student-3@example.invalid');
update public.profiles set role = 'teacher'
where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2');
insert into public.teacher_students (teacher_id, student_id) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b3');
insert into public.courses (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'קורס א'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a2', 'קורס ב');
insert into public.topics (id, course_id, title) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 'שרשרת'),
  ('00000000-0000-4000-8000-0000000000d9', '00000000-0000-4000-8000-0000000000c2', 'נושא של ב');
insert into public.course_enrollments (course_id, student_id) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b3');
insert into public.questions (id, owner_id, course_id, title, status) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'שאלה 1', 'ready'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'שאלה 2', 'ready');
insert into public.question_hints (question_id, level, content_md) values
  ('00000000-0000-4000-8000-0000000000f1', 1, 'רמז 1'), ('00000000-0000-4000-8000-0000000000f1', 2, 'רמז 2');
insert into public.question_solutions (question_id, solution_code, explanation_md) values
  ('00000000-0000-4000-8000-0000000000f1', 'פתרון', 'הסבר');
insert into public.assignments (id, owner_id, course_id, title) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'מטלה');
insert into public.assignment_questions (id, assignment_id, question_id, position) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1', 1),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f2', 2);
insert into public.assignment_students (assignment_id, student_id) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b2');

do $$ begin
  assert (select count(*) from private.applied_migrations where version in ('20260925000100', '20260925000200')) = 2,
         'FAIL: F0 phase 4 migrations missing from ledger';
  raise notice 'PASS F0: phase 4 migrations recorded in ledger';
end $$;

-- teacher A publishes
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  assert (public.publish_assignment('00000000-0000-4000-8000-0000000000e1')) ->> 'ok' = 'true', 'FAIL: setup publish';
end $$;

-- students work and submit
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  perform public.save_answer('00000000-0000-4000-8000-000000000101', 's1 q1 v1');
  perform public.submit_answer('00000000-0000-4000-8000-000000000101');
  perform public.save_answer('00000000-0000-4000-8000-000000000102', 's1 q2');
  perform public.submit_answer('00000000-0000-4000-8000-000000000102');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
do $$ begin
  perform public.save_answer('00000000-0000-4000-8000-000000000101', 's2 q1');
  perform public.submit_answer('00000000-0000-4000-8000-000000000101');
end $$;

-- remember submission ids (as postgres)
reset role;
do $$ begin
  perform set_config('test.s1q1', (select s.id::text from public.answer_submissions s join public.answers an on an.id = s.answer_id
      where an.student_id = '00000000-0000-4000-8000-0000000000b1' and an.assignment_question_id = '00000000-0000-4000-8000-000000000101' and s.attempt_number = 1), true);
  perform set_config('test.s1q2', (select s.id::text from public.answer_submissions s join public.answers an on an.id = s.answer_id
      where an.student_id = '00000000-0000-4000-8000-0000000000b1' and an.assignment_question_id = '00000000-0000-4000-8000-000000000102' and s.attempt_number = 1), true);
  perform set_config('test.s2q1', (select s.id::text from public.answer_submissions s join public.answers an on an.id = s.answer_id
      where an.student_id = '00000000-0000-4000-8000-0000000000b2' and an.assignment_question_id = '00000000-0000-4000-8000-000000000101' and s.attempt_number = 1), true);
end $$;

-- ---------- TEACHER A: queue, tags, draft ----------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

do $$ begin
  assert (select count(*) from public.teacher_review_queue) = 3, 'FAIL: F1 queue should hold 3 pending submissions';
  raise notice 'PASS F1: review queue lists the 3 pending submissions';
end $$;

do $$
declare v uuid;
begin
  insert into public.mistake_tags (owner_id, course_id, topic_id, name)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d1', 'איבוד הפניה')
  returning id into v; perform set_config('test.tag_topic', v::text, true);
  insert into public.mistake_tags (owner_id, course_id, name)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'שגיאת תחביר')
  returning id into v; perform set_config('test.tag_general', v::text, true);
  insert into public.mistake_tags (owner_id, course_id, name)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'ישנה')
  returning id into v; perform set_config('test.tag_arch', v::text, true);
  update public.mistake_tags set is_archived = true where id = v;
  insert into public.mistake_tags (owner_id, course_id, name)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'לא בשימוש')
  returning id into v; perform set_config('test.tag_unused', v::text, true);

  begin insert into public.mistake_tags (owner_id, course_id, topic_id, name)
        values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d9', 'נושא זר');
        raise exception 'FAIL: F2 tag with a topic from another course accepted';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin insert into public.mistake_tags (owner_id, course_id, name)
        values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '  שגיאת תחביר ');
        raise exception 'FAIL: F2 duplicate tag name accepted';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin insert into public.mistake_tags (owner_id, course_id, name)
        values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c2', 'בקורס זר');
        raise exception 'FAIL: F2 tag in a foreign course accepted';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  raise notice 'PASS F2: mistake tags – topic + general, same-course topic, unique names, own courses only';
end $$;

do $$
declare r jsonb; v_s uuid := current_setting('test.s1q1')::uuid;
begin
  r := public.save_feedback(v_s, 'partial', '', 'הערה פרטית', array[current_setting('test.tag_topic')::uuid], true);
  assert r ->> 'ok' = 'true' and r ->> 'ready' = 'false', 'FAIL: F3 draft save';
  r := public.release_feedback(v_s);
  assert r ->> 'reason' = 'not_ready', 'FAIL: F3 partial without message released';
  r := public.save_feedback(v_s, '', 'יש הודעה', '', null, false);
  assert (public.release_feedback(v_s)) ->> 'reason' = 'not_ready', 'FAIL: F3 released without verdict';
  r := public.save_feedback(v_s, 'partial', 'כמעט – חסר טיפול ברשימה ריקה', 'הערה פרטית',
                            array[current_setting('test.tag_topic')::uuid, current_setting('test.tag_general')::uuid], true);
  assert r ->> 'ready' = 'true', 'FAIL: F3 ready flag';
  assert (select count(*) from public.submission_mistakes where submission_id = v_s) = 2, 'FAIL: F3 tags not stored';
  begin insert into public.feedback (submission_id, teacher_id) values (v_s, '00000000-0000-4000-8000-0000000000a1');
        raise exception 'FAIL: F3 direct feedback insert allowed';
  exception when insufficient_privilege then null; end;
  begin update public.feedback set released_at = now();
        raise exception 'FAIL: F3 direct feedback update allowed';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS F3: drafts saved atomically; "ready" enforced (decision 62); no direct writes';
end $$;

-- ---------- STUDENT 1 before release ---------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.feedback) = 0, 'FAIL: F4 unreleased feedback visible to student';
  assert (select count(*) from public.feedback_private_notes) = 0, 'FAIL: F4 private notes visible';
  assert (select count(*) from public.mistake_tags) = 0, 'FAIL: F4 mistake tags visible';
  assert (select count(*) from public.submission_mistakes) = 0, 'FAIL: F4 submission tags visible';
  assert (select count(*) from public.teacher_review_queue) = 0, 'FAIL: F4 review queue visible to student';
  raise notice 'PASS F4: student sees no draft feedback, notes, tags or queue';
end $$;

-- ---------- TEACHER A releases with return (invariant 66) ------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$
declare r jsonb; v_s uuid := current_setting('test.s1q1')::uuid; v_answer uuid;
begin
  select answer_id into v_answer from public.answer_submissions where id = v_s;
  assert (select count(*) from public.answer_submissions where answer_id = v_answer) = 1, 'FAIL: F5 setup';
  r := public.release_feedback(v_s);
  assert r ->> 'ok' = 'true' and r ->> 'returned' = 'true', 'FAIL: F5 release+return: ' || r::text;
  assert (select count(*) from public.answer_submissions where answer_id = v_answer) = 1,
         'FAIL: F5 return created a submission (invariant 66)';
  assert (select status from public.answers where id = v_answer) = 'draft', 'FAIL: F5 answer not back to draft';
  assert (select content from public.answers where id = v_answer) = 's1 q1 v1', 'FAIL: F5 draft content changed';
  assert (select returned_at is not null and released_at is not null from public.feedback where submission_id = v_s),
         'FAIL: F5 released/returned timestamps';
  assert (select count(*) from public.teacher_review_queue where submission_id = v_s) = 0, 'FAIL: F5 still in queue';
  assert (public.save_feedback(v_s, 'correct', '', '', null, false)) ->> 'reason' = 'already_released',
         'FAIL: F5 released feedback editable via save_feedback';
  raise notice 'PASS F5: release+return flips answer to draft, creates NO submission, locks the feedback';
end $$;

-- released feedback is immutable even for the database owner (trigger)
reset role;
do $$
declare v_s uuid := current_setting('test.s1q1')::uuid;
begin
  begin update public.feedback set verdict = 'correct' where submission_id = v_s;
        raise exception 'FAIL: F6 verdict changed after release';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin update public.feedback set message_md = 'שונה' where submission_id = v_s;
        raise exception 'FAIL: F6 message changed after release';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin update public.feedback set return_for_revision = false, returned_at = null where submission_id = v_s;
        raise exception 'FAIL: F6 return un-done after release';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  raise notice 'PASS F6: released feedback is immutable (trigger, decision 61)';
end $$;

-- ---------- STUDENT 1 sees released feedback, resubmits --------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
do $$
declare v_s uuid := current_setting('test.s1q1')::uuid; v_released timestamptz; v_answer uuid;
begin
  assert (select count(*) from public.feedback) = 1, 'FAIL: F7 released feedback not visible';
  assert (select verdict from public.feedback) = 'partial', 'FAIL: F7 verdict not visible';
  assert (select count(*) from public.feedback_private_notes) = 0, 'FAIL: F7 private note visible after release';
  assert (select count(*) from public.submission_mistakes) = 0, 'FAIL: F7 tags visible after release';
  assert (select count(*) from public.mistake_tags) = 0, 'FAIL: F7 tag list visible';
  select released_at into v_released from public.feedback;
  begin update public.feedback set verdict = 'correct'; raise exception 'FAIL: F7 student changed feedback';
  exception when insufficient_privilege then null; end;
  begin perform public.save_feedback(v_s, 'correct', 'x', '', null, false); raise exception 'FAIL: F7 student saved feedback';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.return_for_revision(current_setting('test.s1q2')::uuid); raise exception 'FAIL: F7 student returned';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.teacher_reveal_solution('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000b1');
        raise exception 'FAIL: F7 student revealed own solution';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.submit_answer('00000000-0000-4000-8000-000000000102'); -- q2 not returned: still submitted
        if (select count(*) from public.answer_submissions s join public.answers an on an.id = s.answer_id
            where an.assignment_question_id = '00000000-0000-4000-8000-000000000102') <> 1 then
          raise exception 'FAIL: F7 new attempt without return';
        end if;
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;

  -- resubmission: only submit_answer creates attempt 2
  perform public.save_answer('00000000-0000-4000-8000-000000000101', 's1 q1 v2');
  assert (select count(*) from public.answer_submissions s join public.answers an on an.id = s.answer_id
          where an.assignment_question_id = '00000000-0000-4000-8000-000000000101') = 1,
         'FAIL: F7 autosave created a submission';
  assert (public.submit_answer('00000000-0000-4000-8000-000000000101')) ->> 'attempt' = '2', 'FAIL: F7 resubmit not attempt 2';
  select answer_id into v_answer from public.answer_submissions where id = v_s;
  assert (select content from public.answer_submissions where id = v_s) = 's1 q1 v1', 'FAIL: F7 attempt 1 content changed';
  assert (select content from public.answer_submissions where answer_id = v_answer and attempt_number = 2) = 's1 q1 v2',
         'FAIL: F7 attempt 2 content';
  assert (select verdict = 'partial' and message_md = 'כמעט – חסר טיפול ברשימה ריקה' and released_at = v_released
          from public.feedback where submission_id = v_s), 'FAIL: F7 attempt 1 feedback changed';
  raise notice 'PASS F7: student sees verdict+message only; cannot write; attempt 2 only via submit; attempt 1 + feedback unchanged';
end $$;

-- ---------- decision 68: teacher-only metadata after release ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$
declare r jsonb; v_s uuid := current_setting('test.s1q1')::uuid; v_rel timestamptz; v_ret timestamptz;
begin
  select released_at, returned_at into v_rel, v_ret from public.feedback where submission_id = v_s;
  r := public.save_feedback_metadata(v_s, 'הערה אחרי שחרור', array[current_setting('test.tag_general')::uuid]);
  assert r ->> 'ok' = 'true', 'FAIL: F20 metadata update after release: ' || r::text;
  assert (select n.note_md from public.feedback_private_notes n join public.feedback f on f.id = n.feedback_id
          where f.submission_id = v_s) = 'הערה אחרי שחרור', 'FAIL: F20 private note not updated after release';
  assert (select array_agg(mistake_tag_id) from public.submission_mistakes where submission_id = v_s)
         = array[current_setting('test.tag_general')::uuid], 'FAIL: F20 tags not replaced after release';
  assert (select verdict = 'partial' and message_md = 'כמעט – חסר טיפול ברשימה ריקה' and return_for_revision
                 and released_at = v_rel and returned_at = v_ret
          from public.feedback where submission_id = v_s), 'FAIL: F20 student-facing feedback changed';
  -- attempt 1 is released AND no longer the latest: save_feedback must refuse (either reason blocks it)
  r := public.save_feedback(v_s, 'correct', 'שינוי', '', null, false);
  assert r ->> 'ok' = 'false', 'FAIL: F20 save_feedback reopened after release';
  assert (select verdict = 'partial' and message_md = 'כמעט – חסר טיפול ברשימה ריקה' from public.feedback where submission_id = v_s),
         'FAIL: F20 verdict/message changed by a refused save';
  begin perform public.save_feedback_metadata(v_s, 'לא אמור להישמר',
          array[current_setting('test.tag_general')::uuid, current_setting('test.tag_arch')::uuid]);
        raise exception 'FAIL: F20 archived tag attached via metadata';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  assert (select n.note_md from public.feedback_private_notes n join public.feedback f on f.id = n.feedback_id
          where f.submission_id = v_s) = 'הערה אחרי שחרור', 'FAIL: F20 failed update left partial changes';
  -- a tag attached earlier and archived later may be kept
  update public.mistake_tags set is_archived = true where id = current_setting('test.tag_general')::uuid;
  r := public.save_feedback_metadata(v_s, 'עדכון נוסף', array[current_setting('test.tag_general')::uuid]);
  assert r ->> 'ok' = 'true', 'FAIL: F20 keeping an attached, later-archived tag failed';
  update public.mistake_tags set is_archived = false where id = current_setting('test.tag_general')::uuid;
  raise notice 'PASS F20: after release – note and tags editable via save_feedback_metadata; verdict/message/return untouched';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.feedback_private_notes) = 0, 'FAIL: F20b note visible to student after metadata update';
  assert (select count(*) from public.submission_mistakes) = 0, 'FAIL: F20b tags visible to student after metadata update';
  assert (select verdict from public.feedback where submission_id = current_setting('test.s1q1')::uuid) = 'partial',
         'FAIL: F20b student sees changed verdict';
  begin perform public.save_feedback_metadata(current_setting('test.s1q1')::uuid, 'x', null);
        raise exception 'FAIL: F20b student called save_feedback_metadata';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  raise notice 'PASS F20b: student still sees no private note / tags and cannot edit metadata';
end $$;

reset role;
do $$ begin
  perform set_config('test.s1q1b', (select s.id::text from public.answer_submissions s join public.answers an on an.id = s.answer_id
    where an.student_id = '00000000-0000-4000-8000-0000000000b1' and an.assignment_question_id = '00000000-0000-4000-8000-000000000101'
      and s.attempt_number = 2), true);
end $$;

-- ---------- STUDENT 2: privacy -------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.feedback) = 0, 'FAIL: F8 student 2 sees student 1 feedback';
  raise notice 'PASS F8: student cannot read another student''s released feedback';
end $$;

-- ---------- TEACHER A: queue after resubmission, bulk release --------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  assert (select attempt_number from public.teacher_review_queue where submission_id = current_setting('test.s1q1b')::uuid) = 2,
         'FAIL: F9 attempt 2 not in queue';
  assert (select count(*) from public.teacher_review_queue) = 3, 'FAIL: F9 queue size';
  raise notice 'PASS F9: resubmitted attempt 2 is back in the queue';
end $$;

do $$
declare p jsonb; r jsonb; v_ids uuid[];
begin
  perform public.save_feedback(current_setting('test.s1q2')::uuid, 'correct', '', '', null, false);       -- ready
  perform public.save_feedback(current_setting('test.s2q1')::uuid, 'needs_fix', '', '', null, false);     -- not ready
  p := public.preview_ready_feedback('00000000-0000-4000-8000-0000000000e1');
  assert jsonb_array_length(p -> 'ready_ids') = 1 and (p ->> 'not_ready')::int = 1 and (p ->> 'no_feedback')::int = 1,
         'FAIL: F10 preview counts: ' || p::text;
  select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(p -> 'ready_ids') x;
  r := public.release_ready_feedback('00000000-0000-4000-8000-0000000000e1', v_ids);
  assert r ->> 'ok' = 'true' and (r ->> 'released')::int = 1, 'FAIL: F10 bulk release';
  assert (select released_at is null from public.feedback where submission_id = current_setting('test.s2q1')::uuid),
         'FAIL: F10 not-ready draft was released';
  assert not exists (select 1 from public.feedback where submission_id = current_setting('test.s1q1b')::uuid),
         'FAIL: F10 bulk created feedback for a submission without one';

  -- all-or-nothing: preview 2 ready, then one changes → nothing released
  perform public.save_feedback(current_setting('test.s2q1')::uuid, 'needs_fix', 'יש לתקן את התנאי', '', null, false);
  perform public.save_feedback(current_setting('test.s1q1b')::uuid, 'correct', '', '', null, false);
  p := public.preview_ready_feedback('00000000-0000-4000-8000-0000000000e1');
  assert jsonb_array_length(p -> 'ready_ids') = 2, 'FAIL: F10 second preview';
  select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(p -> 'ready_ids') x;
  perform public.save_feedback(current_setting('test.s1q1b')::uuid, 'partial', '', '', null, false);      -- no longer ready
  r := public.release_ready_feedback('00000000-0000-4000-8000-0000000000e1', v_ids);
  assert r ->> 'ok' = 'false' and r ->> 'reason' = 'stale', 'FAIL: F10 stale list accepted: ' || r::text;
  assert (select released_at is null from public.feedback where submission_id = current_setting('test.s2q1')::uuid),
         'FAIL: F10 partial release (all-or-nothing violated)';
  r := public.release_ready_feedback('00000000-0000-4000-8000-0000000000e1',
         array[current_setting('test.s2q1')::uuid, '00000000-0000-4000-8000-00000000dead'::uuid]);
  assert r ->> 'reason' = 'stale', 'FAIL: F10 foreign id accepted';
  r := public.release_ready_feedback('00000000-0000-4000-8000-0000000000e1',
         array[current_setting('test.s2q1')::uuid, current_setting('test.s2q1')::uuid]);
  assert r ->> 'reason' = 'stale', 'FAIL: F10 duplicate ids accepted';
  assert (select released_at is null from public.feedback where submission_id = current_setting('test.s2q1')::uuid),
         'FAIL: F10 something was released by a rejected call';
  raise notice 'PASS F10: bulk release = exact previewed list, all-or-nothing; never touches not-ready or missing feedback';
end $$;

do $$
declare r jsonb; v_answer uuid;
begin
  select answer_id into v_answer from public.answer_submissions where id = current_setting('test.s1q2')::uuid;
  r := public.return_for_revision(current_setting('test.s1q2')::uuid);
  assert r ->> 'ok' = 'true', 'FAIL: F11 late return: ' || r::text;
  assert (select status from public.answers where id = v_answer) = 'draft', 'FAIL: F11 not back to draft';
  assert (select count(*) from public.answer_submissions where answer_id = v_answer) = 1, 'FAIL: F11 late return created a submission';
  assert (select verdict = 'correct' and return_for_revision and returned_at is not null
          from public.feedback where submission_id = current_setting('test.s1q2')::uuid), 'FAIL: F11 feedback state';
  assert (public.return_for_revision(current_setting('test.s1q2')::uuid)) ->> 'reason' = 'already_returned', 'FAIL: F11 double return';
  assert (public.return_for_revision(current_setting('test.s1q1')::uuid)) ->> 'reason' = 'not_latest', 'FAIL: F11 return on old attempt';
  assert (public.save_feedback(current_setting('test.s1q1')::uuid, 'correct', '', '', null, false)) ->> 'reason' = 'not_latest',
         'FAIL: F11 draft on old attempt';
  raise notice 'PASS F11: late return works on the latest attempt only, creates no submission, keeps verdict';
end $$;

do $$
declare r jsonb; p jsonb;
begin
  assert (public.set_assignment_closed('00000000-0000-4000-8000-0000000000e1', true)) ->> 'ok' = 'true', 'FAIL: F12 close';
  perform public.save_feedback(current_setting('test.s2q1')::uuid, 'needs_fix', 'יש לתקן את התנאי', '', null, true);
  r := public.release_feedback(current_setting('test.s2q1')::uuid);
  assert r ->> 'reason' = 'closed_no_return', 'FAIL: F12 return in closed assignment';
  assert (select released_at is null from public.feedback where submission_id = current_setting('test.s2q1')::uuid), 'FAIL: F12 partially released';
  p := public.preview_ready_feedback('00000000-0000-4000-8000-0000000000e1');
  assert (p ->> 'blocked_closed')::int = 1 and jsonb_array_length(p -> 'ready_ids') = 0, 'FAIL: F12 preview in closed: ' || p::text;
  perform public.save_feedback(current_setting('test.s2q1')::uuid, 'needs_fix', 'יש לתקן את התנאי', '', null, false);
  assert (public.release_feedback(current_setting('test.s2q1')::uuid)) ->> 'ok' = 'true', 'FAIL: F12 release in closed';
  assert (public.return_for_revision(current_setting('test.s2q1')::uuid)) ->> 'reason' = 'closed_no_return', 'FAIL: F12 late return in closed';
  assert (public.set_assignment_closed('00000000-0000-4000-8000-0000000000e1', false)) ->> 'ok' = 'true', 'FAIL: F12 reopen';
  raise notice 'PASS F12: closed assignment – review and release allowed, return blocked';
end $$;

do $$
declare r jsonb;
begin
  update public.assignment_questions set hint_policy = 'locked', solution_policy = 'locked'
  where id = '00000000-0000-4000-8000-000000000101';
  assert (public.teacher_reveal_hint('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000b2')) ->> 'level' = '1', 'FAIL: F13 hint 1';
  assert (public.teacher_reveal_hint('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000b2')) ->> 'level' = '2', 'FAIL: F13 hint 2';
  assert (public.teacher_reveal_hint('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000b2')) ->> 'reason' = 'no_more_hints', 'FAIL: F13 hint 3';
  assert (public.teacher_reveal_solution('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000b2')) ->> 'ok' = 'true', 'FAIL: F13 solution';
  assert (public.teacher_reveal_hint('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000b3')) ->> 'reason' = 'not_recipient', 'FAIL: F13 non-recipient';
  assert (select count(*) from public.question_reveals where student_id = '00000000-0000-4000-8000-0000000000b2'
          and revealed_by = '00000000-0000-4000-8000-0000000000a1') = 3, 'FAIL: F13 revealed_by';
  raise notice 'PASS F13: manual reveal (next hint, solution) for one student, even with locked policy';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.assignment_question_hints) = 2, 'FAIL: F13b student 2 does not see opened hints';
  assert (select count(*) from public.assignment_question_solutions) = 1, 'FAIL: F13b student 2 does not see opened solution';
  assert (select count(*) from public.feedback) = 1, 'FAIL: F13b student 2 released feedback';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.assignment_question_hints) = 0, 'FAIL: F13b hints opened for S2 visible to S1';
  assert (select count(*) from public.assignment_question_solutions) = 0, 'FAIL: F13b solution opened for S2 visible to S1';
  raise notice 'PASS F13b: manual reveals are per student';
end $$;

-- ---------- TEACHER B (not the owner) --------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.teacher_review_queue) = 0, 'FAIL: F14 queue';
  assert (select count(*) from public.feedback) = 0, 'FAIL: F14 feedback';
  assert (select count(*) from public.feedback_private_notes) = 0, 'FAIL: F14 notes';
  assert (select count(*) from public.mistake_tags) = 0, 'FAIL: F14 tags';
  assert (select count(*) from public.submission_mistakes) = 0, 'FAIL: F14 submission tags';
  begin perform public.save_feedback(current_setting('test.s1q1b')::uuid, 'correct', '', '', null, false); raise exception 'FAIL: F14 save';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.preview_ready_feedback('00000000-0000-4000-8000-0000000000e1'); raise exception 'FAIL: F14 preview';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.release_ready_feedback('00000000-0000-4000-8000-0000000000e1', array[current_setting('test.s1q1b')::uuid]);
        raise exception 'FAIL: F14 bulk';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.teacher_reveal_hint('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000b1');
        raise exception 'FAIL: F14 reveal';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin insert into public.mistake_tags (owner_id, course_id, name)
        values ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c1', 'פלישה');
        raise exception 'FAIL: F14 tag in A''s course';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  raise notice 'PASS F14: a non-owner teacher gets no access and no actions';
end $$;

-- ---------- tags integrity -------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$
declare n int;
begin
  begin perform public.save_feedback(current_setting('test.s1q1b')::uuid, 'correct', '', '', array[current_setting('test.tag_arch')::uuid], false);
        raise exception 'FAIL: F15 archived tag attached';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  -- tag_general is attached to attempt 1 (since F20) → in use
  begin delete from public.mistake_tags where id = current_setting('test.tag_general')::uuid;
        raise exception 'FAIL: F15 used tag deleted';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  delete from public.mistake_tags where id = current_setting('test.tag_unused')::uuid;
  get diagnostics n = row_count;
  assert n = 1, 'FAIL: F15 unused tag not deletable';
  raise notice 'PASS F15: archived tags not attachable; used tags not deletable; unused tags deletable';
end $$;

reset role;
do $$
declare v_tag uuid;
begin
  insert into public.mistake_tags (owner_id, course_id, name)
  values ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c2', 'תגית של ב') returning id into v_tag;
  perform set_config('test.tag_b', v_tag::text, true);
  begin insert into public.submission_mistakes (submission_id, mistake_tag_id) values (current_setting('test.s1q1b')::uuid, v_tag);
        raise exception 'FAIL: F15b tag from another course attached';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  raise notice 'PASS F15b: a tag from another course cannot be attached (trigger)';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  begin perform public.save_feedback_metadata(current_setting('test.s1q1')::uuid, '', array[current_setting('test.tag_b')::uuid]);
        raise exception 'FAIL: F21 tag from another course attached via metadata';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
do $$ begin
  begin perform public.save_feedback_metadata(current_setting('test.s1q1')::uuid, 'פלישה', null);
        raise exception 'FAIL: F21 another teacher edited the metadata';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  raise notice 'PASS F21: foreign-course tag rejected; another teacher cannot edit metadata';
end $$;
reset role;

-- ---------- invariant: every non-latest attempt has released feedback with return
do $$ begin
  assert not exists (
    select 1 from public.answer_submissions s
    where s.attempt_number < (select max(s2.attempt_number) from public.answer_submissions s2 where s2.answer_id = s.answer_id)
      and not exists (select 1 from public.feedback f where f.submission_id = s.id
                      and f.released_at is not null and f.return_for_revision)
  ), 'FAIL: F16 a non-latest attempt lacks released feedback with return';
  raise notice 'PASS F16: attempts invariant holds';
end $$;

-- ---------- safe_delete_v2 --------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$
declare r jsonb; v_c uuid;
begin
  r := public.delete_topic('00000000-0000-4000-8000-0000000000d1');
  assert r ->> 'reason' = 'has_mistake_tags', 'FAIL: F17 topic with tags reported: ' || r::text;
  insert into public.courses (owner_id, title) values ('00000000-0000-4000-8000-0000000000a1', 'קורס ריק') returning id into v_c;
  insert into public.mistake_tags (owner_id, course_id, name) values ('00000000-0000-4000-8000-0000000000a1', v_c, 'כללית');
  r := public.delete_course(v_c, false);
  assert r ->> 'reason' = 'has_mistake_tags', 'FAIL: F17 course with tags: ' || r::text;
  assert exists (select 1 from public.courses where id = v_c), 'FAIL: F17 course deleted';
  raise notice 'PASS F17: safe delete v2 explains mistake-tag dependencies';
end $$;

-- ---------- ANON ------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin perform 1 from public.feedback; raise exception 'FAIL: F18 anon reads feedback';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.teacher_review_queue; raise exception 'FAIL: F18 anon reads queue';
  exception when insufficient_privilege then null; end;
  begin perform public.save_feedback(current_setting('test.s1q1b')::uuid, 'correct', '', '', null, false);
        raise exception 'FAIL: F18 anon calls save_feedback';
  exception when insufficient_privilege then null; end;
  begin perform public.save_feedback_metadata(current_setting('test.s1q1b')::uuid, '', null);
        raise exception 'FAIL: F18 anon calls save_feedback_metadata';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS F18: anon has no access';
end $$;

-- ---------- cascade (Phase 1 behaviour preserved) --------------------
reset role;
do $$ begin
  delete from auth.users where id = '00000000-0000-4000-8000-0000000000b1';
  assert not exists (select 1 from public.feedback where submission_id = current_setting('test.s1q1')::uuid), 'FAIL: F19 feedback remains';
  assert exists (select 1 from public.mistake_tags where id = current_setting('test.tag_topic')::uuid), 'FAIL: F19 tag deleted with student';
  raise notice 'PASS F19: deleting a student cascades his feedback; tags stay';
end $$;

rollback;
