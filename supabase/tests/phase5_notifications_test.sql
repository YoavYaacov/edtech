-- =====================================================================
-- Phase 5 tests (step 1 — notifications table, triggers, derived view).
-- Safe for the Supabase SQL Editor: FAKE users, everything ROLLED BACK.
-- Success = finishes with no error. Failure stops with "FAIL: ...".
-- Requires migrations up to 20260926000100.
-- =====================================================================
begin;

-- ---------- fixtures (as postgres) ----------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'p5-teacher-a@example.invalid'),
  ('00000000-0000-4000-8000-0000000000a2', 'p5-teacher-b@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b1', 'p5-student-1@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b2', 'p5-student-2@example.invalid');
update public.profiles set role = 'teacher'
where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2');
insert into public.teacher_students (teacher_id, student_id) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2');
insert into public.courses (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'קורס א');
insert into public.course_enrollments (course_id, student_id) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1');
insert into public.questions (id, owner_id, course_id, title, status) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'שאלה 1', 'ready'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'שאלה 2', 'ready'),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'שאלה 3', 'ready');
insert into public.assignments (id, owner_id, course_id, title) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'מטלה');
insert into public.assignment_questions (id, assignment_id, question_id, position) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1', 1),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f2', 2),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f3', 3);
insert into public.assignment_students (assignment_id, student_id) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1');

do $$ begin
  assert (select count(*) from private.applied_migrations where version = '20260926000100') = 1,
         'FAIL: N0 phase 5 migration missing from ledger';
  assert (select count(*) from information_schema.tables
          where table_schema = 'public' and table_name = 'notifications') = 1,
         'FAIL: N0 notifications table missing';
  raise notice 'PASS N0: phase 5 migration recorded in ledger; notifications table exists';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  assert (public.publish_assignment('00000000-0000-4000-8000-0000000000e1')) ->> 'ok' = 'true', 'FAIL: setup publish';
end $$;

-- ---------- student submits all three questions ----------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  perform public.save_answer('00000000-0000-4000-8000-000000000101', 'q1 v1');
  perform public.submit_answer('00000000-0000-4000-8000-000000000101');
  perform public.save_answer('00000000-0000-4000-8000-000000000102', 'q2 v1');
  perform public.submit_answer('00000000-0000-4000-8000-000000000102');
  perform public.save_answer('00000000-0000-4000-8000-000000000103', 'q3 v1');
  perform public.submit_answer('00000000-0000-4000-8000-000000000103');
end $$;

reset role;
do $$ begin
  perform set_config('test.q1', (select s.id::text from public.answer_submissions s join public.answers an on an.id = s.answer_id
      where an.assignment_question_id = '00000000-0000-4000-8000-000000000101' and s.attempt_number = 1), true);
  perform set_config('test.q2', (select s.id::text from public.answer_submissions s join public.answers an on an.id = s.answer_id
      where an.assignment_question_id = '00000000-0000-4000-8000-000000000102' and s.attempt_number = 1), true);
  perform set_config('test.q3', (select s.id::text from public.answer_submissions s join public.answers an on an.id = s.answer_id
      where an.assignment_question_id = '00000000-0000-4000-8000-000000000103' and s.attempt_number = 1), true);
end $$;

-- ---------- N1: submission → teacher gets exactly one unread event per attempt
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.notifications where event_type = 'submission_received') = 3,
         'FAIL: N1 teacher should have 3 submission_received events';
  assert (select count(*) from public.notifications where read_at is not null) = 0, 'FAIL: N1 events should start unread';
  assert (select count(*) from public.teacher_review_queue) = 3, 'FAIL: N1 review queue (derived, unchanged) should still show 3';
  raise notice 'PASS N1: one unread submission_received event per attempt; teacher_review_queue (derived) unaffected';
end $$;

-- ---------- N2: plain release (no return) → feedback_available only ---
-- Note: submission_id is shared by the teacher's earlier submission_received
-- row and the student's new row — RLS scopes each role to only its own, so
-- the ground-truth ("did exactly the right row get added, for everyone")
-- is checked as postgres (reset role), not from either party's own view.
do $$
declare v_s uuid := current_setting('test.q1')::uuid;
begin
  perform public.save_feedback(v_s, 'correct', '', '', null, false);
  assert (public.release_feedback(v_s)) ->> 'ok' = 'true', 'FAIL: N2 release';
end $$;

