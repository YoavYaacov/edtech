import { supabase } from '../../lib/supabaseClient';

// Student side. RLS returns only published/closed assignments assigned to
// the caller, and only hints/solutions that were revealed to the caller.

export async function fetchMyAssignments() {
  const [a, ans] = await Promise.all([
    supabase.from('assignments')
      .select('id, title, status, due_at, published_at, course:courses(title), assignment_questions(id)')
      .order('published_at', { ascending: false }),
    supabase.from('answers').select('assignment_question_id, status'),
  ]);
  if (a.error || ans.error) return { data: null, error: a.error || ans.error };
  const status = new Map((ans.data ?? []).map((x) => [x.assignment_question_id, x.status]));
  const data = (a.data ?? []).map((x) => {
    const ids = x.assignment_questions.map((q) => q.id);
    return {
      ...x,
      total: ids.length,
      submitted: ids.filter((id) => status.get(id) === 'submitted').length,
      started: ids.some((id) => status.has(id)),
    };
  });
  return { data, error: null };
}

export async function fetchWorkspace(assignmentId) {
  const a = await supabase.from('assignments')
    .select('id, title, instructions_md, status, due_at, course:courses(title)')
    .eq('id', assignmentId).maybeSingle();
  if (a.error || !a.data) return { data: null, error: a.error };
  const q = await supabase.from('assignment_questions')
    .select('id, position, title, body_md, question_type, programming_language, starter_code, hint_count, has_solution, hint_policy, solution_policy')
    .eq('assignment_id', assignmentId).order('position', { ascending: true });
  if (q.error) return { data: null, error: q.error };
  const ids = q.data.map((x) => x.id);
  const [ans, hints, sols] = await Promise.all([
    supabase.from('answers').select('id, assignment_question_id, content, status, draft_saved_at, submitted_at').in('assignment_question_id', ids),
    supabase.from('assignment_question_hints').select('assignment_question_id, level, content_md').in('assignment_question_id', ids),
    supabase.from('assignment_question_solutions').select('assignment_question_id, solution_code, explanation_md').in('assignment_question_id', ids),
  ]);
  const error = ans.error || hints.error || sols.error;
  if (error) return { data: null, error };
  // own attempts + feedback; RLS returns only RELEASED feedback, never notes or tags
  const answerIds = ans.data.map((x) => x.id);
  const subs = answerIds.length
    ? await supabase.from('answer_submissions')
      .select('answer_id, attempt_number, feedback(verdict, message_md, released_at, return_for_revision)')
      .in('answer_id', answerIds)
    : { data: [] };
  if (subs.error) return { data: null, error: subs.error };
  return { data: { assignment: a.data, questions: q.data, answers: ans.data, hints: hints.data, solutions: sols.data, submissions: subs.data }, error: null };
}

export const saveAnswer = (aqId, content) =>
  supabase.rpc('save_answer', { p_assignment_question_id: aqId, p_content: content });
export const submitAnswer = (aqId) => supabase.rpc('submit_answer', { p_assignment_question_id: aqId });
export const revealHint = (aqId) => supabase.rpc('reveal_hint', { p_assignment_question_id: aqId });
export const revealSolution = (aqId) => supabase.rpc('reveal_solution', { p_assignment_question_id: aqId });

export const fetchHints = (aqId) =>
  supabase.from('assignment_question_hints').select('assignment_question_id, level, content_md').eq('assignment_question_id', aqId);
export const fetchSolution = (aqId) =>
  supabase.from('assignment_question_solutions').select('assignment_question_id, solution_code, explanation_md').eq('assignment_question_id', aqId);
