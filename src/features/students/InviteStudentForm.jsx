import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import Button from '../../components/ui/Button';
import TextField from '../../components/ui/TextField';
import Select from '../../components/ui/Select';
import { inviteStudent } from './studentsApi';
import { errors, languages as languageNames, students as t } from '../../i18n/he';
import styles from './students.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Default: the standalone panel on the Students page.
// embedded + courseId: used inside a course page; the student is also enrolled.
// courseLanguages (optional): when the course supports several programming languages the teacher picks
// the student's language (default: the course's primary language).
export default function InviteStudentForm({ onInvited, courseId = null, embedded = false, courseLanguages = [], defaultLanguage = '' }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [language, setLanguage] = useState(defaultLanguage || courseLanguages[0] || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [success, setSuccess] = useState('');

  const multiLanguage = Boolean(courseId) && courseLanguages.length > 1;

  async function submit(action) {
    setSuccess('');
    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    if (name.length < 2 || name.length > 120) return setError(t.inviteErrors.invalid_name);
    if (!EMAIL_RE.test(mail)) return setError(t.inviteErrors.invalid_email);

    setBusy(true);
    setError('');
    setErrorCode('');
    const result = await inviteStudent({
      email: mail, fullName: name, courseId,
      language: courseId && courseLanguages.length > 0 ? language || undefined : undefined,
      action,
    });
    setBusy(false);

    if (!result.ok) {
      setError(t.inviteErrors[result.errorCode] ?? errors.generic);
      setErrorCode(t.inviteActions[result.errorCode] ? result.errorCode : '');
      return;
    }
    const done = t.inviteResults[result.status];
    setSuccess(done ? done(name, result.mailSent) : courseId ? t.invitedToCourse(name) : t.invited(name));
    setFullName('');
    setEmail('');
    onInvited?.(name);
  }

  const followUp = errorCode ? t.inviteActions[errorCode] : null;

  const content = (
    <>
      <form className={styles.inviteForm} onSubmit={(e) => { e.preventDefault(); submit('invite'); }} noValidate
        data-with-language={multiLanguage || undefined}>
        <TextField label={t.fullName} autoComplete="off" required
          value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <TextField label={t.email} type="email" dir="ltr" autoComplete="off" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
        {multiLanguage && (
          <Select label={t.language} value={language} onChange={(e) => setLanguage(e.target.value)}
            options={courseLanguages.map((l) => ({ value: l, label: languageNames[l] ?? l }))} />
        )}
        <Button type="submit" icon={UserPlus} loading={busy && !followUp} disabled={!fullName || !email}
          className={styles.inviteButton}>
          {busy ? t.inviting : t.invite}
        </Button>
      </form>
      {error && (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          {followUp && (
            <Button variant="secondary" loading={busy} onClick={() => submit(followUp.action)}>{followUp.label}</Button>
          )}
        </div>
      )}
      {success && <p className={styles.success} role="status">{success}</p>}
    </>
  );
  if (embedded) return content;

  return (
    <section className={styles.panel} aria-labelledby="invite-title">
      <h2 id="invite-title" className={styles.panelTitle}>{t.inviteTitle}</h2>
      <p className={styles.muted}>{t.inviteExplain}</p>
      {content}
    </section>
  );
}
