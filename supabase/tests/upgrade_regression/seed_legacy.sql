-- Seeds a database that is at migration 20260929000100 with data shaped like Production:
--   * "מדעי המחשב": Java course, 46 Java questions (45 ready + 1 draft, all code, starter+solution+hints),
--     3 enrolled students, 11 assignments (9 published + 2 closed; 10 of them with recipients)
--   * "מתמטיקה": 61 text questions, no language
-- Snapshots are written by the OLD publish_assignment (v1), as in Production. FAKE users only.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000009a1', 'up-teacher@example.invalid'),
  ('00000000-0000-4000-8000-0000000009b1', 'up-s1@example.invalid'),
  ('00000000-0000-4000-8000-0000000009b2', 'up-s2@example.invalid'),
  ('00000000-0000-4000-8000-0000000009b3', 'up-s3@example.invalid');
update public.profiles set role = 'teacher', full_name = 'מורה' where id = '00000000-0000-4000-8000-0000000009a1';
insert into public.teacher_students (teacher_id, student_id)
select '00000000-0000-4000-8000-0000000009a1', id from public.profiles where role = 'student';

insert into public.courses (id, owner_id, title, code, programming_language) values
  ('00000000-0000-4000-8000-0000000009c1', '00000000-0000-4000-8000-0000000009a1', 'מדעי המחשב', '899271', 'java'),
  ('00000000-0000-4000-8000-0000000009c2', '00000000-0000-4000-8000-0000000009a1', 'מתמטיקה 5 כיתה י"א', '', null);
insert into public.course_enrollments (course_id, student_id)
select '00000000-0000-4000-8000-0000000009c1', id from public.profiles where role = 'student';

-- 46 Java questions
insert into public.questions (id, owner_id, course_id, title, body_md, question_type, programming_language, starter_code, status)
select ('00000000-0000-4000-8000-00000000d' || lpad(g::text, 3, '0'))::uuid,
       '00000000-0000-4000-8000-0000000009a1', '00000000-0000-4000-8000-0000000009c1',
       'שאלת Java ' || g, 'גוף שאלה ' || g || E'\n```java\nint x = ' || g || ';\n```', 'code', 'java',
       'public static void f' || g || '()' || E'\n{\n}', case when g = 46 then 'draft' else 'ready' end
from generate_series(1, 46) g;
insert into public.question_solutions (question_id, solution_code, explanation_md)
select id, 'System.out.println(' || substr(title, 10) || ');', 'הסבר ' || title from public.questions where course_id = '00000000-0000-4000-8000-0000000009c1';
insert into public.question_hints (question_id, level, content_md)
select id, l, 'רמז ' || l || ' ל-' || title from public.questions, generate_series(1, 2) l where course_id = '00000000-0000-4000-8000-0000000009c1';
-- 61 maths questions (text, no language)
insert into public.questions (owner_id, course_id, title, body_md, question_type, status)
select '00000000-0000-4000-8000-0000000009a1', '00000000-0000-4000-8000-0000000009c2', 'משוואה ' || g, 'פתרו $x^2=' || g || '$', 'text', 'ready'
from generate_series(1, 61) g;

-- 11 assignments over Java questions: 3 + (i mod 3) questions each
insert into public.assignments (id, owner_id, course_id, title, instructions_md)
select ('00000000-0000-4000-8000-00000000a' || lpad(i::text, 3, '0'))::uuid,
       '00000000-0000-4000-8000-0000000009a1', '00000000-0000-4000-8000-0000000009c1', 'מטלה ' || i, 'הנחיות ' || i
from generate_series(1, 11) i;
insert into public.assignment_questions (assignment_id, question_id, position)
select ('00000000-0000-4000-8000-00000000a' || lpad(i::text, 3, '0'))::uuid,
       ('00000000-0000-4000-8000-00000000d' || lpad((((i - 1) * 4 + k - 1) % 45 + 1)::text, 3, '0'))::uuid, k
from generate_series(1, 11) i, generate_series(1, 3 + (i % 3)) k;
insert into public.assignment_students (assignment_id, student_id)
select ('00000000-0000-4000-8000-00000000a' || lpad(i::text, 3, '0'))::uuid, p.id
from generate_series(1, 11) i, public.profiles p where p.role = 'student';
commit;
