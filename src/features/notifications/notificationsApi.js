import { supabase } from '../../lib/supabaseClient';

// Phase 5 — Notification / Action Center.
//
// Round 6 (this round, decisions 101+): the panel is now ONE unified list of
// things currently relevant to the user right now — the earlier "דורש
// טיפול" / "חדש" split is gone. Production testing showed "חדש" had turned
// into a de-facto Stored Event log: submission_received accumulates one row
// per submission/attempt, so the same Student × Assignment kept reappearing
// there across different questions/attempts even though nothing about it
// still needed attention. This is a read/presentation-layer change only —
// the `notifications` table, both triggers, and both views
// (teacher_review_queue / student_pending_actions) are all untouched; there
// is no need to delete historical rows, which stay useful for audit.
//
//   * Teacher unit (unchanged, already Production-accepted): Student ×
//     Assignment, one active row per pair while any of that student's
//     questions in that assignment are pending. A raw submission_received
//     event that doesn't match a still-pending group (the question was
//     already reviewed/released) is simply dropped now — never its own row.
//     correctionCount (unchanged) still distinguishes "תיקון התקבל" wording
//     when the whole pending group is resubmissions.
//   * Student unit: Assignment.
//       - An active "↻ הוחזרה לתיקון" row (from student_pending_actions)
//         persists — regardless of read state — until every returned
//         question has been corrected and resubmitted, exactly like the
//         teacher's own pending row.
//       - A "✓ התקבל משוב חדש" row is purely informational: it exists only
//         while unread, and disappears the moment it's opened (marking its
//         event(s) read removes it from the very next fetch — there is
//         nothing further to track once read, unlike the actionable row
//         above). It never appears for an assignment that currently also has
//         an active "הוחזרה לתיקון" row: one release can create both event
//         types across different questions of the same assignment, and the
//         actionable row wins (generalizing, to the whole assignment, the
//         same "never show both for the same fact" rule the DB trigger
//         itself already applies per submission — see the Phase 5 migration).
//
// Badge (this round's fix for the reported "sent feedback, no clear
// notification" bug): the bell's number is simply this same unified list's
// length. Every row in it is, by the list's own definition, "currently
// relevant" — so there is exactly one thing to count. Before this round the
// badge counted "דורש טיפול" only, so a plain informational feedback card
// never moved the number at all even though it was sitting, unread, under
// "חדש" — easy to miss and inconsistent with what the panel actually showed
// (bug this round is fixing, not a separate defect elsewhere: the release
// trigger itself was firing correctly all along — see notify_feedback_change
// in the Phase 5 migration; nothing there needed to change).

const EVENTS_LIMIT = 50; // a recent feed, not a full history browser

// Raw pending rows for the given role — one row per pending question.
// attempt_number (teacher only) drives the "↻ תיקון התקבל" distinction below.
function fetchPendingActions(role) {
  return role === 'teacher'
    ? supabase.from('teacher_review_queue')
      .select('assignment_id, assignment_question_id, student_id, submission_id, submitted_at, attempt_number')
    : supabase.from('student_pending_actions')
      .select('assignment_id, assignment_question_id, submission_id, returned_at');
}

