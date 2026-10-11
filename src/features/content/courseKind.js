import { courseLanguageList } from './contentApi';

// R1B-3: the "programming language" field is only meaningful for programming courses.
// The schema has no explicit subject/field classification for a course, so this is derived from data, never from a
// course name: a course is treated as a programming course when
//   * it has a primary or additional programming language, OR
//   * it already holds code/tracing questions (so an unconfigured programming course keeps its field), OR
//   * the question being edited already carries a language value (existing data is never hidden).
// Only a course with none of these (the maths case) hides the field. Hiding never deletes a stored value.
export function showsProgrammingLanguage(course, { hasCodeQuestions = true, questionLanguage = '', neutral = false } = {}) {
  if (!course) return true; // unknown → keep the field (fail open for programming courses)
  if (courseLanguageList(course).length > 0 || course.programming_language || (course.course_languages ?? []).length > 0) return true;
  return Boolean(hasCodeQuestions || questionLanguage || neutral);
}
