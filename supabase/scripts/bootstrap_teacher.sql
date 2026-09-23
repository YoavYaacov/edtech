-- =====================================================================
-- Run ONCE in the Supabase SQL editor, after creating your own user in
-- Dashboard → Authentication → Users → "Add user" (email + password).
--
-- Replace the email and the display name below, then run.
-- This is the only supported way to grant the teacher role.
-- =====================================================================
update public.profiles
set role = 'teacher',
    full_name = 'REPLACE_WITH_YOUR_NAME'
where id = (
  select id from auth.users
  where email = lower('REPLACE_WITH_TEACHER_EMAIL')
)
returning id, role, full_name;
-- Expected: exactly 1 row with role = teacher.
-- 0 rows → the email does not match an existing user.
