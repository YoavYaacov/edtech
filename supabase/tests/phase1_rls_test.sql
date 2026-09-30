-- =====================================================================
-- Phase 1 RLS tests.
-- Safe to run in the Supabase SQL editor: creates FAKE users inside a
-- transaction and ROLLS BACK at the end. Nothing is persisted.
-- Success = the script finishes with no error.
-- A failure stops the script with a message starting with "FAIL:".
-- =====================================================================
begin;

-- ---------- fixtures (as postgres) ----------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'test-teacher@example.invalid', '{"full_name":"מורה בדיקה"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'test-student@example.invalid', '{"full_name":"תלמיד בדיקה"}'),
  ('00000000-0000-4000-8000-0000000000b2', 'test-other@example.invalid',   '{"full_name":"תלמיד אחר"}'),
  ('00000000-0000-4000-8000-0000000000c1', 'test-sneaky@example.invalid',  '{"full_name":"x","role":"teacher"}');

-- T0: trigger created profiles, all as student (metadata role ignored)
do $$
begin
  assert (select count(*) from public.profiles
          where id::text like '00000000-0000-4000-8000-%') = 4,
         'FAIL: T0 profiles not created by trigger';
  assert (select role from public.profiles
          where id = '00000000-0000-4000-8000-0000000000c1') = 'student',
         'FAIL: T0 role taken from user metadata';
  raise notice 'PASS T0: profiles auto-created, role always student';
end $$;

update public.profiles set role = 'teacher'
where id = '00000000-0000-4000-8000-0000000000a1';

insert into public.teacher_students (teacher_id, student_id) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1');

-- T1: integrity trigger rejects a non-teacher as teacher_id
do $$
begin
  begin
    insert into public.teacher_students (teacher_id, student_id) values
      ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b1');
    raise exception 'FAIL: T1 student accepted as teacher_id';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  raise notice 'PASS T1: role integrity trigger';
end $$;

-- ---------- as STUDENT ----------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);

do $$
begin
  -- sees self + own teacher only
  assert (select count(*) from public.profiles) = 2,
         'FAIL: T2 student sees wrong number of profiles';
  assert not exists (select 1 from public.profiles
                     where id = '00000000-0000-4000-8000-0000000000b2'),
         'FAIL: T2 student sees another student';
  raise notice 'PASS T2: student reads only self + own teacher';
end $$;

do $$
begin
  begin
    update public.profiles set role = 'teacher'
    where id = '00000000-0000-4000-8000-0000000000b1';
    raise exception 'FAIL: T3 student changed own role';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS T3: student cannot change role';
end $$;

do $$
declare n int;
begin
  update public.profiles set full_name = 'שם חדש'
  where id = '00000000-0000-4000-8000-0000000000b1';
  get diagnostics n = row_count;
  assert n = 1, 'FAIL: T4 student could not update own name';

  update public.profiles set full_name = 'hacked'
  where id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: T4 student updated teacher name';
  raise notice 'PASS T4: student updates only own name';
end $$;

do $$
begin
  begin
    insert into public.teacher_students (teacher_id, student_id) values
      ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2');
    raise exception 'FAIL: T5 student inserted a relationship';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS T5: student cannot create relationships';
end $$;

do $$
declare n int;
begin
  update public.teacher_students set status = 'archived'
  where student_id = '00000000-0000-4000-8000-0000000000b1';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: T6 student archived own relationship';
  raise notice 'PASS T6: student cannot change relationship status';
end $$;

-- ---------- as TEACHER ----------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

do $$
begin
  assert (select count(*) from public.profiles) = 2,
         'FAIL: T7 teacher sees wrong number of profiles';
  assert not exists (select 1 from public.profiles
                     where id = '00000000-0000-4000-8000-0000000000b2'),
         'FAIL: T7 teacher sees a student that is not theirs';
  raise notice 'PASS T7: teacher reads only self + own students';
end $$;

do $$
begin
  begin
    update public.profiles set role = 'student'
    where id = '00000000-0000-4000-8000-0000000000b1';
    raise exception 'FAIL: T8 teacher changed a role from the client';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS T8: roles are not client-writable, even for teachers';
end $$;

do $$
declare n int;
begin
  update public.teacher_students set status = 'archived'
  where student_id = '00000000-0000-4000-8000-0000000000b1';
  get diagnostics n = row_count;
  assert n = 1, 'FAIL: T9 teacher could not archive own student';

  -- archived (decision of 30.09.2026, migration 20260930000100): the teacher KEEPS reading the
  -- profile (the name stays visible in past submissions / feedback), but loses every
  -- "active student" capability: new enrollments / assignments require private.teaches().
  assert exists (select 1 from public.profiles
                 where id = '00000000-0000-4000-8000-0000000000b1'),
         'FAIL: T9 archived student name must stay readable for the history';
  assert not private.teaches('00000000-0000-4000-8000-0000000000b1'),
         'FAIL: T9 archived student must not count as an active student';
  raise notice 'PASS T9: archiving hides the student from active use but keeps the name readable';
end $$;

-- ---------- as ANON --------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform 1 from public.profiles;
    raise exception 'FAIL: T10 anon can read profiles';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS T10: anon has no access';
end $$;

reset role;
rollback;
