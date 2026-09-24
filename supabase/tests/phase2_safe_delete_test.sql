-- =====================================================================
-- Phase 2 — safe delete tests (migration 20260924000100).
-- Safe for the Supabase SQL Editor: FAKE users, everything ROLLED BACK.
-- Success = finishes with no error. Failure stops with "FAIL: ...".
-- =====================================================================
begin;

-- ---------- fixtures (as postgres) ----------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'sd-teacher-a@example.invalid'),
  ('00000000-0000-4000-8000-0000000000a2', 'sd-teacher-b@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b1', 'sd-student@example.invalid');
update public.profiles set role = 'teacher'
where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2');
insert into public.teacher_students (teacher_id, student_id)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1');

-- c1: course with a used topic; c2: empty course with a tree; c3: course with a student only
insert into public.courses (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'קורס בשימוש'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a1', 'קורס ריק'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000a1', 'קורס עם תלמיד');
-- c1 tree: unit d1 → topic d2 (used by a question) ; unit d4 → d5 → d6 (unused) ; d7 archived, unused
insert into public.topics (id, course_id, parent_id, title) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', null, 'יחידה בשימוש'),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000c1', null, 'יחידה ריקה'),
  ('00000000-0000-4000-8000-0000000000d7', '00000000-0000-4000-8000-0000000000c1', null, 'דוגמה בלבד!');
insert into public.topics (id, course_id, parent_id, title) values
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d1', 'נושא בשימוש'),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d4', 'נושא ריק');
insert into public.topics (id, course_id, parent_id, title) values
  ('00000000-0000-4000-8000-0000000000d6', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d5', 'תת-נושא ריק');
update public.topics set is_archived = true where id = '00000000-0000-4000-8000-0000000000d7';
-- d8: unused topic kept only to prove that direct DELETE is refused by privileges
insert into public.topics (id, course_id, parent_id, title) values
  ('00000000-0000-4000-8000-0000000000d8', '00000000-0000-4000-8000-0000000000c1', null, 'נושא לבדיקת הרשאות');
-- c2 tree (3 levels, unused)
insert into public.topics (id, course_id, parent_id, title) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c2', null, 'יחידה');
insert into public.topics (id, course_id, parent_id, title) values
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000e1', 'נושא');
insert into public.topics (id, course_id, parent_id, title) values
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000e2', 'תת-נושא');
insert into public.course_enrollments (course_id, student_id)
values ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000b1');
insert into public.questions (id, owner_id, course_id, title) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'שאלה');
insert into public.question_topics (question_id, topic_id)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d2');

do $$ begin
  assert exists (select 1 from private.applied_migrations where version = '20260924000100'), 'FAIL: S0 migration not in ledger';
  raise notice 'PASS S0: safe_delete migration recorded in ledger';
end $$;

-- ---------- as TEACHER A --------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

