import { supabase } from '../../lib/supabaseClient';

// Phase 5 — Notification / Action Center, Step 2 (UI only).
// No new DB objects here: everything below reads existing, already-approved
// objects — teacher_review_queue (Phase 4), student_pending_actions and
// public.notifications (Phase 5 step 1, migration 20260926000100) — and
// writes only the one column the client is granted: notifications.read_at.
//
// Two lists, kept apart on purpose (decision 76):
//   * "דורש טיפול" (pending) — derived, never stored; closes itself.
//   * "חדש" (events)         — Stored Events; read/unread is a per-viewer fact.
// The bell's own number counts pending.length only (decision 76/78) — never
// the unread event count, which is shown inside the panel alone.

const EVENTS_LIMIT = 50; // a recent feed, not a full history browser

// "דורש טיפול" for the given role. Column lists mirror what the existing
// screens already select from these same views (reviewApi.js / the phase-5
// migration's student_pending_actions) — no new columns, no new views.
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

// Resolves display text + the stable `position` the existing q=:position
// deep-link contract needs (decision 56/77/81). Looked up here at read time,
// exactly as the migration's own comment describes — never duplicated into
// the notifications table itself.
async function enrichRows(rows, role) {
  const aqIds = [...new Set(rows.map((r) => r.assignment_question_id))];
  const assignmentIds = [...new Set(rows.map((r) => r.assignment_id))];
  const studentIds = role === 'teacher' ? [...new Set(rows.map((r) => r.student_id).filter(Boolean))] : [];

  const [aq, a, s] = await Promise.all([
    aqIds.length ? supabase.from('assignment_questions').select('id, position, title').in('id', aqIds) : Promise.resolve({ data: [] }),
    assignmentIds.length ? supabase.from('assignments').select('id, title, course:courses(title)').in('id', assignmentIds) : Promise.resolve({ data: [] }),
    studentIds.length ? supabase.from('profiles').select('id, full_name').in('id', studentIds) : Promise.resolve({ data: [] }),
  ]);
  if (aq.error || a.error || s.error) return { data: null, error: aq.error || a.error || s.error };

  const aqMap = new Map((aq.data ?? []).map((x) => [x.id, x]));
  const aMap = new Map((a.data ?? []).map((x) => [x.id, x]));
  const sMap = new Map((s.data ?? []).map((x) => [x.id, x.full_name]));

  const data = rows.map((r) => ({
    ...r,
    position: aqMap.get(r.assignment_question_id)?.position ?? null,
    questionTitle: aqMap.get(r.assignment_question_id)?.title ?? '',
    assignmentTitle: aMap.get(r.assignment_id)?.title ?? '',
    courseTitle: aMap.get(r.assignment_id)?.course?.title ?? '',
    studentName: role === 'teacher' ? sMap.get(r.student_id) ?? '' : null,
  }));
  return { data, error: null };
}

// Everything the bell + panel need, in one call. `role` = profile.role
// ('teacher' | 'student'), from useAuth().
export async function fetchNotificationCenter(role) {
  const [pendingRes, eventsRes] = await Promise.all([fetchPendingActions(role), fetchStoredEvents()]);
  if (pendingRes.error || eventsRes.error) return { data: null, error: pendingRes.error || eventsRes.error };

  const pendingRows = pendingRes.data ?? [];
  const eventRows = eventsRes.data ?? [];
  const allRows = [...pendingRows, ...eventRows];
  if (!allRows.length) return { data: { pending: [], events: [] }, error: null };

  const { data: enriched, error } = await enrichRows(allRows, role);
  if (error) return { data: null, error };

  return {
    data: {
      pending: enriched.slice(0, pendingRows.length),
      events: enriched.slice(pendingRows.length),
    },
    error: null,
  };
}

// Recipient marks their own event read — the only client write this table
// allows (grant update (read_at); RLS scopes it to recipient_id = auth.uid()).
export const markNotificationRead = (id) =>
  supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);

// Deep link (decision 56/77/81): entity ids only, q=:position resolved above
// — the exact same param contract WorkspacePage/ReviewPage already use, so
// no change to either page is needed.
export function deepLinkFor(role, row) {
  if (!row.assignment_id || !row.position) return null;
  return role === 'teacher'
    ? `/teacher/assignments/${row.assignment_id}/review?student=${row.student_id}&q=${row.position}`
    : `/student/assignments/${row.assignment_id}?q=${row.position}`;
}
