import { useState } from 'react';
import { errors, safeDelete as t } from '../../i18n/he';

// Two-step safe delete: ask the DB (dry run) → show confirm or explanation → delete.
// check(id) and remove(id) must call the DB function with dryRun true/false.
export function useSafeDelete({ check, remove, onDeleted }) {
  const [state, setState] = useState(null); // { item, mode: 'confirm' | 'blocked', info }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start(item) {
    setBusy(true);
    setError('');
    const { data, error: err } = await check(item.id);
    setBusy(false);
    if (err) return setError(errors.generic);
    setState({ item, mode: data.deletable ? 'confirm' : 'blocked', info: data });
  }

  async function confirm() {
    setBusy(true);
    const { data, error: err } = await remove(state.item.id);
    setBusy(false);
    if (err) { setState(null); return setError(errors.generic); }
    if (data.deleted) { setState(null); return onDeleted(state.item, data); }
    // Something changed since the check (e.g. a question was linked meanwhile).
    setState({ ...state, mode: 'blocked', info: data });
  }

  return { state, busy, error, start, confirm, close: () => setState(null) };
}

export function blockedReason(info) {
  if (info.reason === 'has_questions') return info.students !== undefined
    ? t.courseHasQuestions(info.questions) : t.topicHasQuestions(info.questions);
  if (info.reason === 'has_students') return t.courseHasStudents(info.students);
  if (info.reason === 'has_mistake_tags') return t.hasMistakeTags(info.mistake_tags);
  if (info.reason === 'has_classes') return t.hasClasses(info.classes);
  if (info.reason === 'has_study_status') return t.hasStudyStatus();
  return t.inUse;
}
