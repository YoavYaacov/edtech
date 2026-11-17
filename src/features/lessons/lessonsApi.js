import { supabase } from '../../lib/supabaseClient';

// NOTE: lessons <-> lesson_versions has TWO foreign keys (lesson_versions.lesson_id and lessons.published_version_id),
// so every embed of lesson_versions must name the FK, otherwise PostgREST answers PGRST201 (ambiguous relationship).
// Teacher side. Reads go through RLS (owner only); every write is an RPC that re-checks ownership.
const LESSON_LIST = 'id, title, lesson_key, course_id, published_version_id, is_archived, updated_at, course:courses(id, title), versions:lesson_versions!lesson_versions_lesson_id_fkey(id, version_no), topics:lesson_topics(topic_id)';

export const fetchLessons = () => supabase.from('lessons').select(LESSON_LIST).order('updated_at', { ascending: false });

export async function fetchLesson(lessonId) {
  const [l, v, e] = await Promise.all([
    supabase.from('lessons').select('id, title, lesson_key, course_id, published_version_id, is_archived, course:courses(id, title), topics:lesson_topics(topic_id)').eq('id', lessonId).maybeSingle(),
    supabase.from('lesson_versions').select('id, version_no, title, size_bytes, origin, restored_from, created_at, published_at')
      .eq('lesson_id', lessonId).order('version_no', { ascending: false }),
    supabase.from('lesson_early_access').select('class_id').eq('lesson_id', lessonId),
  ]);
  const error = l.error || v.error || e.error;
  if (error) return { data: null, error };
  if (!l.data) return { data: null, error: null };
  return { data: { lesson: l.data, versions: v.data, early: e.data.map((r) => r.class_id) }, error: null };
}

// For the upload screen: the teacher's subjects with their topics.
export async function fetchUploadContext() {
  const [c, t] = await Promise.all([
    supabase.from('courses').select('id, title, is_archived').eq('is_archived', false).order('sort_order', { ascending: true }),
    supabase.from('topics').select('id, course_id, parent_id, title, position, is_archived'),
  ]);
  const error = c.error || t.error;
  if (error) return { data: null, error };
  return { data: c.data.map((x) => ({ ...x, topics: t.data.filter((y) => y.course_id === x.id) })), error: null };
}

export async function fetchBundle(versionId) {
  const { data, error } = await supabase.from('lesson_bundles').select('html').eq('version_id', versionId).maybeSingle();
  return { data: data?.html ?? null, error };
}

export const importVersion = ({ key, title, courseId, meta, hash, html, topicIds }) =>
  supabase.rpc('import_lesson_version', {
    p_lesson_key: key, p_title: title, p_course_id: courseId ?? null, p_meta: meta ?? {}, p_hash: hash, p_html: html, p_topic_ids: topicIds ?? [],
  });
export const publishVersion = (versionId) => supabase.rpc('publish_lesson_version', { p_version_id: versionId });
export const restoreVersion = (versionId) => supabase.rpc('restore_lesson_version', { p_version_id: versionId });
export const unpublishLesson = (lessonId) => supabase.rpc('unpublish_lesson', { p_lesson_id: lessonId });
export const setLessonTopics = (lessonId, topicIds) => supabase.rpc('set_lesson_topics', { p_lesson_id: lessonId, p_topic_ids: topicIds });
export const setEarlyAccess = (lessonId, classId, enabled) =>
  supabase.rpc('set_lesson_early_access', { p_lesson_id: lessonId, p_class_id: classId, p_enabled: enabled });
export const archiveLesson = (lessonId, archived) => supabase.rpc('archive_lesson', { p_lesson_id: lessonId, p_archived: archived });
export const fetchClassesOf = (courseId) => supabase.from('classes').select('id, title').eq('course_id', courseId).order('created_at', { ascending: true });

// Student side. RLS returns only lessons that are published AND available to the caller's class.
export const fetchStudentLessons = () => supabase.from('lessons')
  .select('id, title, course:courses(id, title), topics:lesson_topics(topic_id)')
  .not('published_version_id', 'is', null).order('title', { ascending: true });

export async function fetchStudentLesson(lessonId) {
  const l = await supabase.from('lessons').select('id, title, published_version_id, course:courses(id, title)').eq('id', lessonId).maybeSingle();
  if (l.error) return { data: null, error: l.error };
  if (!l.data?.published_version_id) return { data: null, error: null };
  const b = await fetchBundle(l.data.published_version_id);
  if (b.error) return { data: null, error: b.error };
  if (!b.data) return { data: null, error: null };
  return { data: { lesson: l.data, html: b.data }, error: null };
}
