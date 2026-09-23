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

// Calls the invite-student Edge Function. Returns { ok } or { errorCode }.
export async function inviteStudent({ email, fullName }) {
  const { data, error } = await supabase.functions.invoke('invite-student', {
    body: { email, full_name: fullName },
  });
  if (!error) return { ok: true, studentId: data?.student_id };

  // FunctionsHttpError carries the Response in error.context
  let errorCode = 'unknown';
  try {
    const body = await error.context?.json?.();
    if (body?.error) errorCode = body.error;
  } catch {
    // non-JSON body or network failure
  }
  return { ok: false, errorCode };
}
