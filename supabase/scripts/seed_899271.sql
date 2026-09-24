-- =====================================================================
-- OPTIONAL seed — creates ONE example course and its topic tree for a
-- given teacher. This is DATA, not schema: nothing in the app depends on
-- it. Everything it creates can be edited or archived in the UI, and any
-- other course can be built from scratch in the UI instead.
--
-- 1. Replace the email below with YOUR teacher email.
-- 2. Run once in the SQL Editor. Running it again is refused (no duplicates).
-- =====================================================================
do $$
declare
  v_teacher_email text := lower('REPLACE_WITH_TEACHER_EMAIL');
  v_teacher uuid;
  v_course  uuid;
  v_unit    uuid;
  v_pos     int;
  v_title   text;
begin
  select p.id into v_teacher
  from auth.users u join public.profiles p on p.id = u.id
  where u.email = v_teacher_email and p.role = 'teacher';
  if v_teacher is null then
    raise exception 'No teacher found with email %', v_teacher_email;
  end if;

  if exists (select 1 from public.courses where owner_id = v_teacher and code = '899271') then
    raise exception 'A course with code 899271 already exists for this teacher. Nothing was changed.';
  end if;

  insert into public.courses (owner_id, title, code, description, programming_language)
  values (v_teacher, 'מדעי המחשב', '899271', 'הכנה לבגרות – מבני נתונים ומודלים חישוביים', 'java')
  returning id into v_course;

  -- unit 1
  insert into public.topics (course_id, title, position) values (v_course, 'מבני נתונים', 1)
  returning id into v_unit;
  v_pos := 0;
  foreach v_title in array array['שרשרת חד-כיוונית', 'שרשרת דו-כיוונית', 'שרשרת מעגלית', 'מחסנית',
                                  'תור', 'עצים', 'רקורסיה', 'יעילות / סיבוכיות'] loop
    v_pos := v_pos + 1;
    insert into public.topics (course_id, parent_id, title, position) values (v_course, v_unit, v_title, v_pos);
  end loop;

  -- unit 2
  insert into public.topics (course_id, title, position) values (v_course, 'מודלים חישוביים', 2)
  returning id into v_unit;
  v_pos := 0;
  foreach v_title in array array['שפות פורמליות', 'אוטומטים סופיים', 'שפות רגולריות', 'אוטומט מחסנית',
                                  'שפות חסרות הקשר', 'מכונת טיורינג'] loop
    v_pos := v_pos + 1;
    insert into public.topics (course_id, parent_id, title, position) values (v_course, v_unit, v_title, v_pos);
  end loop;

  raise notice 'Created course % with 2 units and 14 topics', v_course;
end $$;
