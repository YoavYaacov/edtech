import { supabase } from '../../lib/supabaseClient';

// Phase 5 — Notification / Action Center.
// Step 2 (UI only, Production acceptance rounds 1-3, decisions 76-92): teacher
// aggregation by Student × Assignment, badge = pending units, reconciliation
// between "דורש טיפול" and "חדש", desktop panel anchoring. All of that is
// unchanged below and stays exactly as accepted.
//
// Step "workflow redesign" (this round): release moves from per-question to a
// single Student × Assignment "send" action (see reviewApi.sendFeedbackToStudent
// and ReviewPage). That changes WHEN/BY WHAT ACTION a student's feedback becomes
// visible — not the notifications table, either view, or either trigger, all of
// which are untouched here too. Two read-layer consequences of that redesign:
//   * Teacher: a submission_received event can now mean "a first submission" or
//     "a correction after a return" — attempt_number > 1 always means the
//     latter, since resubmission is only ever possible after a return_for_revision
//     (the only path that resets an answer back to 'draft' post-submission).
//     teacher_review_queue already exposes attempt_number, so this is a plain
//     read-layer distinction, no migration.
//   * Student: feedback no longer arrives one question at a time, so "חדש" must
//     stop being one row per question too — every feedback_available event for
//     the same assignment collapses into one Presentation item, and the
//     student's own "דורש טיפול" (returned-for-revision) rows now group by
//     assignment the same way the teacher's already did — never by question.
//
// Two lists, kept apart on purpose (decision 76):
//   * "דורש טיפול" (pending) — derived, never stored; closes itself.
//   * "חדש" (events)         — Stored Events; read/unread is a per-viewer fact.
// The bell's own number counts pending.length only (decision 76/78) — never
// the unread event count, which is shown inside the panel alone.
//
// A pending item and a stored event can be two views of the *same* underlying
// fact (a submission, a return-for-revision). Reconciliation below hides the
// duplicate from "חדש" and folds its unread state into the pending item,
// entirely in this read layer — the notifications table and the two views are
// never touched or altered.

const EVENTS_LIMIT = 50; // a recent feed, not a full history browser

// "דורש טיפול" for the given role — raw, one row per pending question.
// attempt_number (teacher only) drives the "↻ תיקון התקבל" distinction below —
// an existing column on teacher_review_queue that the bell simply wasn't
// selecting before; no view/column change.
function fetchPendingActions(role) {
  return role === 'teacher'
    ? supabase.from('teacher_review_queue')
      .select('assignment_id, assignment_question_id, student_id, submission_id, submitted_at, attempt_number')
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
//
// correctionCount (this round): how many of the group's pending rows are a
// resubmission (attempt_number > 1) rather than a first submission — used to
// show "↻ תיקון התקבל" / "N תיקונים לבדיקה" instead of the plain "N שאלות
// ממתינות לבדיקה" wording when that's what's actually pending.
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
      correctionCount: 0,
    };
    g.pendingAqIds.push(r.assignment_question_id);
    g.submissionIds.push(r.submission_id);
    if (r.attempt_number > 1) g.correctionCount += 1;
    if (r.submitted_at < g.oldest) g.oldest = r.submitted_at;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (a.oldest < b.oldest ? -1 : 1));
}

// Groups the student's own raw "returned for revision" rows into one item per
// Assignment (Notification Center principle this round: the student's own
// unit is the assignment, never the question) — the same technique as
// groupTeacherPending above, just keyed by assignment_id alone (there is no
// second axis on the student's own side — it's always "my own" work).
function groupStudentPending(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = r.assignment_id;
    const g = groups.get(key) ?? { assignment_id: r.assignment_id, pendingAqIds: [], submissionIds: [], oldest: r.returned_at };
    g.pendingAqIds.push(r.assignment_question_id);
    g.submissionIds.push(r.submission_id);
    if (r.returned_at < g.oldest) g.oldest = r.returned_at;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (a.oldest < b.oldest ? -1 : 1));
}

