import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LogIn, UserPlus, Check } from 'lucide-react';
import AuthLayout from '../auth/AuthLayout';
import { useAuth } from '../auth/AuthProvider';
import Button from '../../components/ui/Button';
import TextField from '../../components/ui/TextField';
import { LoadingState } from '../../components/ui/States';
import { authErrorMessage } from '../../lib/authErrors';
import { completeIdentity, joinClass, myIdentity, previewJoin } from './classesApi';
import { cleanName, isValidIsraeliId, isValidName, normalizeIdNumber } from './identity';
import { errors, joinPage as t } from '../../i18n/he';
import styles from '../auth/authForms.module.css';

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{32,128}$/;

function Notice({ kind = 'error', children }) {
  return <p className={`${styles.notice} ${kind === 'success' ? styles.noticeSuccess : styles.noticeError}`}
    role={kind === 'success' ? 'status' : 'alert'}>{children}</p>;
}

function AuthStep({ onNeedMail, redirectTo }) {
  const { signIn, signUp } = useAuth();
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (tab === 'register' && !consent) { setError(t.consentRequired); return; }
    if (tab === 'register' && password.length < 8) { setError(t.passwordHint); return; }
    setBusy(true);
    const res = tab === 'login'
      ? await signIn(email.trim(), password)
      : await signUp(email.trim(), password, redirectTo);
    setBusy(false);
    if (res.error) { setError(authErrorMessage(res.error)); return; }
    if (tab === 'register' && !res.data?.session) onNeedMail();
    // otherwise onAuthStateChange updates the session and the page moves on by itself
  }

  return (
    <>
      <div role="tablist" className={styles.muted} style={{ display: 'flex', gap: 'var(--space-4)' }}>
        {[['login', t.tabLogin], ['register', t.tabRegister]].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={styles.linkButton}
            style={{ fontWeight: tab === k ? 700 : 400 }} onClick={() => { setTab(k); setError(''); }}>{label}</button>
        ))}
      </div>
      {tab === 'register' && <p className={styles.muted}>{t.registerExplain}</p>}
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField label="אימייל" type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="סיסמה" type="password" dir="ltr" required value={password}
          autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
          hint={tab === 'register' ? t.passwordHint : undefined} onChange={(e) => setPassword(e.target.value)} />
        {tab === 'register' && (
          <label className={styles.muted} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{t.consent}</span>
          </label>
        )}
        {error && <Notice>{error}</Notice>}
        <Button type="submit" icon={tab === 'login' ? LogIn : UserPlus} loading={busy} disabled={!email || !password}>
          {tab === 'login' ? 'כניסה' : busy ? t.registering : t.register}
        </Button>
      </form>
    </>
  );
}

function IdentityStep({ onDone }) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [idNum, setIdNum] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const idBad = idNum !== '' && !isValidIsraeliId(idNum);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!isValidName(first) || !isValidName(last)) { setError(t.identityErrors.invalid_name); return; }
    if (!isValidIsraeliId(idNum)) { setError(t.identityErrors.invalid_id); return; }
    setBusy(true);
    const { data, error: err } = await completeIdentity(cleanName(first), cleanName(last), normalizeIdNumber(idNum));
    setBusy(false);
    if (err) { setError(errors.generic); return; }
    if (!data?.ok) { setError(t.identityErrors[data?.reason] ?? errors.generic); return; }
    onDone();
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <p className={styles.muted}>{t.identityExplain}</p>
      <TextField label={t.firstName} autoComplete="given-name" maxLength={40} required value={first} onChange={(e) => setFirst(e.target.value)} />
      <TextField label={t.lastName} autoComplete="family-name" maxLength={40} required value={last} onChange={(e) => setLast(e.target.value)} />
      <TextField label={t.idNumber} dir="ltr" inputMode="numeric" autoComplete="off" maxLength={11} required
        value={idNum} hint={t.idHint} error={idBad ? t.identityErrors.invalid_id : undefined} onChange={(e) => setIdNum(e.target.value)} />
      {error && <Notice>{error}</Notice>}
      <Button type="submit" loading={busy} disabled={!first.trim() || !last.trim() || !idNum}>{busy ? t.saving : t.saveIdentity}</Button>
    </form>
  );
}

export default function JoinPage() {
  const { token } = useParams();
  const { session, profile, isInitializing, signOut } = useAuth();
  const [preview, setPreview] = useState(null); // {status, class_title, course_title, requires_approval}
  const [identity, setIdentity] = useState(null); // my_identity() | null
  const [result, setResult] = useState(null); // join_class() result
  const [busy, setBusy] = useState(false);
  const [mailSent, setMailSent] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!TOKEN_FORMAT.test(token ?? '')) { setPreview({ status: 'invalid' }); return undefined; }
    previewJoin(token).then(({ data, error }) => { if (alive) { if (error) setFailed(true); else setPreview(data); } });
    return () => { alive = false; };
  }, [token]);

  const isStudent = session && profile?.role === 'student';
  const loadIdentity = useCallback(async () => {
    const { data, error } = await myIdentity();
    if (error) setFailed(true); else setIdentity(data);
  }, []);
  useEffect(() => { if (isStudent) loadIdentity(); }, [isStudent, loadIdentity]);

  async function doJoin() {
    setBusy(true);
    const { data, error } = await joinClass(token);
    setBusy(false);
    if (error) { setFailed(true); return; }
    setResult(data);
  }

  if (failed) return <AuthLayout title={t.title}><Notice>{errors.generic}</Notice></AuthLayout>;
  if (!preview || isInitializing) return <AuthLayout title={t.title}><LoadingState label={t.checking} /></AuthLayout>;
  if (preview.status !== 'ok') {
    return <AuthLayout title={t.title}><Notice>{t[preview.status] ?? t.invalid}</Notice></AuthLayout>;
  }

  const intro = <p>{t.invite(preview.class_title, preview.course_title)}</p>;

  let body;
  if (result) {
    if (result.ok) {
      const text = result.status === 'pending' ? t.pending : result.status === 'already_member' ? t.alreadyMember : t.joined(preview.class_title);
      body = (<>
        <Notice kind="success"><Check size={16} aria-hidden="true" /> {text}</Notice>
        {result.status !== 'pending' && <Link to="/student/subjects" className={styles.linkButton}>{t.toSubjects}</Link>}
      </>);
    } else {
      body = <Notice>{t.results[result.reason] ?? errors.generic}</Notice>;
    }
  } else if (!session) {
    body = mailSent ? <Notice kind="success">{t.checkEmail}</Notice> : (<>{intro}<AuthStep redirectTo={`${window.location.origin}/join/${token}`} onNeedMail={() => setMailSent(true)} /></>);
  } else if (!isStudent) {
    body = (<>
      <Notice>{t.teacherAccount}</Notice>
      <button type="button" className={styles.linkButton} onClick={() => signOut()}>{t.signOut}</button>
    </>);
  } else if (!identity) {
    body = <LoadingState label={t.checking} />;
  } else if (!identity.complete) {
    body = (<>{intro}<IdentityStep onDone={loadIdentity} /></>);
  } else {
    body = (<>
      {intro}
      {preview.requires_approval && <p className={styles.muted}>{t.needsApproval}</p>}
      <Button loading={busy} onClick={doJoin}>{busy ? t.joining : preview.requires_approval ? t.sendRequest : t.joinButton}</Button>
    </>);
  }

  return <AuthLayout title={t.title}><div className={styles.form}>{body}</div></AuthLayout>;
}
