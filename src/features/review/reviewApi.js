import { supabase } from '../../lib/supabaseClient';

const one = (x) => (Array.isArray(x) ? x[0] : x) ?? null; // 1:1 embeds

// Everything the review screen needs for one assignment, in a few queries.
// RLS: only the owning teacher gets rows (students/other teachers get nothing).
export async function fetchReviewData(assignmentId) {
  const a = await supabase.from('assignments')
    .select('id, title, status, course_id, course:courses(id, title)')
    .eq('id', assignmentId).maybeSingle();
  if (a.error || !a.data) return { data: null, error: a.error };

  const [q, r, tags] = await Promise.all([
    supabase.from('assignment_questions')
      .select('id, position, title, body_md, question_type, programming_language, hint_count, has_solution')
      .eq('assignment_id', assignmentId).order('position', { ascending: true }),
    supabase.from('assignment_students').select('student_id, student:profiles(id, full_name)').eq('assignment_id', assignmentId),
    supabase.from('mistake_tags').select('id, name, topic_id, is_archived').eq('course_id', a.data.course_id).order('name'),
  ]);
  if (q.error || r.error || tags.error) return { data: null, error: q.error || r.error || tags.error };
  const aqIds = q.data.map((x) => x.id);

  const [answers, reveals, topics] = await Promise.all([
    aqIds.length ? supabase.from('answers').select('id, assignment_question_id, student_id, status').in('assignment_question_id', aqIds)
      : { data: [] },
    aqIds.length ? supabase.from('question_reveals').select('assignment_question_id, student_id, kind, level, revealed_by, revealed_at')
      .in('assignment_question_id', aqIds) : { data: [] },
    supabase.from('topics').select('id, parent_id, title, position, is_archived').eq('course_id', a.data.course_id),
  ]);
  if (answers.error || reveals.error || topics.error) return { data: null, error: answers.error || reveals.error || topics.error };
  const answerIds = answers.data.map((x) => x.id);

  const subs = answerIds.length
    ? await supabase.from('answer_submissions')
      .select('id, answer_id, attempt_number, content, submitted_at, feedback(id, verdict, message_md, return_for_revision, released_at, returned_at)')
      .in('answer_id', answerIds).order('attempt_number', { ascending: true })
    : { data: [] };
  if (subs.error) return { data: null, error: subs.error };
  const submissions = subs.data.map((s) => ({ ...s, feedback: one(s.feedback) }));
  const subIds = submissions.map((s) => s.id);
  const fbIds = submissions.map((s) => s.feedback?.id).filter(Boolean);

  const [notes, marks] = await Promise.all([
    fbIds.length ? supabase.from('feedback_private_notes').select('feedback_id, note_md').in('feedback_id', fbIds) : { data: [] },
    subIds.length ? supabase.from('submission_mistakes').select('submission_id, mistake_tag_id').in('submission_id', subIds) : { data: [] },
  ]);
  if (notes.error || marks.error) return { data: null, error: notes.error || marks.error };

  return {
    data: {
      assignment: a.data, questions: q.data,
      students: r.data.map((x) => x.student).filter(Boolean).sort((x, y) => x.full_name.localeCompare(y.full_name, 'he')),
      tags: tags.data, topics: topics.data, answers: answers.data, reveals: reveals.data, submissions,
      notes: notes.data, marks: marks.data,
    },
    error: null,
  };
}

// Reference material for the teacher (snapshot tables; owner-only RLS).
export async function fetchReference(aqId) {
  const [h, s] = await Promise.all([
    supabase.from('assignment_question_hints').select('level, content_md').eq('assignment_question_id', aqId).order('level'),
    supabase.from('assignment_question_solutions').select('solution_code, explanation_md').eq('assignment_question_id', aqId),
  ]);
  return { data: { hints: h.data ?? [], solution: s.data?.[0] ?? null }, error: h.error || s.error };
}

export const saveFeedbackDraft = (sid, v) => supabase.rpc('save_feedback', {
  p_submission_id: sid, p_verdict: v.verdict || null, p_message_md: v.message, p_private_note: v.note,
  p_mistake_tag_ids: v.tags, p_return_for_revision: v.ret,
});

export const saveFeedbackMetadata = (sid, v) => supabase.rpc('save_feedback_metadata', {
  p_submission_id: sid, p_private_note: v.note, p_mistake_tag_ids: v.tags,
});
