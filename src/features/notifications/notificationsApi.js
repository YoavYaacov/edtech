import { supabase } from '../../lib/supabaseClient';

// Phase 5 — Notification / Action Center, Step 2 (UI only), fix round
// (Production acceptance round 2, 27.09.2026 — decisions 85-88).
// No new DB objects here: everything below reads existing, already-approved
// objects — teacher_review_queue (Phase 4), student_pending_actions and
// public.notifications (Phase 5 step 1, migration 20260926000100) — and
// writes only the columns the client is granted: notifications.read_at.
//
// Two lists, kept apart on purpose (decision 76):
//   * "דורש טיפול" (pending) — derived, never stored; closes itself.
//   * "חדש" (events)         — Stored Events; read/unread is a per-viewer fact.
// The bell's own number counts pending.length only (decision 76/78) — never
// the unread event count, which is shown inside the panel alone.
//
// Fix-round addition (decision 86): a pending item and a stored event can be
// two views of the *same* underlying fact (a submission, a return-for-
// revision). Reconciliation below hides the duplicate from "חדש" and folds
// its unread state into the pending item, entirely in this read layer — the
// notifications table and the two views are never touched or altered.

const EVENTS_LIMIT = 50; // a recent feed, not a full history browser

// "דורש טיפול" for the given role — raw, one row per pending question.
// Column lists mirror what the existing screens already select from these
// same views (reviewApi.js / the phase-5 migration's student_pending_actions)
// — no new columns, no new views.
function fetchPendingActions(role) {
  return role === 'teacher'
    ? supabase.from('teacher_review_queue')
      .select('assignment_id, assignment_question_id, student_id, submission_id, submitted_at')
    : supabase.from('student_pending_actions')
      .select('assignment_id, assignment_question_id, submission_id, returned_at');
}

