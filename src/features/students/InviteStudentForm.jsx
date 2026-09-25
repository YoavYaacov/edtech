import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import Button from '../../components/ui/Button';
import TextField from '../../components/ui/TextField';
import { inviteStudent } from './studentsApi';
import { errors, students as t } from '../../i18n/he';
import styles from './students.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Default: the standalone panel on the Students page (unchanged).
// embedded + courseId: used inside a course page; the student is also enrolled.
export default function InviteStudentForm({ onInvited, courseId = null, embedded = false }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSuccess('');
    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    if (name.length < 2 || name.length > 120) return setError(t.inviteErrors.invalid_name);
    if (!EMAIL_RE.test(mail)) return setError(t.inviteErrors.invalid_email);

    setBusy(true);
    setError('');
    const result = await inviteStudent({ email: mail, fullName: name, courseId });
    setBusy(false);

    if (!result.ok) {
      setError(t.inviteErrors[result.errorCode] ?? errors.generic);
      return;
    }
    setSuccess(courseId ? t.invitedToCourse(name) : t.invited(name));
    setFullName('');
    setEmail('');
    onInvited?.(name);
  }

  const content = (
    <>
      <form className={styles.inviteForm} onSubmit={handleSubmit} noValidate>
        <TextField label={t.fullName} autoComplete="off" required
          value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <TextField label={t.email} type="email" dir="ltr" autoComplete="off" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" icon={UserPlus} loading={busy} disabled={!fullName || !email}
          className={styles.inviteButton}>
          {busy ? t.inviting : t.invite}
        </Button>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
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