// Resolves display text + the stable `position` the existing q=:position
// deep-link contract needs (decision 56/77/81), and — for grouped items —
// the first still-pending question *in current assignment order* (decision
// 85: never a hardcoded/stale position). Fetches the full assignment_questions
// list per referenced assignment (not just the pending/referenced ids)
// because both groupings need the whole ordered list to find "first pending".
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

  const aqMap = new Map((aq.data ?? []).map((x) => [x.id, x])); // position lookup only — never exposes a question name
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
  function firstPendingPosition(assignmentId, pendingAqIds) {
    const ordered = aqByAssignment.get(assignmentId) ?? [];
    return ordered.find((x) => pendingAqIds.includes(x.id))?.position ?? null;
  }

  let pending;
  if (role === 'teacher') {
    pending = groupTeacherPending(pendingRows).map((g) => ({
      ...g,
      key: `${g.assignment_id}:${g.student_id}`,
      position: firstPendingPosition(g.assignment_id, g.pendingAqIds),
      pendingCount: g.pendingAqIds.length,
      studentName: sMap.get(g.student_id) ?? '',
      ...assignmentMeta(g.assignment_id),
    }));
  } else {
    // Student "דורש טיפול" — one item per assignment (Notification Center
    // principle: no question names, no per-question rows on this side either).
    pending = groupStudentPending(pendingRows).map((g) => ({
      ...g,
      key: g.assignment_id,
      position: firstPendingPosition(g.assignment_id, g.pendingAqIds),
      pendingCount: g.pendingAqIds.length,
      ...assignmentMeta(g.assignment_id),
    }));
  }

  let events;
  if (role === 'teacher') {
    // position kept for deep-linking a rare unmatched leftover (reconcile()
    // absorbs almost all of these) — never rendered as a question name.
    events = eventRows.map((r) => ({
      ...r,
      position: aqMap.get(r.assignment_question_id)?.position ?? null,
      studentName: sMap.get(r.student_id) ?? '',
      ...assignmentMeta(r.assignment_id),
    }));
  } else {
    // Student "חדש": every feedback_available event for the same assignment
    // collapses into one Presentation item (Notification Center principle) —
    // informational, distinct from the actionable pending group above, and
    // never merged with returned_for_revision (a different type, absorbed
    // separately by reconcile() below, never shown here on its own once
    // absorbed). Unread if ANY member is unread; a click marks every member
    // read at once, the same "absorb several stored events into one click"
    // pattern decision 86/B3 already established for the teacher.
    const fbGroups = new Map();
    const other = [];
    for (const r of eventRows) {
      if (r.event_type !== 'feedback_available') { other.push(r); continue; }
      const g = fbGroups.get(r.assignment_id) ?? { memberIds: [], anyUnread: false, created_at: r.created_at };
      g.memberIds.push(r.id);
      if (!r.read_at) g.anyUnread = true;
      if (r.created_at > g.created_at) g.created_at = r.created_at;
      fbGroups.set(r.assignment_id, g);
    }
    const merged = [...fbGroups.entries()].map(([assignmentId, g]) => ({
      id: `fb:${assignmentId}`,
      event_type: 'feedback_available',
      assignment_id: assignmentId,
      memberIds: g.memberIds,
      created_at: g.created_at,
      read_at: g.anyUnread ? null : g.created_at, // any() unread → the merged row itself reads as unread
      ...assignmentMeta(assignmentId),
    }));
    // rare/paranoid fallback: a returned_for_revision event reconcile() didn't
    // absorb (should be absorbed in the steady state); keeps its own
    // question's position for deep-linking, never rendered as a question name.
    const otherMapped = other.map((r) => ({
      ...r,
      position: aqMap.get(r.assignment_question_id)?.position ?? null,
      ...assignmentMeta(r.assignment_id),
    }));
    events = [...merged, ...otherMapped].sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
  }

  return { data: { pending, events }, error: null };
}

// Reconciliation (decision 86 / bugs B2+B3): a pending item and a stored
// event can describe the same fact —
//   * teacher: a pending group's questions each came from a submission that
//     also produced a "submission_received" event for that same submission.
//   * student: a pending "returned for revision" group IS the same fact as
//     the "returned_for_revision" events for that assignment.
// Any event matched this way is (a) removed from "חדש" so it never shows
// twice, and (b) reflected on the pending item as `unread` (true if at
// least one matched event is still unread) + `absorbedEventIds` (every
// matched event id, read or not) so a click can mark all of them read in
// one go (bug B3) instead of leaving the "חדש" dot to be cleared separately.
// This never touches the notifications table or either view — purely a
// presentation-layer merge over data already fetched.
//
// Round-3 fix (decision 92, teacher side, unchanged): matches by the
// *group's* assignment_id + student_id — not by the submission_ids of only
// the questions still pending right now — because the derived queue only
// ever holds the latest attempt per question, so a superseded earlier
// attempt (or an already-reviewed other question) would otherwise leave an
// undeduplicated leftover. The unit the teacher cares about is "this
// student's work on this assignment" (decision 85's own grouping), so
// that's the reconciliation key too.
//
// This round's extension (student side): the student's own pending group is
// now assignment-level too (was per-submission before), so its match key
// widens the same way, from exact submission_id to assignment_id — any
// returned_for_revision event for that assignment is the same fact as "this
// student has an open revision on this assignment", regardless of which
// specific question/attempt produced it. feedback_available is never the
// matched type on either side and must keep appearing under "חדש" as
// before (now as the merged, assignment-level item built above).
function reconcile(pending, events, role) {
  const absorbedIds = new Set();
  const mergedPending = pending.map((item) => {
    const matched = role === 'teacher'
      ? events.filter((e) => e.event_type === 'submission_received'
        && e.assignment_id === item.assignment_id
        && e.student_id === item.student_id)
      : events.filter((e) => e.event_type === 'returned_for_revision'
        && e.assignment_id === item.assignment_id);

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
// auth.uid()). Accepts one or several ids so a merged pending/event item
// (bug B3; and this round's merged student feedback_available item) can
// clear every event it absorbed/represents in a single request.
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
//
// This round's addition: the student's merged "משוב התקבל" item has no
// single question to jump to any more — release is Student × Assignment now
// — so it opens the assignment itself, never a specific question. Every
// other student row (the actionable "↻ הוחזרה לתיקון" pending group, and any
// unabsorbed returned_for_revision leftover) still resolves to the first
// relevant question's position, exactly as before.
export function deepLinkFor(role, row) {
  if (!row.assignment_id) return null;
  if (role === 'teacher') {
    if (!row.position) return null;
    return `/teacher/assignments/${row.assignment_id}/review?student=${row.student_id}&q=${row.position}`;
  }
  if (row.event_type === 'feedback_available') return `/student/assignments/${row.assignment_id}`;
  if (!row.position) return null;
  return `/student/assignments/${row.assignment_id}?q=${row.position}`;
}