// "חדש" — Stored Events, most recent first. RLS already scopes this to the
// caller's own rows (recipient_id = auth.uid()); nothing else to filter here.
function fetchStoredEvents() {
  return supabase.from('notifications')
    .select('id, event_type, assignment_id, assignment_question_id, submission_id, student_id, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(EVENTS_LIMIT);
}

// Groups the teacher's raw per-question pending rows into one item per
// Student × Assignment (decision 85 / bug B1) — the same granularity the
// "בדיקות" hub (reviewApi.fetchReviewQueue) already uses, so the bell and
// the hub never disagree about what "one item to review" means. The
// question actually opened is resolved below, from each row's *current*
// position, at read time — never a position baked in earlier.
function groupTeacherPending(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.assignment_id}:${r.student_id}`;
    const g = groups.get(key) ?? {
      assignment_id: r.assignment_id,
      student_id: r.student_id,
      pendingAqIds: [],
      submissionIds: [],
      oldest: r.submitted_at,
    };
    g.pendingAqIds.push(r.assignment_question_id);
    g.submissionIds.push(r.submission_id);
    if (r.submitted_at < g.oldest) g.oldest = r.submitted_at;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (a.oldest < b.oldest ? -1 : 1));
}

// Resolves display text + the stable `position` the existing q=:position
// deep-link contract needs (decision 56/77/81), and — for the teacher's
// grouped items — the first still-pending question *in current assignment
// order* (decision 85: never a hardcoded/stale position). Fetches the full
// assignment_questions list per referenced assignment (not just the
// pending/referenced ids) because the teacher grouping needs the whole
// ordered list to find "first pending", the same way reviewApi's
// fetchReviewQueue already does it.
async function enrich({ pendingRows, eventRows, role }) {
  const assignmentIds = [...new Set([
    ...pendingRows.map((r) => r.assignment_id),
    ...eventRows.map((r) => r.assignment_id),
  ])];
  const studentIds = role === 'teacher'
    ? [...new Set([
      ...pendingRows.map((r) => r.student_id),
      ...eventRows.map((r) => r.student_id),
    ].filter(Boolean))]
    : [];

  const [aq, a, s] = await Promise.all([
    assignmentIds.length
      ? supabase.from('assignment_questions').select('id, assignment_id, position, title').in('assignment_id', assignmentIds)
      : Promise.resolve({ data: [] }),
    assignmentIds.length
      ? supabase.from('assignments').select('id, title, course:courses(title)').in('id', assignmentIds)
      : Promise.resolve({ data: [] }),
    studentIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', studentIds)
      : Promise.resolve({ data: [] }),
  ]);
  if (aq.error || a.error || s.error) return { data: null, error: aq.error || a.error || s.error };

  const aqMap = new Map((aq.data ?? []).map((x) => [x.id, x]));
  const aqByAssignment = new Map();
  for (const x of aq.data ?? []) {
    const list = aqByAssignment.get(x.assignment_id) ?? [];
    list.push(x);
    aqByAssignment.set(x.assignment_id, list);
  }
  for (const list of aqByAssignment.values()) list.sort((x, y) => x.position - y.position);
  const aMap = new Map((a.data ?? []).map((x) => [x.id, x]));
  const sMap = new Map((s.data ?? []).map((x) => [x.id, x.full_name]));

  function assignmentMeta(assignmentId) {
    const asg = aMap.get(assignmentId);
    return { assignmentTitle: asg?.title ?? '', courseTitle: asg?.course?.title ?? '' };
  }

  let pending;
  if (role === 'teacher') {
    pending = groupTeacherPending(pendingRows).map((g) => {
      const ordered = aqByAssignment.get(g.assignment_id) ?? [];
      const firstPending = ordered.find((x) => g.pendingAqIds.includes(x.id));
      return {
        ...g,
        key: `${g.assignment_id}:${g.student_id}`,
        position: firstPending?.position ?? null,
        pendingCount: g.pendingAqIds.length,
        studentName: sMap.get(g.student_id) ?? '',
        ...assignmentMeta(g.assignment_id),
      };
    });
  } else {
    pending = pendingRows.map((r) => ({
      ...r,
      key: `${r.assignment_id}:${r.assignment_question_id}`,
      position: aqMap.get(r.assignment_question_id)?.position ?? null,
      questionTitle: aqMap.get(r.assignment_question_id)?.title ?? '',
      ...assignmentMeta(r.assignment_id),
    }));
  }

  const events = eventRows.map((r) => ({
    ...r,
    position: aqMap.get(r.assignment_question_id)?.position ?? null,
    questionTitle: aqMap.get(r.assignment_question_id)?.title ?? '',
    studentName: role === 'teacher' ? sMap.get(r.student_id) ?? '' : null,
    ...assignmentMeta(r.assignment_id),
  }));

  return { data: { pending, events }, error: null };
}

// Reconciliation (decision 86 / bugs B2+B3): a pending item and a stored
// event can describe the same fact —
//   * teacher: a pending group's questions each came from a submission that
//     also produced a "submission_received" event for that same submission.
//   * student: a pending "returned for revision" row IS the same fact as a
//     "returned_for_revision" event for that same submission.
// Any event matched this way is (a) removed from "חדש" so it never shows
// twice, and (b) reflected on the pending item as `unread` (true if at
// least one matched event is still unread) + `absorbedEventIds` (every
// matched event id, read or not) so a click can mark all of them read in
// one go (bug B3) instead of leaving the "חדש" dot to be cleared separately.
// This never touches the notifications table or either view — purely a
// presentation-layer merge over data already fetched.
//
// Round-3 fix (decision 92): the teacher side matches by the *group's*
// assignment_id + student_id — not by the submission_ids of only the
// questions still pending right now. Matching by submission_id alone left
// two real cases undeduplicated: a superseded earlier attempt of the same
// question (the derived queue only ever holds the latest attempt per
// question — F9/N7 — so an older attempt's submission_received event has a
// submission_id the current group no longer lists), and a submission for a
// *different* question in the same assignment+student that already got
// reviewed (also not in the group's currently-pending submission_ids). The
// unit the teacher cares about is "this student's work on this assignment"
// — decision 85's own grouping — so that's the reconciliation key too: any
// submission_received event for that assignment+student is the same fact
// as "this pending group", regardless of which specific question/attempt
// produced it. The student side is unchanged (still per-submission,
// returned_for_revision only) — not part of this round's reported issue,
// and feedback_available must keep showing under "חדש" on its own, exactly
// as before, since it is never the matched type on either side.
function reconcile(pending, events, role) {
  const absorbedIds = new Set();
  const mergedPending = pending.map((item) => {
    const matched = role === 'teacher'
      ? events.filter((e) => e.event_type === 'submission_received'
        && e.assignment_id === item.assignment_id
        && e.student_id === item.student_id)
      : events.filter((e) => e.event_type === 'returned_for_revision'
        && e.submission_id === item.submission_id);

    matched.forEach((e) => absorbedIds.add(e.id));
    return {
      ...item,
      unread: matched.some((e) => !e.read_at),
      absorbedEventIds: matched.map((e) => e.id),
    };
  });

  const remainingEvents = events.filter((e) => !absorbedIds.has(e.id));
  return { pending: mergedPending, events: remainingEvents };
}

// Everything the bell + panel need, in one call. `role` = profile.role
// ('teacher' | 'student'), from useAuth().
export async function fetchNotificationCenter(role) {
  const [pendingRes, eventsRes] = await Promise.all([fetchPendingActions(role), fetchStoredEvents()]);
  if (pendingRes.error || eventsRes.error) return { data: null, error: pendingRes.error || eventsRes.error };

  const pendingRows = pendingRes.data ?? [];
  const eventRows = eventsRes.data ?? [];
  if (!pendingRows.length && !eventRows.length) return { data: { pending: [], events: [] }, error: null };

  const { data: enriched, error } = await enrich({ pendingRows, eventRows, role });
  if (error) return { data: null, error };

  return { data: reconcile(enriched.pending, enriched.events, role), error: null };
}

// Recipient marks their own event(s) read — the only client write this
// table allows (grant update (read_at); RLS scopes it to recipient_id =
// auth.uid()). Accepts one or several ids so a merged pending item (bug B3)
// can clear every event it absorbed in a single request.
export const markNotificationsRead = (ids) => {
  const list = ids.filter(Boolean);
  if (!list.length) return Promise.resolve({ data: null, error: null });
  return supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', list);
};

// Deep link (decision 56/77/81): entity ids only, q=:position resolved above
// — the exact same param contract WorkspacePage/ReviewPage already use, so
// no change to either page is needed. For a teacher's grouped item,
// `position` is the first still-pending question as of this fetch, per
// decision 85 — resolved here at read time, never hardcoded.
export function deepLinkFor(role, row) {
  if (!row.assignment_id || !row.position) return null;
  return role === 'teacher'
    ? `/teacher/assignments/${row.assignment_id}/review?student=${row.student_id}&q=${row.position}`
    : `/student/assignments/${row.assignment_id}?q=${row.position}`;
}
