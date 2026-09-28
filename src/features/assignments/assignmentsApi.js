import { supabase } from '../../lib/supabaseClient';

// ---------- teacher ----------
// Round 6, section I.1: newest first — ordered by created_at (when the
// assignment was created), not updated_at, so editing an old assignment
// (e.g. its due date) never reshuffles it above assignments created later.
export function fetchAssignments() {
  return supabase
    .from('assignments')
    .select('id, title, status, due_at, created_at, course:courses(id, title), assignment_students(count), assignment_questions(count)')
    .order('created_at', { ascending: false });
}

export function createAssignment(ownerId, { courseId, title }) {
  return supabase.from('assignments')
    .insert({ owner_id: ownerId, course_id: courseId, title })
    .select('id').single();
}

export function fetchAssignment(id) {
  return supabase.from('assignments')
    .select('id, title, instructions_md, status, due_at, published_at, closed_at, course_id, course:courses(id, title)')
    .eq('id', id).maybeSingle();
}

export function updateAssignment(id, patch) {
  return supabase.from('assignments').update(patch).eq('id', id);
}

export function deleteAssignment(id) {
  return supabase.from('assignments').delete().eq('id', id).select('id');
}

export function fetchAssignmentQuestions(assignmentId) {
  return supabase.from('assignment_questions')
    .select(`id, question_id, position, hint_policy, solution_policy, title, question_type, hint_count, has_solution, snapshot_at,
             question:questions(id, title, status, updated_at, question_type, question_hints(count))`)
    .eq('assignment_id', assignmentId)
    .order('position', { ascending: true });
}

export function addAssignmentQuestion(assignmentId, questionId, position) {
  return supabase.from('assignment_questions').insert({ assignment_id: assignmentId, question_id: questionId, position });
}

export function removeAssignmentQuestion(id) {
  return supabase.from('assignment_questions').delete().eq('id', id);
}

export function updateAssignmentQuestion(id, patch) {
  return supabase.from('assignment_questions').update(patch).eq('id', id);
}

export async function reorderAssignmentQuestions(orderedIds, currentPositions) {
  for (let i = 0; i < orderedIds.length; i++) {
    if (currentPositions.get(orderedIds[i]) !== i + 1) {
      const { error } = await updateAssignmentQuestion(orderedIds[i], { position: i + 1 });
      if (error) return { error };
    }
  }
  return { error: null };
}

export function fetchRecipients(assignmentId) {
  return supabase.from('assignment_students').select('student_id, student:profiles(id, full_name)').eq('assignment_id', assignmentId);
}

export function addRecipient(assignmentId, studentId) {
  return supabase.from('assignment_students').insert({ assignment_id: assignmentId, student_id: studentId });
}

// Returns the deleted rows: empty when RLS refused (student already started).
export function removeRecipient(assignmentId, studentId) {
  return supabase.from('assignment_students').delete()
    .eq('assignment_id', assignmentId).eq('student_id', studentId).select('student_id');
}

export const publishAssignment = (id) => supabase.rpc('publish_assignment', { p_assignment_id: id });
export const unpublishAssignment = (id) => supabase.rpc('unpublish_assignment', { p_assignment_id: id });
export const setAssignmentClosed = (id, closed) =>
  supabase.rpc('set_assignment_closed', { p_assignment_id: id, p_closed: closed });

// Progress: answers + reveals of this assignment (RLS: owner only).
export async function fetchProgress(aqIds) {
  if (aqIds.length === 0) return { data: { answers: [], reveals: [] }, error: null };
  const [a, r] = await Promise.all([
    supabase.from('answers')
      .select('id, assignment_question_id, student_id, status, draft_saved_at, submitted_at')
      .in('assignment_question_id', aqIds),
    supabase.from('question_reveals')
      .select('assignment_question_id, student_id, kind, level, revealed_at')
      .in('assignment_question_id', aqIds),
  ]);
  if (a.error || r.error) return { data: null, error: a.error || r.error };
  // which answers already have at least one submission (→ the cell links to the review screen)
  const ids = (a.data ?? []).map((x) => x.id);
  const s = ids.length ? await supabase.from('answer_submissions').select('answer_id').in('answer_id', ids) : { data: [] };
  if (s.error) return { data: null, error: s.error };
  return { data: { answers: a.data ?? [], reveals: r.data ?? [], submittedAnswerIds: [...new Set(s.data.map((x) => x.answer_id))] }, error: null };
}
