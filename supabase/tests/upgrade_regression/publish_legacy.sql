-- Publish 11 assignments with the OLD RPCs (as the teacher), students answer some, 2 are closed,
-- one published assignment ends up without recipients (Production: 10 of 11 have recipients).
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009a1","role":"authenticated"}', true);
do $$
declare r jsonb; i int;
begin
  for i in 1..11 loop
    r := public.publish_assignment(('00000000-0000-4000-8000-00000000a' || lpad(i::text, 3, '0'))::uuid);
    assert (r ->> 'ok')::boolean, 'seed: publish failed for ' || i || ': ' || r::text;
  end loop;
  perform public.set_assignment_closed(('00000000-0000-4000-8000-00000000a' || lpad(10::text, 3, '0'))::uuid, true);
  perform public.set_assignment_closed(('00000000-0000-4000-8000-00000000a' || lpad(11::text, 3, '0'))::uuid, true);
end $$;
reset role;
-- student 1 works on assignment 1 (draft + submission), student 2 on assignment 2
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009b1","role":"authenticated"}', true);
do $$
declare aq uuid;
begin
  select id into aq from public.assignment_questions where assignment_id = '00000000-0000-4000-8000-00000000a001' order by position limit 1;
  perform public.save_answer(aq, 'int x = 1;');
  perform public.submit_answer(aq);
  perform public.reveal_hint(aq);
end $$;
reset role;
-- 1 assignment ends up without recipients (bypassing the "not started" rule as postgres, only to shape the fixture)
delete from public.assignment_students where assignment_id = '00000000-0000-4000-8000-00000000a009';
-- twin pair for the "v1 == v2" equivalence check: a DRAFT twin published only after the upgrade
insert into public.assignments (id, owner_id, course_id, title) values
  ('00000000-0000-4000-8000-00000000a0d1', '00000000-0000-4000-8000-0000000009a1', '00000000-0000-4000-8000-0000000009c1', 'תאום טיוטה');
insert into public.assignment_questions (assignment_id, question_id, position)
select '00000000-0000-4000-8000-00000000a0d1', question_id, position from public.assignment_questions where assignment_id = '00000000-0000-4000-8000-00000000a003';
insert into public.assignment_students (assignment_id, student_id)
select '00000000-0000-4000-8000-00000000a0d1', student_id from public.assignment_students where assignment_id = '00000000-0000-4000-8000-00000000a003';
commit;
