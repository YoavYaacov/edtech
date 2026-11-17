import { supabase } from '../../lib/supabaseClient';

// Every call below is an RPC that re-checks permissions inside the database (or an owner-only RLS select).
// Nothing here trusts a class id coming from the browser.

// ---- student identity / joining ----
export const myIdentity = () => supabase.rpc('my_identity');
export const completeIdentity = (first, last, idNumber) =>
  supabase.rpc('complete_student_identity', { p_first: first, p_last: last, p_id: idNumber });
export const previewJoin = (token) => supabase.rpc('preview_join', { p_token: token });
export const joinClass = (token) => supabase.rpc('join_class', { p_token: token });

// ---- teacher: join links ----
export const fetchActiveJoinLink = (classId) => supabase.from('class_join_links')
  .select('id, class_id, token, expires_at, max_uses, uses, revoked_at')
  .eq('class_id', classId).is('revoked_at', null).maybeSingle();
export const createJoinLink = (classId, days, maxUses) =>
  supabase.rpc('create_join_link', { p_class_id: classId, p_days: days, p_max_uses: maxUses });
export const revokeJoinLink = (classId) => supabase.rpc('revoke_join_link', { p_class_id: classId });
export const setJoinApproval = (classId, enabled) =>
  supabase.rpc('set_class_join_approval', { p_class_id: classId, p_enabled: enabled });
export const listJoinRequests = (classId) => supabase.rpc('list_join_requests', { p_class_id: classId });
export const decideJoinRequest = (requestId, approve) =>
  supabase.rpc('decide_join_request', { p_request_id: requestId, p_approve: approve });
export const revealStudentId = (studentId) => supabase.rpc('reveal_student_id', { p_student_id: studentId });

// ---- roster (teacher) and roster-based joining ----
export const rosterAdd = (classId, rows) => supabase.rpc('roster_add', { p_class_id: classId, p_rows: rows });
export const rosterList = (classId) => supabase.rpc('roster_list', { p_class_id: classId });
export const rosterRemove = (rosterId) => supabase.rpc('roster_remove', { p_roster_id: rosterId });
export const rosterForJoin = (token) => supabase.rpc('roster_for_join', { p_token: token });
export const verifyRosterEntry = (token, rosterId, idNumber) =>
  supabase.rpc('verify_roster_entry', { p_token: token, p_roster_id: rosterId, p_id: idNumber });
export const claimRoster = (ticket) => supabase.rpc('claim_roster', { p_ticket: ticket });

export const joinUrl = (token, origin = typeof window !== 'undefined' ? window.location.origin : '') =>
  `${origin}/join/${token}`;

// ---- class board ----
export const fetchClassInfo = (classId) => supabase.from('classes')
  .select('id, title, course_id, join_requires_approval').eq('id', classId).maybeSingle();
export const fetchMyClasses = () => supabase.rpc('my_classes');
export const listPosts = (classId) => supabase.rpc('list_class_posts', { p_class_id: classId, p_limit: 50 });
export const createPost = (classId, f) => supabase.rpc('create_class_post', {
  p_class_id: classId, p_body: f.body, p_pinned: f.pinned, p_comments_mode: f.commentsMode,
  p_lesson_id: f.lessonId || null, p_assignment_id: f.assignmentId || null,
});
export const updatePost = (postId, f) => supabase.rpc('update_class_post', {
  p_post_id: postId, p_body: f.body, p_pinned: f.pinned, p_comments_mode: f.commentsMode,
  p_lesson_id: f.lessonId || null, p_assignment_id: f.assignmentId || null,
});
export const setPostFlags = (postId, pinned, commentsMode) =>
  supabase.rpc('set_class_post_flags', { p_post_id: postId, p_pinned: pinned, p_comments_mode: commentsMode });
export const deletePost = (postId) => supabase.rpc('delete_class_post', { p_post_id: postId });
export const listComments = (postId) => supabase.rpc('list_post_comments', { p_post_id: postId });
export const addComment = (postId, body) => supabase.rpc('add_post_comment', { p_post_id: postId, p_body: body });
export const deleteComment = (commentId) => supabase.rpc('delete_post_comment', { p_comment_id: commentId });

// lessons / assignments of a subject, for linking from a post (teacher; RLS limits to their own)
export const fetchLinkables = async (courseId) => {
  const [lessons, assignments] = await Promise.all([
    supabase.from('lessons').select('id, title').eq('course_id', courseId).eq('is_archived', false).order('title'),
    supabase.from('assignments').select('id, title').eq('course_id', courseId).eq('status', 'published').order('title'),
  ]);
  return { data: { lessons: lessons.data ?? [], assignments: assignments.data ?? [] }, error: lessons.error || assignments.error };
};
