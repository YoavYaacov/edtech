import { supabase } from '../../lib/supabaseClient';

export const LIST_LIMIT = 200;

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// filters: { courseId, topicIds[], difficulty, sourceType, status ('active' | value | ''), search }
export function fetchQuestions(filters) {
  const withTopics = filters.topicIds?.length > 0;
  let q = supabase
    .from('questions')
    .select(`id, title, course_id, difficulty, source_type, source_year, source_exam, status, question_type, updated_at, programming_language, is_language_neutral, question_variants(programming_language)${
      withTopics ? ', question_topics!inner(topic_id)' : ''}`)
    .order('updated_at', { ascending: false })
    .limit(LIST_LIMIT);

  if (filters.courseId) q = q.eq('course_id', filters.courseId);
  if (withTopics) q = q.in('question_topics.topic_id', filters.topicIds);
  if (filters.difficulty) q = q.eq('difficulty', filters.difficulty);
  if (filters.sourceType) q = q.eq('source_type', filters.sourceType);
  if (filters.status === 'active') q = q.neq('status', 'archived');
  else if (filters.status) q = q.eq('status', filters.status);
  if (filters.search?.trim()) q = q.ilike('title', `%${escapeLike(filters.search.trim())}%`);
  return q;
}

export function fetchQuestion(questionId) {
  return supabase
    .from('questions')
    .select(`*, question_topics(topic_id), question_hints(level, content_md),
             question_solutions(solution_code, explanation_md), question_teacher_notes(notes_md)`)
    .eq('id', questionId)
    .maybeSingle();
}

export async function fetchActiveQuestionCount() {
  const { count, error } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'archived');
  return { data: count ?? 0, error };
}

// Atomic save (question + topics + hints + solution + notes) via RPC.
export function saveQuestion(payload) {
  return supabase.rpc('save_question', { p: payload });
}

// ---- language variants (owner-only; never student-readable) ----
export function fetchQuestionVariants(questionId) {
  return supabase.from('question_variants')
    .select('id, programming_language, body_md, starter_code, solution_code, explanation_md, hints, origin, updated_at')
    .eq('question_id', questionId);
}

// v: { language, body_md, starter_code, solution_code, explanation_md, hints? }
export function saveQuestionVariant(questionId, v) {
  return supabase.rpc('save_question_variant', {
    p: {
      question_id: questionId, programming_language: v.language, body_md: v.body_md ?? '',
      starter_code: v.starter_code ?? '', solution_code: v.solution_code ?? '', explanation_md: v.explanation_md ?? '',
      hints: v.hints ?? null, origin: v.origin ?? 'manual',
    },
  });
}

export function deleteQuestionVariant(variantId) {
  return supabase.from('question_variants').delete().eq('id', variantId);
}
