import { supabase } from '../../lib/supabaseClient';
import { fetchMyCourses } from '../content/contentApi';
import { isMissingStatusTable } from './learningMap';

// Student side. RLS returns only active topics of subjects the caller is enrolled in,
// and only the statuses of the caller's own class in each subject. Nothing here writes.

export async function fetchMySubjects(studentId) {
  const { data, error } = await fetchMyCourses(studentId);
  if (error) return { data: null, error };
  const rows = (data ?? []).map((r) => r.course).filter(Boolean);
  rows.sort((a, b) => a.title.localeCompare(b.title, 'he'));
  return { data: rows, error: null };
}

async function fetchStatuses(courseIds) {
  if (courseIds.length === 0) return { map: new Map(), available: true, error: null };
  const { data, error } = await supabase.from('topic_study_status')
    .select('topic_id, status').in('course_id', courseIds);
  if (isMissingStatusTable(error)) return { map: new Map(), available: false, error: null };
  if (error) return { map: null, available: true, error };
  return { map: new Map(data.map((r) => [r.topic_id, r.status])), available: true, error: null };
}

// One subject: its topics + statuses.
export async function fetchSubjectMap(courseId) {
  const [c, t, s, m] = await Promise.all([
    supabase.from('courses').select('id, title').eq('id', courseId).maybeSingle(),
    supabase.from('topics').select('id, parent_id, title, position, is_archived').eq('course_id', courseId),
    fetchStatuses([courseId]),
    supabase.from('class_students').select('class_id').eq('course_id', courseId),
  ]);
  const error = c.error || t.error || s.error;
  if (error) return { data: null, error };
  if (!c.data) return { data: null, error: null }; // not found / not enrolled
  return { data: { course: c.data, topics: t.data, statuses: s.map, statusAvailable: s.available,
    // RLS lets a student see only their own membership; missing table (pre-migration) => no note
    hasClass: isMissingStatusTable(m.error) || (m.data ?? []).length > 0 }, error: null };
}

// Library: every enrolled subject's topics + statuses (lessons arrive in batch 2).
export async function fetchLibrary(studentId) {
  const subjects = await fetchMySubjects(studentId);
  if (subjects.error) return subjects;
  const ids = subjects.data.map((c) => c.id);
  if (ids.length === 0) return { data: { subjects: [], topics: [], statuses: new Map() }, error: null };
  const [t, s] = await Promise.all([
    supabase.from('topics').select('id, course_id, parent_id, title, position, is_archived').in('course_id', ids),
    fetchStatuses(ids),
  ]);
  const error = t.error || s.error;
  if (error) return { data: null, error };
  return { data: { subjects: subjects.data, topics: t.data, statuses: s.map }, error: null };
}
