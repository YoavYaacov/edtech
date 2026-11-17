import { supabase } from '../../lib/supabaseClient';

const COURSE_FIELDS = 'id, title, code, description, programming_language, is_archived, created_at, course_languages(programming_language)';

// The languages a course supports, primary first: ['java', 'csharp'].
export function courseLanguageList(course) {
  const set = (course?.course_languages ?? []).map((x) => x.programming_language);
  const primary = course?.programming_language;
  if (!primary) return [];
  return [primary, ...set.filter((l) => l !== primary).sort()];
}

export function fetchCourses() {
  // RLS returns only courses the caller owns (teacher) or is enrolled in (student).
  return supabase
    .from('courses')
    .select(`${COURSE_FIELDS}, topics(count)`)
    .eq('topics.is_archived', false)
    .order('sort_order', { ascending: true })
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
    .select('student_id, created_at, programming_language, student:profiles(id, full_name)')
    .eq('course_id', courseId)
    .order('created_at', { ascending: true });
}

export function enrollStudent(courseId, studentId, language) {
  const row = { course_id: courseId, student_id: studentId };
  if (language) row.programming_language = language;
  return supabase.from('course_enrollments').insert(row);
}

// The student's programming language in this course (server rejects it while a draft assignment in another language exists).
export function setEnrollmentLanguage(courseId, studentId, language) {
  return supabase.from('course_enrollments').update({ programming_language: language })
    .eq('course_id', courseId).eq('student_id', studentId).select('student_id');
}

export function addCourseLanguage(courseId, language) {
  return supabase.from('course_languages').insert({ course_id: courseId, programming_language: language });
}

// Fails (FK) while any enrollment or assignment still uses the language; the primary language cannot be removed.
export function removeCourseLanguage(courseId, language) {
  return supabase.from('course_languages').delete().eq('course_id', courseId).eq('programming_language', language);
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

// Safe delete (decision 24). The database decides; dryRun only reports.
// Result: { deletable, reason?, questions?, students?, topics } or { deleted: true, topics }.
export function deleteTopic(topicId, { dryRun }) {
  return supabase.rpc('delete_topic', { p_topic_id: topicId, p_dry_run: dryRun });
}

export function deleteCourse(courseId, { dryRun }) {
  return supabase.rpc('delete_course', { p_course_id: courseId, p_dry_run: dryRun });
}

// ---------- Mistake tags (Phase 4, decisions 55/60/63). Teacher only (RLS). ----------
// usage = number of attempts the tag is attached to (drives "delete vs archive" in the UI;
// the database enforces it anyway with ON DELETE RESTRICT).
export function fetchMistakeTags(courseId) {
  return supabase
    .from('mistake_tags')
    .select('id, name, description, topic_id, is_archived, created_at, usage:submission_mistakes(count)')
    .eq('course_id', courseId)
    .order('name', { ascending: true });
}

export function createMistakeTag(ownerId, courseId, { name, topicId, description }) {
  return supabase.from('mistake_tags').insert({
    owner_id: ownerId, course_id: courseId, topic_id: topicId || null, name, description,
  });
}

export function updateMistakeTag(tagId, patch) {
  return supabase.from('mistake_tags').update(patch).eq('id', tagId);
}

// Returns deleted rows; an FK error (23503) means the tag is in use.
export function deleteMistakeTag(tagId) {
  return supabase.from('mistake_tags').delete().eq('id', tagId).select('id');
}

// Persistent teacher-defined course order. Ids = the courses being arranged, in the new order;
// the server re-uses the slots those courses already occupy, so hidden (archived) courses keep their place.
export function reorderCourses(orderedIds) {
  return supabase.rpc('reorder_courses', { p_ids: orderedIds });
}

// Teacher: classes (a group inside one subject) and study status per (class, topic).
export function fetchClasses(courseId) {
  return supabase.from('classes')
    .select('id, title, created_at, join_requires_approval, members:class_students(student_id)')
    .eq('course_id', courseId).order('created_at', { ascending: true });
}
export const createClass = (courseId, title) => supabase.rpc('create_class', { p_course_id: courseId, p_title: title });
export const deleteClass = (classId) => supabase.rpc('delete_class', { p_class_id: classId });
export const setClassMember = (classId, studentId, member) =>
  supabase.rpc('set_class_member', { p_class_id: classId, p_student_id: studentId, p_member: member });
export function fetchTopicStatuses(courseId) {
  return supabase.from('topic_study_status').select('class_id, topic_id, status').eq('course_id', courseId);
}
export const setTopicStatus = (classId, topicId, status) =>
  supabase.rpc('set_topic_status', { p_class_id: classId, p_topic_id: topicId, p_status: status });
