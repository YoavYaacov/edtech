import { supabase } from '../../lib/supabaseClient';

// Students linked to the given teacher. RLS already limits rows to the
// caller; the teacher_id filter keeps the query explicit and indexed.
export function fetchMyStudents(teacherId) {
  return supabase
    .from('teacher_students')
    .select('status, created_at, student:profiles!teacher_students_student_id_fkey(id, full_name)')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: true });
}

// Teachers of the given student (for the student's home screen).
export function fetchMyTeachers(studentId) {
  return supabase
    .from('teacher_students')
    .select('teacher:profiles!teacher_students_teacher_id_fkey(id, full_name)')
    .eq('student_id', studentId)
    .eq('status', 'active');
}

// Calls an Edge Function. Returns { ok: true, data } or { ok: false, errorCode }.
async function callFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return { ok: true, data };
  // FunctionsHttpError carries the Response in error.context
  let errorCode = 'unknown';
  try {
    const parsed = await error.context?.json?.();
    if (parsed?.error) errorCode = parsed.error;
  } catch {
    // non-JSON body or network failure
  }
  return { ok: false, errorCode };
}

// invite-student (v2). action: 'invite' (default) | 'resend' | 'repair'.
// courseId (optional): the Edge Function also enrolls the new student in that course, atomically
// (no partial state if enrollment fails). language (optional): the student's language in that course.
// Returns { ok, studentId, status } or { ok: false, errorCode }.
export async function inviteStudent({ email, fullName, courseId, language, action }) {
  const body = { email, full_name: fullName };
  if (courseId) body.course_id = courseId;
  if (courseId && language) body.language = language;
  if (action && action !== 'invite') body.action = action;
  const res = await callFunction('invite-student', body);
  if (!res.ok) return res;
  return { ok: true, studentId: res.data?.student_id, status: res.data?.status ?? 'invited', mailSent: res.data?.mail_sent };
}

// Archive = reversible: hides the student from active lists and new assignments, keeps the history.
export function setStudentArchived(teacherId, studentId, archived) {
  return supabase
    .from('teacher_students')
    .update({ status: archived ? 'archived' : 'active' })
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId);
}

// pending | no_password | active, per own student (no other auth data leaves the database).
export function fetchStudentAuthStatus() {
  return supabase.rpc('my_students_auth_status');
}

// Hard delete (delete-student): always preview first, then delete with the typed name.
export async function previewStudentDeletion(studentId) {
  const res = await callFunction('delete-student', { student_id: studentId, mode: 'preview' });
  return res.ok ? { ok: true, name: res.data.student_name, counts: res.data.counts } : res;
}

export async function deleteStudent(studentId, confirmName) {
  const res = await callFunction('delete-student', { student_id: studentId, mode: 'delete', confirm_name: confirmName });
  return res.ok ? { ok: true } : res;
}
