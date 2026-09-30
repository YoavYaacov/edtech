-- =====================================================================
-- Phase 7 / Workstream A tests — student & auth hardening.
-- Safe for the Supabase SQL Editor: FAKE users, everything ROLLED BACK.
-- Success = finishes with no error. Failure stops with "FAIL: ...".
-- Requires migrations up to 20260930000200 (admin_provision_student v2).
-- =====================================================================
begin;

-- ---------- fixtures (as postgres) ----------------------------------
insert into auth.users (id, email, email_confirmed_at, encrypted_password, last_sign_in_at) values
  ('00000000-0000-4000-8000-000000000701', 'p7-teacher-a@example.invalid', now(), 'x', now()),
  ('00000000-0000-4000-8000-000000000702', 'p7-teacher-b@example.invalid', now(), 'x', now()),
  ('00000000-0000-4000-8000-000000000711', 'p7-active@example.invalid',   now(), 'x', now()),            -- active
  ('00000000-0000-4000-8000-000000000712', 'p7-pending@example.invalid',  null,  '',  null),             -- invited, not confirmed
  ('00000000-0000-4000-8000-000000000713', 'p7-nopass@example.invalid',   now(), '',  null),             -- confirmed, no password
  ('00000000-0000-4000-8000-000000000714', 'P7-Ghost@Example.invalid',    now(), 'x', now());            -- will become a ghost
update public.profiles set role = 'teacher'
where id in ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000702');
update public.profiles set full_name = 'תלמיד פעיל' where id = '00000000-0000-4000-8000-000000000711';
insert into public.teacher_students (teacher_id, student_id) values
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000711'),
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000712'),
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000713'),
  ('00000000-0000-4000-8000-000000000702', '00000000-0000-4000-8000-000000000711');