reset role;
do $$
declare v_s uuid := current_setting('test.q1')::uuid;
begin
  assert (select count(*) from public.notifications where submission_id = v_s) = 2,
         'FAIL: N2 expected exactly 2 events total for this submission (teacher''s submission_received + student''s feedback_available)';
  assert (select count(*) from public.notifications where submission_id = v_s and event_type = 'feedback_available') = 1,
         'FAIL: N2 feedback_available event missing for a plain release';
  assert not exists (select 1 from public.notifications where submission_id = v_s and event_type = 'returned_for_revision'),
         'FAIL: N2 a plain release must not create a returned_for_revision event';
  assert (select count(*) from public.teacher_review_queue where submission_id = v_s) = 0,
         'FAIL: N2 released submission should leave the queue (derived, unchanged)';
  raise notice 'PASS N2: release without return → exactly one feedback_available event added; submission leaves the derived queue';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

-- ---------- N3: release WITH return, same action → one combined event -
do $$
declare v_s uuid := current_setting('test.q2')::uuid;
begin
  perform public.save_feedback(v_s, 'partial', 'יש לתקן', '', null, true);
  assert (public.release_feedback(v_s)) ->> 'returned' = 'true', 'FAIL: N3 release+return';
end $$;

reset role;
do $$
declare v_s uuid := current_setting('test.q2')::uuid;
begin
  assert (select count(*) from public.notifications where submission_id = v_s) = 2,
         'FAIL: N3 expected exactly 2 events total (teacher''s submission_received + student''s ONE combined event)';
  assert (select count(*) from public.notifications where submission_id = v_s and event_type = 'returned_for_revision') = 1,
         'FAIL: N3 decision 79 — release+return together must create a returned_for_revision event';
  assert not exists (select 1 from public.notifications where submission_id = v_s and event_type = 'feedback_available'),
         'FAIL: N3 decision 79 — must NOT also create a separate feedback_available event when return happens at release time';
  raise notice 'PASS N3: simultaneous release+return → a single returned_for_revision event, no separate feedback_available (decision 79)';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

-- ---------- student side: "דורש טיפול" (derived) + unread feed --------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.student_pending_actions) = 1, 'FAIL: N4 only q2 (returned) should require action';
  assert (select assignment_question_id from public.student_pending_actions) = '00000000-0000-4000-8000-000000000102',
         'FAIL: N4 wrong question in student_pending_actions';
  assert (select count(*) from public.notifications) = 2, 'FAIL: N4 student should see 2 stored events (q1 available, q2 returned)';
  assert (select count(*) from public.notifications where read_at is not null) = 0, 'FAIL: N4 should start unread';
  raise notice 'PASS N4: student_pending_actions holds only the returned question; both stored events visible and unread';
end $$;

-- mark one event read (own row) — allowed
do $$
declare v_n uuid;
begin
  select id into v_n from public.notifications where submission_id = current_setting('test.q1')::uuid;
  update public.notifications set read_at = now() where id = v_n;
  assert (select read_at is not null from public.notifications where id = v_n), 'FAIL: N5 own mark-as-read failed';
  -- only read_at is client-writable
  begin update public.notifications set event_type = 'feedback_available' where id = v_n;
        raise exception 'FAIL: N5 client changed event_type';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS N5: recipient can mark own event read; no other column is writable';
end $$;

-- resubmit the returned question (attempt 2)
do $$ begin
  perform public.save_answer('00000000-0000-4000-8000-000000000102', 'q2 v2');
  assert (public.submit_answer('00000000-0000-4000-8000-000000000102')) ->> 'attempt' = '2', 'FAIL: N6 resubmit';
  assert (select count(*) from public.student_pending_actions) = 0, 'FAIL: N6 resubmitted question should leave "דורש טיפול"';
  raise notice 'PASS N6: resubmission clears the derived "requires action" item for the student';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.notifications where event_type = 'submission_received') = 4,
         'FAIL: N7 resubmission should create a new (distinct) submission_received event for the teacher';
  raise notice 'PASS N7: a new attempt creates its own submission_received event (not a duplicate of the first)';
end $$;

-- ---------- N8: sequential events — release (no return), then a LATER return
do $$
declare v_s uuid := current_setting('test.q3')::uuid;
begin
  perform public.save_feedback(v_s, 'correct', '', '', null, false);
  perform public.release_feedback(v_s);
end $$;