// Stored events, most recent first. RLS already scopes this to the caller's
// own rows (recipient_id = auth.uid()); nothing else to filter here.
function fetchStoredEvents() {
  return supabase.from('notifications')
    .select('id, event_type, assignment_id, assignment_question_id, submission_id, student_id, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(EVENTS_LIMIT);
}

// Groups the teacher's raw per-question pending rows into one item per
// Student × Assignment — the same granularity the "בדיקות" hub
// (reviewApi.fetchReviewQueue) already uses, so the bell and the hub never
// disagree about what "one item to review" means. The question actually
// opened is resolved below, from each row's *current* position, at read
// time — never a position baked in earlier.
//
// correctionCount: how many of the group's pending rows are a resubmission
// (attempt_number > 1) rather than a first submission — used to show
// "↻ תיקון התקבל" / "N תיקונים לבדיקה" instead of the plain "N שאלות
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

// Groups the student's own raw "returned for revision" rows into one item
// per Assignment — the student's own unit is the assignment, never the
// question, on either kind of row.
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
// deep-link contract needs, and — for grouped items — the first still-
// pending question *in current assignment order* (never a hardcoded/stale
// position). Fetches the full assignment_questions list per referenced
// assignment (not just the pending/referenced ids) because both groupings
// need the whole ordered list to find "first pending".
async function enrichAndMerge({ pendingRows, eventRows, role }) {
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

  if (role === 'teacher') {
    const items = groupTeacherPending(pendingRows).map((g) => {
      const matched = eventRows.filter((e) => e.event_type === 'submission_received'
        && e.assignment_id === g.assignment_id && e.student_id === g.student_id);
      return {
        ...g,
        key: `${g.assignment_id}:${g.student_id}`,
        kind: 'teacher_pending',
        position: firstPendingPosition(g.assignment_id, g.pendingAqIds),
        pendingCount: g.pendingAqIds.length,
        studentName: sMap.get(g.student_id) ?? '',
        unread: matched.some((e) => !e.read_at),
        absorbedEventIds: matched.map((e) => e.id),
        ...assignmentMeta(g.assignment_id),
      };
    });
    // Any leftover submission_received event that didn't match a still-
    // pending group means the question was already reviewed/released — a
    // single submission_received must never show as its own item (this
    // round's principle), so it is simply never surfaced, on purpose.
    return { data: items, error: null };
  }

  // Student: the actionable "↻ הוחזרה לתיקון" rows, one per assignment.
  const returnedItems = groupStudentPending(pendingRows).map((g) => {
    const matched = eventRows.filter((e) => e.event_type === 'returned_for_revision' && e.assignment_id === g.assignment_id);
    return {
      ...g,
      key: g.assignment_id,
      kind: 'student_returned',
      position: firstPendingPosition(g.assignment_id, g.pendingAqIds),
      pendingCount: g.pendingAqIds.length,
      unread: matched.some((e) => !e.read_at),
      absorbedEventIds: matched.map((e) => e.id),
      ...assignmentMeta(g.assignment_id),
    };
  });
  const returnedAssignmentIds = new Set(returnedItems.map((g) => g.assignment_id));

  // The informational "✓ התקבל משוב חדש" rows: every feedback_available
  // event for the same assignment collapses into one row (unread if ANY
  // member is unread), shown only while unread and only for an assignment
  // that has no active returned-for-revision row right now (priority rule
  // above).
  const fbGroups = new Map();
  for (const r of eventRows) {
    if (r.event_type !== 'feedback_available') continue;
    const g = fbGroups.get(r.assignment_id) ?? { memberIds: [], anyUnread: false, created_at: r.created_at };
    g.memberIds.push(r.id);
    if (!r.read_at) g.anyUnread = true;
    if (r.created_at > g.created_at) g.created_at = r.created_at;
    fbGroups.set(r.assignment_id, g);
  }
  const feedbackItems = [...fbGroups.entries()]
    .filter(([assignmentId, g]) => g.anyUnread && !returnedAssignmentIds.has(assignmentId))
    .map(([assignmentId, g]) => ({
      key: `fb:${assignmentId}`,
      kind: 'student_feedback',
      assignment_id: assignmentId,
      oldest: g.created_at,
      unread: true,
      absorbedEventIds: g.memberIds,
      ...assignmentMeta(assignmentId),
    }));

  const items = [...returnedItems, ...feedbackItems]
    .sort((x, y) => (x.oldest < y.oldest ? 1 : -1)); // most recently relevant first
  return { data: items, error: null };
}

// Everything the bell + panel need, in one call. `role` = profile.role
// ('teacher' | 'student'), from useAuth().
export async function fetchNotificationCenter(role) {
  const [pendingRes, eventsRes] = await Promise.all([fetchPendingActions(role), fetchStoredEvents()]);
  if (pendingRes.error || eventsRes.error) return { data: null, error: pendingRes.error || eventsRes.error };

  const pendingRows = pendingRes.data ?? [];
  const eventRows = eventsRes.data ?? [];
  if (!pendingRows.length && !eventRows.length) return { data: { items: [] }, error: null };

  const { data: items, error } = await enrichAndMerge({ pendingRows, eventRows, role });
  if (error) return { data: null, error };
  return { data: { items }, error: null };
}

// Recipient marks their own event(s) read — the only client write this
// table allows (grant update (read_at); RLS scopes it to recipient_id =
// auth.uid()). Accepts one or several ids so a merged row can clear every
// event it represents in a single request.
export const markNotificationsRead = (ids) => {
  const list = ids.filter(Boolean);
  if (!list.length) return Promise.resolve({ data: null, error: null });
  return supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', list);
};

// Deep link: entity ids only, q=:position resolved above — the exact same
// param contract WorkspacePage/ReviewPage already use, so no change to
// either page is needed. For a teacher's grouped item, `position` is the
// first still-pending question as of this fetch — resolved here at read
// time, never hardcoded.
//
// The student's informational "משוב התקבל" row has no single question to
// jump to — release is Student × Assignment — so it opens the assignment
// itself, never a specific question. The actionable "הוחזרה לתיקון" row
// still resolves to the first relevant question's position, as before.
export function deepLinkFor(role, row) {
  if (!row.assignment_id) return null;
  if (role === 'teacher') {
    if (!row.position) return null;
    return `/teacher/assignments/${row.assignment_id}/review?student=${row.student_id}&q=${row.position}`;
  }
  if (row.kind === 'student_feedback') return `/student/assignments/${row.assignment_id}`;
  if (!row.position) return null;
  return `/student/assignments/${row.assignment_id}?q=${row.position}`;
}
