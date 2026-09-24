import { supabase } from '../../lib/supabaseClient';

const COURSE_FIELDS = 'id, title, code, description, programming_language, is_archived, created_at';

export function fetchCourses() {
  // RLS returns only courses the caller owns (teacher) or is enrolled in (student).
  return supabase
    .from('courses')
    .select(`${COURSE_FIELDS}, topics(count)`)
    .eq('topics.is_archived', false)
    .order('created_at', { ascending: true });
}

export function fetchCourse(courseId) {
  return supabase.from('courses').select(COURSE_FIELDS).eq('id', courseId).maybeSingle();
}

export function createCourse(ownerId, values) {
  return supabase
    .from('courses')
    .insert({ owner_id: ownerId, ...values })
    .select(COURSE_FIELDS)
    .single();
}

export function updateCourse(courseId, patch) {
  return supabase.from('courses').update(patch).eq('id', courseId).select(COURSE_FIELDS).single();
}

export function fetchTopics(courseId) {
  return supabase
    .from('topics')
    .select('id, parent_id, title, position, is_archived')
    .eq('course_id', courseId)
    .order('position', { ascending: true });
}

export function createTopic({ courseId, parentId, title, position }) {
  return supabase
    .from('topics')
    .insert({ course_id: courseId, parent_id: parentId ?? null, title, position })
    .select('id')
    .single();
}

export function updateTopic(topicId, patch) {
  return supabase.from('topics').update(patch).eq('id', topicId);
}

// Rewrites positions 1..n for an ordered list of sibling ids (only changed rows).
export async function reorderSiblings(orderedIds, currentPositions) {
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (currentPositions.get(id) !== i + 1) {
      const { error } = await updateTopic(id, { position: i + 1 });
      if (error) return { error };
    }
  }
  return { error: null };
}

export function fetchEnrollments(courseId) {
  return supabase
    .from('course_enrollments')
    .select('student_id, created_at, student:profiles(id, full_name)')
    .eq('course_id', courseId)
    .order('created_at', { ascending: true });
}

export function enrollStudent(courseId, studentId) {
  return supabase.from('course_enrollments').insert({ course_id: courseId, student_id: studentId });
}

export function unenrollStudent(courseId, studentId) {
  return supabase.from('course_enrollments').delete().eq('course_id', courseId).eq('student_id', studentId);
}

// For the student's home screen: enrolled, non-archived courses.
export function fetchMyCourses(studentId) {
  return supabase
    .from('course_enrollments')
    .select('course:courses(id, title, code)')
    .eq('student_id', studentId);
}