reset role;
do $$
declare v_s uuid := current_setting('test.q3')::uuid;
begin
  assert (select count(*) from public.notifications where submission_id = v_s and event_type = 'feedback_available') = 1,
         'FAIL: N8a plain release should add one feedback_available event';
  assert not exists (select 1 from public.notifications where submission_id = v_s and event_type = 'returned_for_revision'),
         'FAIL: N8a no returned_for_revision event should exist yet';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

do $$
declare v_s uuid := current_setting('test.q3')::uuid;
begin
  assert (public.return_for_revision(v_s)) ->> 'ok' = 'true', 'FAIL: N8b late return';
end $$;

reset role;
do $$
declare v_s uuid := current_setting('test.q3')::uuid;
begin
  assert (select count(*) from public.notifications where submission_id = v_s and event_type = 'feedback_available') = 1
     and (select count(*) from public.notifications where submission_id = v_s and event_type = 'returned_for_revision') = 1,
         'FAIL: N8c a release-then-later-return must leave both events, each exactly once';
  raise notice 'PASS N8: a release-then-later-return produces two separate events (feedback_available + returned_for_revision) — unlike N3''s single combined event';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

-- ---------- N9: duplicates cannot be created even if attempted directly
reset role;
do $$
declare v_n public.notifications;
begin
  select * into v_n from public.notifications where event_type = 'submission_received' limit 1;
  begin
    insert into public.notifications (recipient_id, event_type, assignment_id, assignment_question_id, submission_id, student_id)
    values (v_n.recipient_id, v_n.event_type, v_n.assignment_id, v_n.assignment_question_id, v_n.submission_id, v_n.student_id);
    raise exception 'FAIL: N9 duplicate (recipient, event_type, submission_id) accepted';
  exception when unique_violation then null; end;
  raise notice 'PASS N9: (recipient_id, event_type, submission_id) uniqueness enforced at the DB (decision: no duplicates)';
end $$;

-- ---------- N10: RLS isolation + no client writes ----------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.notifications) = 0, 'FAIL: N10 a non-owner teacher sees notifications';
  assert (select count(*) from public.student_pending_actions) = 0, 'FAIL: N10 a non-owner teacher sees pending actions';
  begin perform 1 from public.notifications where id = (select id from public.notifications limit 1) for update;
  exception when others then null; end;
  raise notice 'PASS N10a: teacher B has no visibility into teacher A''s events';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.notifications) = 0, 'FAIL: N10 student 2 sees student 1 notifications';
  assert (select count(*) from public.student_pending_actions) = 0, 'FAIL: N10 student 2 sees student 1 pending actions';
  raise notice 'PASS N10b: student 2 has no visibility into student 1''s events';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
do $$
declare v_other uuid; n int;
begin
  select id into v_other from public.notifications where recipient_id = '00000000-0000-4000-8000-0000000000a1' limit 1;
  -- RLS filters the row silently (0 rows), it does not raise
  update public.notifications set read_at = now() where id = v_other;
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: N11 student marked the teacher''s notification as read';
  begin insert into public.notifications (recipient_id, event_type, assignment_id, assignment_question_id, submission_id, student_id)
        values ('00000000-0000-4000-8000-0000000000b1', 'feedback_available', '00000000-0000-4000-8000-0000000000e1',
                '00000000-0000-4000-8000-000000000101', current_setting('test.q1')::uuid, '00000000-0000-4000-8000-0000000000b1');
        raise exception 'FAIL: N11 client inserted a notification directly';
  exception when insufficient_privilege then null; end;
  begin delete from public.notifications where recipient_id = '00000000-0000-4000-8000-0000000000b1';
        raise exception 'FAIL: N11 client deleted a notification directly';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS N11: notifications are DB/trigger-written only; a client can never insert, delete, or reach into another recipient''s row';
end $$;

-- ---------- N12: anon --------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin perform 1 from public.notifications; raise exception 'FAIL: N12 anon reads notifications';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.student_pending_actions; raise exception 'FAIL: N12 anon reads pending actions';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS N12: anon has no access';
end $$;

-- ---------- cascade (existing pattern preserved) -----------------------
reset role;
do $$ begin
  delete from auth.users where id = '00000000-0000-4000-8000-0000000000b1';
  assert not exists (select 1 from public.notifications where student_id = '00000000-0000-4000-8000-0000000000b1'),
         'FAIL: N13 notifications remain after the student is deleted';
  raise notice 'PASS N13: deleting a student cascades his notifications';
end $$;

rollback;
