// Local-only lesson progress (spec §10): this browser/device only, never sent to the cloud or the teacher.
// The key contains the user, the lesson AND the published version id: a new publish (or a restore, which is
// also a new version) has a new key, so old progress is never loaded. Old keys are left alone on purpose.
import { MAX_PROGRESS_BYTES } from './lessonSandbox';

export const progressKey = (userId, lessonId, versionId) =>
  `hevanti:lesson-progress:v1:${userId}:${lessonId}:${versionId}`;

export function readProgress(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function writeProgress(key, value) {
  try {
    const s = JSON.stringify(value ?? null);
    if (s.length > MAX_PROGRESS_BYTES) return false;
    window.localStorage.setItem(key, s);
    return true;
  } catch { return false; }
}
