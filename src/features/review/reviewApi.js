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

// ---------- Step 4: release / return / bulk (existing RPCs only; no direct CRUD) ----------
// releaseFeedback/previewReadyFeedback/releaseReadyFeedback are no longer called from the
// review UI (Step 5, decision 1+4: release is now a Student × Assignment action — see
// sendFeedbackToStudent below), but stay exported: they still wrap valid, unchanged RPCs,
// and there is no reason to remove backend-adjacent access that isn't otherwise broken.
export const releaseFeedback = (sid) => supabase.rpc('release_feedback', { p_submission_id: sid });
export const returnForRevision = (sid) => supabase.rpc('return_for_revision', { p_submission_id: sid });
export const previewReadyFeedback = (assignmentId) => supabase.rpc('preview_ready_feedback', { p_assignment_id: assignmentId });
export const releaseReadyFeedback = (assignmentId, submissionIds) =>
  supabase.rpc('release_ready_feedback', { p_assignment_id: assignmentId, p_submission_ids: submissionIds });

// ---------- Step 5: send feedback to one student for one assignment ----------
// No new RPC (decision 8): release_ready_feedback is already a generic, atomic,
// all-or-nothing bulk release over an explicit submission_id array (decision 67) —
// it never assumed that array was "the whole assignment", only that every id in it
// belongs to p_assignment_id. The caller (ReviewPage) computes exactly one student's
// currently-ready, currently-unreleased submission ids from data it already has
// loaded (mirroring FeedbackForm's own isReady() predicate) and passes that subset
// here. The server remains the source of truth: release_block_reason is re-checked
// per id under lock before anything is written, so a stale/changed item fails the
// whole batch safely rather than releasing part of it.
export const sendFeedbackToStudent = (assignmentId, submissionIds) => releaseReadyFeedback(assignmentId, submissionIds);

// ---------- Review queue: one row per (student × assignment) ----------
// Built on the existing teacher_review_queue view (one row per pending question).
export async function fetchReviewQueue() {
  const q = await supabase.from('teacher_review_queue')
    .select('assignment_id, student_id, assignment_question_id, submitted_at, has_draft');
  if (q.error) return { data: null, error: q.error };
  const rows = q.data ?? [];
  if (!rows.length) return { data: [], error: null };
  const aIds = [...new Set(rows.map((r) => r.assignment_id))];
  const sIds = [...new Set(rows.map((r) => r.student_id))];
  const [a, p] = await Promise.all([
    supabase.from('assignments').select('id, title, status, course:courses(title), assignment_questions(id, position)').in('id', aIds),
    supabase.from('profiles').select('id, full_name').in('id', sIds),
  ]);
  if (a.error || p.error) return { data: null, error: a.error || p.error };
  const aMap = new Map(a.data.map((x) => [x.id, x]));
  const pMap = new Map(p.data.map((x) => [x.id, x.full_name]));
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.assignment_id}:${r.student_id}`;
    const g = groups.get(key) ?? { assignmentId: r.assignment_id, studentId: r.student_id, pending: 0, drafts: 0,
      oldest: r.submitted_at, pendingAqIds: [] };
    g.pending += 1;
    if (r.has_draft) g.drafts += 1;
    if (r.submitted_at < g.oldest) g.oldest = r.submitted_at;
    g.pendingAqIds.push(r.assignment_question_id);
    groups.set(key, g);
  }
  const data = [...groups.values()].map((g) => {
    const asg = aMap.get(g.assignmentId);
    const ordered = [...(asg?.assignment_questions ?? [])].sort((x, y) => x.position - y.position);
    return {
      ...g,
      studentName: pMap.get(g.studentId) ?? '',
      title: asg?.title ?? '', courseTitle: asg?.course?.title ?? '', status: asg?.status,
      total: ordered.length,
      firstPendingIndex: Math.max(ordered.findIndex((x) => g.pendingAqIds.includes(x.id)), 0),
    };
  }).sort((x, y) => (x.oldest < y.oldest ? 1 : -1)); // Round 6, section I.2: most recently pending first
  return { data, error: null };
}
