-- One md5 per table over the columns that exist BEFORE the upgrade (every column, incl. updated_at).
select 'assignment_questions' as t, count(*) as n, md5(string_agg(x::text, '|' order by id)) as h from public.assignment_questions x where assignment_id <> '00000000-0000-4000-8000-00000000a0d1' group by 1
union all select 'aq_hints', count(*), md5(string_agg(x::text, '|' order by assignment_question_id, level)) from public.assignment_question_hints x where assignment_question_id in (select id from public.assignment_questions where assignment_id <> '00000000-0000-4000-8000-00000000a0d1')
union all select 'aq_solutions', count(*), md5(string_agg(x::text, '|' order by assignment_question_id)) from public.assignment_question_solutions x where assignment_question_id in (select id from public.assignment_questions where assignment_id <> '00000000-0000-4000-8000-00000000a0d1')
union all select 'answers', count(*), md5(string_agg(x::text, '|' order by id)) from public.answers x
union all select 'submissions', count(*), md5(string_agg(x::text, '|' order by id)) from public.answer_submissions x
union all select 'reveals', count(*), md5(string_agg(x::text, '|' order by x::text)) from public.question_reveals x
union all select 'assignments (old columns)', count(*), md5(string_agg(
    (x.id, x.owner_id, x.course_id, x.title, x.instructions_md, x.status, x.due_at, x.published_at, x.closed_at, x.created_at, x.updated_at)::text, '|' order by x.id))
  from public.assignments x where id <> '00000000-0000-4000-8000-00000000a0d1'
union all select 'assignment_students', count(*), md5(string_agg(x::text, '|' order by assignment_id, student_id)) from public.assignment_students x where assignment_id <> '00000000-0000-4000-8000-00000000a0d1'
union all select 'questions (old columns)', count(*), md5(string_agg(
    (x.id, x.owner_id, x.course_id, x.title, x.body_md, x.question_type, x.programming_language, x.starter_code, x.status, x.updated_at)::text, '|' order by x.id)) from public.questions x
order by 1;
