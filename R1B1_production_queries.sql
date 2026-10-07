-- ===== Q0: baseline (הריצו לפני ההעלאה, ושוב בסוף) =====
select (select count(*) from public.questions)            as questions,
       (select count(*) from public.question_provenance)  as provenance_rows,
       (select count(*) from public.question_imports)     as imports,
       (select coalesce(sum(calls), 0) from private.import_ai_usage where day = current_date) as import_ai_calls_today;

-- ===== Q1: הייבוא האחרון =====
select i.id, i.status, i.failure_code, f.original_name, f.page_count, f.size_bytes, i.created_at
from public.question_imports i left join public.import_files f on f.import_id = i.id
order by i.created_at desc limit 3;

-- ===== Q2: הקטעים (chunks) של הייבוא האחרון =====
select c.seq, c.page_from, c.page_to, c.look_pages, c.kind, c.status, c.attempts, c.error_code,
       c.model, c.prompt_version, c.latency_ms, c.tokens_in, c.tokens_out, c.candidates_count, c.warnings
from public.import_chunks c
where c.import_id = (select id from public.question_imports order by created_at desc limit 1)
order by c.page_from, c.seq;

-- ===== Q3: ההצעות שחולצו (לא מציג את גוף השאלה) =====
select k.source_pages, k.source_label, left(k.draft ->> 'title', 50) as title,
       (select string_agg(f ->> 'kind', ',') from jsonb_array_elements(k.flags) f) as flags,
       k.duplicate_score, k.review_status
from public.import_candidates k
where k.import_id = (select id from public.question_imports order by created_at desc limit 1)
order by k.source_pages[1], k.ordinal;

-- ===== Q4: סיכום =====
select count(*) as candidates,
       count(*) filter (where exists (select 1 from jsonb_array_elements(flags) f where f ->> 'severity' = 'material')) as with_material_flag,
       count(*) filter (where exists (select 1 from jsonb_array_elements(flags) f where f ->> 'kind' = 'figure_dependent')) as figure_dependent,
       count(*) filter (where review_status <> 'pending') as already_reviewed
from public.import_candidates
where import_id = (select id from public.question_imports order by created_at desc limit 1);