insert into public.courses (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000007c1', '00000000-0000-4000-8000-000000000701', 'קורס א'),
  ('00000000-0000-4000-8000-0000000007c2', '00000000-0000-4000-8000-000000000702', 'קורס של מורה ב');
insert into public.course_enrollments (course_id, student_id) values
  ('00000000-0000-4000-8000-0000000007c1', '00000000-0000-4000-8000-000000000711');

-- ---------- T1: a plain DELETE on profiles is blocked ---------------
do $$
begin
  begin
    delete from public.profiles where id = '00000000-0000-4000-8000-000000000714';
    raise exception 'FAIL: T1 direct profile delete was allowed';
  exception when sqlstate 'P0001' then null;
  end;
  assert exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000714'),
         'FAIL: T1 profile disappeared';
  begin
    delete from public.profiles;   -- bulk: also blocked, nothing deleted
    raise exception 'FAIL: T1 bulk profile delete was allowed';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'PASS T1: direct DELETE on profiles is blocked';
end $$;

-- T1b: also blocked for the service role and for clients
set local role service_role;
do $$
begin
  begin
    delete from public.profiles where id = '00000000-0000-4000-8000-000000000714';
    raise exception 'FAIL: T1b service_role direct delete was allowed';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'PASS T1b: blocked for service_role too';
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000701","role":"authenticated"}', true);
do $$
begin
  begin
    delete from public.profiles where id = '00000000-0000-4000-8000-000000000711';
    raise exception 'FAIL: T1c client delete of a profile was allowed';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS T1c: clients cannot delete profiles';
end $$;
reset role;

-- ---------- T2: deleting the AUTH user still cascades ----------------
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000799', 'p7-cascade@example.invalid');
insert into public.teacher_students (teacher_id, student_id) values
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000799');
delete from auth.users where id = '00000000-0000-4000-8000-000000000799';
do $$
begin
  assert not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000799'),
         'FAIL: T2 cascade did not remove the profile';
  assert not exists (select 1 from public.teacher_students where student_id = '00000000-0000-4000-8000-000000000799'),
         'FAIL: T2 cascade did not remove the teacher link';
  raise notice 'PASS T2: deleting auth.users cascades through profiles (as owner)';
end $$;
-- same, issued as service_role (what auth.admin.deleteUser effectively does)
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000798', 'p7-cascade2@example.invalid');
set local role service_role;
delete from auth.users where id = '00000000-0000-4000-8000-000000000798';
reset role;
do $$
begin
  assert not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000798'),
         'FAIL: T2b cascade as service_role did not remove the profile';
  raise notice 'PASS T2b: deleting auth.users cascades (as service_role)';
end $$;

-- ---------- T3: explicit maintenance bypass (transaction-local) ------
select set_config('app.allow_profile_delete', 'on', true);
delete from public.profiles where id = '00000000-0000-4000-8000-000000000714';      -- the ghost is created here
select set_config('app.allow_profile_delete', '', true);
do $$
begin
  assert not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000714'), 'FAIL: T3 bypass did not delete';
  assert exists (select 1 from auth.users where id = '00000000-0000-4000-8000-000000000714'), 'FAIL: T3 auth user should remain (ghost)';
  begin
    delete from public.profiles where id = '00000000-0000-4000-8000-000000000713';
    raise exception 'FAIL: T3 guard not restored after the bypass';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'PASS T3: explicit bypass works and the guard is restored';
end $$;

-- ---------- T4: admin_find_auth_user (service role only) -------------
set local role service_role;
do $$
declare r record; n int;
begin
  -- unknown e-mail
  select count(*) into n from public.admin_find_auth_user('nobody@example.invalid', '00000000-0000-4000-8000-000000000701');
  assert n = 0, 'FAIL: T4 unknown email should return no row';

  -- ghost, found case-insensitively
  select * into r from public.admin_find_auth_user(' p7-ghost@example.INVALID ', '00000000-0000-4000-8000-000000000701');
  assert r.user_id = '00000000-0000-4000-8000-000000000714' and not r.has_profile and r.role is null
         and not r.linked_to_caller and not r.linked_to_others and r.email_confirmed and r.has_password,
         'FAIL: T4 ghost state wrong';

  -- pending invite linked to the caller
  select * into r from public.admin_find_auth_user('p7-pending@example.invalid', '00000000-0000-4000-8000-000000000701');
  assert r.has_profile and r.role = 'student' and not r.email_confirmed and r.linked_to_caller and not r.linked_to_others,
         'FAIL: T4 pending state wrong';

  -- active student linked to BOTH teachers, asked by teacher B
  select * into r from public.admin_find_auth_user('p7-active@example.invalid', '00000000-0000-4000-8000-000000000702');
  assert r.linked_to_caller and r.linked_to_others, 'FAIL: T4 link flags wrong';

  -- a teacher account is reported as such
  select * into r from public.admin_find_auth_user('p7-teacher-b@example.invalid', '00000000-0000-4000-8000-000000000701');
  assert r.role = 'teacher', 'FAIL: T4 teacher role not reported';
  raise notice 'PASS T4: admin_find_auth_user reports every state';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000701","role":"authenticated"}', true);
do $$
begin
  begin
    perform * from public.admin_find_auth_user('p7-active@example.invalid', '00000000-0000-4000-8000-000000000701');
    raise exception 'FAIL: T4b a client could call admin_find_auth_user';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_provision_student('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000714', 'x', null, true, null);
    raise exception 'FAIL: T4b a client could call admin_provision_student';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_student_footprint('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000711');
    raise exception 'FAIL: T4b a client could call admin_student_footprint';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS T4b: admin RPCs are not callable by clients';
end $$;
reset role;

-- ---------- T5: admin_provision_student (repair of the ghost) --------
set local role service_role;
do $$
declare res jsonb;
begin
  -- atomic: a bad course rolls the whole call back (no profile is created)
  begin
    perform public.admin_provision_student('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000714',
      'רגב', '00000000-0000-4000-8000-0000000007c2', true, null);   -- course of ANOTHER teacher
    raise exception 'FAIL: T5 foreign course accepted';
  exception when sqlstate 'P0002' then null;
  end;
  assert not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000714'),
         'FAIL: T5 partial state left behind (profile created before the failure)';

  -- a non-teacher caller is refused
  begin
    perform public.admin_provision_student('00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000714', 'x', null, true, null);
    raise exception 'FAIL: T5 non-teacher accepted';
  exception when insufficient_privilege then null;
  end;

  -- the real repair
  res := public.admin_provision_student('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000714',
           'רגב', '00000000-0000-4000-8000-0000000007c1', true, null);
  assert (res ->> 'ok')::boolean and (res ->> 'profile_created')::boolean, 'FAIL: T5 repair result';
  assert exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000714' and role = 'student' and full_name = 'רגב'),
         'FAIL: T5 profile not recreated as a student';
  assert exists (select 1 from public.teacher_students where teacher_id = '00000000-0000-4000-8000-000000000701'
                 and student_id = '00000000-0000-4000-8000-000000000714' and status = 'active'), 'FAIL: T5 link missing';
  assert exists (select 1 from public.course_enrollments where course_id = '00000000-0000-4000-8000-0000000007c1'
                 and student_id = '00000000-0000-4000-8000-000000000714'), 'FAIL: T5 enrollment missing';

  -- repairing a user who already has a profile is refused (no takeover of a live account)
  begin
    perform public.admin_provision_student('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000714', 'x', null, true, null);
    raise exception 'FAIL: T5 repair of an existing profile accepted';
  exception when sqlstate '23505' then null;
  end;

  -- link-only (invite path): idempotent, re-activates an archived link
  update public.teacher_students set status = 'archived'
  where teacher_id = '00000000-0000-4000-8000-000000000701' and student_id = '00000000-0000-4000-8000-000000000713';
  perform public.admin_provision_student('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000713', null, null, false, null);
  assert (select status from public.teacher_students where teacher_id = '00000000-0000-4000-8000-000000000701'
          and student_id = '00000000-0000-4000-8000-000000000713') = 'active', 'FAIL: T5 archived link not re-activated';
  raise notice 'PASS T5: admin_provision_student is atomic, repairs ghosts, refuses live accounts';
end $$;
reset role;

-- ---------- T6: admin_student_footprint ------------------------------
set local role service_role;
do $$
declare f jsonb;
begin
  f := public.admin_student_footprint('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000711');
  assert (f ->> 'found')::boolean and f ->> 'role' = 'student' and (f ->> 'linked_to_caller')::boolean, 'FAIL: T6 basics';
  assert (f ->> 'other_teachers')::int = 1, 'FAIL: T6 other teachers';
  assert (f ->> 'enrollments')::int = 1, 'FAIL: T6 enrollments';
  f := public.admin_student_footprint('00000000-0000-4000-8000-000000000702', '00000000-0000-4000-8000-000000000712');
  assert not (f ->> 'linked_to_caller')::boolean, 'FAIL: T6 foreign student must not look linked';
  f := public.admin_student_footprint('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000799');
  assert not (f ->> 'found')::boolean, 'FAIL: T6 missing student';
  raise notice 'PASS T6: footprint counts and ownership flags';
end $$;
reset role;

-- ---------- T7: my_students_auth_status -----------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000701","role":"authenticated"}', true);
do $$
begin
  assert (select invite_status from public.my_students_auth_status() where student_id = '00000000-0000-4000-8000-000000000712') = 'pending', 'FAIL: T7 pending';
  assert (select invite_status from public.my_students_auth_status() where student_id = '00000000-0000-4000-8000-000000000713') = 'no_password', 'FAIL: T7 no_password';
  assert (select invite_status from public.my_students_auth_status() where student_id = '00000000-0000-4000-8000-000000000711') = 'active', 'FAIL: T7 active';
  raise notice 'PASS T7: teacher sees invite status of own students';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000702","role":"authenticated"}', true);
do $$
begin
  assert not exists (select 1 from public.my_students_auth_status() where student_id = '00000000-0000-4000-8000-000000000712'),
         'FAIL: T7 another teacher sees a foreign student';
  raise notice 'PASS T7b: no cross-teacher visibility';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000711","role":"authenticated"}', true);
do $$
begin
  assert not exists (select 1 from public.my_students_auth_status()), 'FAIL: T7 a student got rows';
  raise notice 'PASS T7c: students get nothing';
end $$;
reset role;

-- ---------- T8: archived student keeps a readable name ---------------
update public.teacher_students set status = 'archived'
where teacher_id = '00000000-0000-4000-8000-000000000701' and student_id = '00000000-0000-4000-8000-000000000711';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000701","role":"authenticated"}', true);
do $$
begin
  assert (select full_name from public.profiles where id = '00000000-0000-4000-8000-000000000711') = 'תלמיד פעיל',
         'FAIL: T8 archived student name not readable';
  raise notice 'PASS T8: archived student name stays readable';
end $$;
reset role;

rollback;