do $$
declare r jsonb;
begin
  -- used topic: blocked, also when not a dry run
  r := public.delete_topic('00000000-0000-4000-8000-0000000000d2');
  assert r ->> 'deletable' = 'false' and r ->> 'reason' = 'has_questions', 'FAIL: S1 used topic reported deletable';
  r := public.delete_topic('00000000-0000-4000-8000-0000000000d2', false);
  assert r ->> 'deletable' = 'false', 'FAIL: S1 used topic deleted';
  assert exists (select 1 from public.topics where id = '00000000-0000-4000-8000-0000000000d2'), 'FAIL: S1 used topic missing';
  -- parent of a used topic: blocked
  r := public.delete_topic('00000000-0000-4000-8000-0000000000d1', false);
  assert r ->> 'reason' = 'has_questions', 'FAIL: S1 parent of used topic not blocked';
  assert (select count(*) from public.topics where id in ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2')) = 2,
         'FAIL: S1 something was deleted';
  raise notice 'PASS S1: topics linked to questions (directly or below) cannot be deleted';
end $$;

do $$
declare r jsonb;
begin
  r := public.delete_topic('00000000-0000-4000-8000-0000000000d4');
  assert r ->> 'deletable' = 'true' and (r ->> 'topics')::int = 3, 'FAIL: S2 dry run wrong';
  assert (select count(*) from public.topics where id in ('00000000-0000-4000-8000-0000000000d4','00000000-0000-4000-8000-0000000000d5','00000000-0000-4000-8000-0000000000d6')) = 3,
         'FAIL: S2 dry run deleted something';
  r := public.delete_topic('00000000-0000-4000-8000-0000000000d4', false);
  assert r ->> 'deleted' = 'true', 'FAIL: S2 unused unit not deleted';
  assert not exists (select 1 from public.topics where id in ('00000000-0000-4000-8000-0000000000d4','00000000-0000-4000-8000-0000000000d5','00000000-0000-4000-8000-0000000000d6')),
         'FAIL: S2 subtree not fully deleted';
  raise notice 'PASS S2: unused unit with its subtree is deleted; dry run changes nothing';
end $$;

do $$
declare r jsonb;
begin
  r := public.delete_topic('00000000-0000-4000-8000-0000000000d7', false);
  assert r ->> 'deleted' = 'true', 'FAIL: S3 unused archived topic not deleted';
  raise notice 'PASS S3: an unused archived topic ("דוגמה בלבד!") can be deleted';
end $$;

do $$
declare r jsonb;
begin
  r := public.delete_course('00000000-0000-4000-8000-0000000000c1', false);
  assert r ->> 'reason' = 'has_questions', 'FAIL: S4 course with questions not blocked';
  r := public.delete_course('00000000-0000-4000-8000-0000000000c3', false);
  assert r ->> 'reason' = 'has_students', 'FAIL: S4 course with students not blocked';
  assert (select count(*) from public.courses where id in ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000c3')) = 2,
         'FAIL: S4 blocked course was deleted';
  assert exists (select 1 from public.course_enrollments where course_id = '00000000-0000-4000-8000-0000000000c3'),
         'FAIL: S4 enrollment removed';
  raise notice 'PASS S4: courses with questions or students cannot be deleted';
end $$;

do $$
declare r jsonb;
begin
  r := public.delete_course('00000000-0000-4000-8000-0000000000c2');
  assert r ->> 'deletable' = 'true' and (r ->> 'topics')::int = 3, 'FAIL: S5 dry run wrong';
  r := public.delete_course('00000000-0000-4000-8000-0000000000c2', false);
  assert r ->> 'deleted' = 'true', 'FAIL: S5 empty course not deleted';
  assert not exists (select 1 from public.courses where id = '00000000-0000-4000-8000-0000000000c2'), 'FAIL: S5 course remains';
  assert not exists (select 1 from public.topics where course_id = '00000000-0000-4000-8000-0000000000c2'), 'FAIL: S5 topics remain';
  raise notice 'PASS S5: empty course is deleted together with its 3-level topic tree';
end $$;

do $$ begin
  begin delete from public.topics where id = '00000000-0000-4000-8000-0000000000d8';
        raise exception 'FAIL: S6 direct DELETE on topics allowed';
  exception
    when insufficient_privilege then null;
    when others then if sqlerrm like 'FAIL:%' then raise; end if;
                     raise exception 'FAIL: S6 direct DELETE on topics reached the table: %', sqlerrm;
  end;
  begin delete from public.courses where id = '00000000-0000-4000-8000-0000000000c3';
        raise exception 'FAIL: S6 direct DELETE on courses allowed';
  exception
    when insufficient_privilege then null;
    when others then if sqlerrm like 'FAIL:%' then raise; end if;
                     raise exception 'FAIL: S6 direct DELETE on courses reached the table: %', sqlerrm;
  end;
  raise notice 'PASS S6: direct API deletes are still impossible';
end $$;

-- ---------- as TEACHER B --------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
do $$ begin
  begin perform public.delete_topic('00000000-0000-4000-8000-0000000000d1', true);
        raise exception 'FAIL: S7 teacher B inspected A''s topic';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.delete_course('00000000-0000-4000-8000-0000000000c1', false);
        raise exception 'FAIL: S7 teacher B called delete on A''s course';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  raise notice 'PASS S7: another teacher cannot inspect or delete';
end $$;

-- ---------- as STUDENT ----------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  begin perform public.delete_course('00000000-0000-4000-8000-0000000000c3', false);
        raise exception 'FAIL: S8 student deleted his course';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  raise notice 'PASS S8: student cannot delete';
end $$;

-- ---------- as ANON --------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin perform public.delete_topic('00000000-0000-4000-8000-0000000000d1', true);
        raise exception 'FAIL: S9 anon executed delete_topic';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS S9: anon cannot execute delete functions';
end $$;

reset role;
rollback;
