import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LogIn, UserPlus, Check } from 'lucide-react';
import AuthLayout from '../auth/AuthLayout';
import { useAuth } from '../auth/AuthProvider';
import Button from '../../components/ui/Button';
import TextField from '../../components/ui/TextField';
import { LoadingState } from '../../components/ui/States';
import { authErrorMessage } from '../../lib/authErrors';
import { bindTicketEmail, claimRoster, completePendingJoin, joinStatus, rosterForJoin, verifyRosterEntry } from './classesApi';
import { isValidIsraeliId, normalizeIdNumber } from './identity';
import { errors, joinPage as t } from '../../i18n/he';
import styles from '../auth/authForms.module.css';

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{32,128}$/;

function Notice({ kind = 'error', children }) {
  return <p className={`${styles.notice} ${kind === 'success' ? styles.noticeSuccess : styles.noticeError}`}
    role={kind === 'success' ? 'status' : 'alert'}>{children}</p>;
}

function AuthStep({ onNeedMail, redirectTo, ticket, onTicketLost, initialTab = 'register', loginOnly = false }) {
  const { signIn, signUp } = useAuth();
  const [tab, setTab] = useState(loginOnly ? 'login' : initialTab); // students arrive without an account: registering is the default
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (tab === 'register' && password.length < 8) { setError(t.passwordHint); return; }
    setBusy(true);
    if (tab === 'register') {
      // the server remembers who this verified ticket belongs to, so the confirmation link works on any device
      const { data: b, error: be } = await bindTicketEmail(ticket, email.trim());
      if (be || !b?.ok) {
        setBusy(false);
        if (b?.reason === 'ticket_invalid' || b?.reason === 'bound') { onTicketLost(b.reason === 'bound' ? 'bound' : 'ticket_invalid'); return; }
        setError(errors.generic);
        return;
      }
    }
    const res = tab === 'login'
      ? await signIn(email.trim(), password)
      : await signUp(email.trim(), password, redirectTo);
    setBusy(false);
    if (res.error) { setError(authErrorMessage(res.error)); return; }
    if (tab === 'register' && !res.data?.session) onNeedMail({ email: email.trim(), password });
    // otherwise onAuthStateChange updates the session and the page moves on by itself
  }

  return (
    <>
      {!loginOnly && <div role="tablist" className={styles.muted} style={{ display: 'flex', gap: 'var(--space-4)' }}>
        {[['register', t.tabRegister], ['login', t.tabLogin]].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={styles.linkButton}
            style={{ fontWeight: tab === k ? 700 : 400 }} onClick={() => { setTab(k); setError(''); }}>{label}</button>
        ))}
      </div>}
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField label="אימייל" type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="סיסמה" type="password" dir="ltr" required value={password}
          autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
          onChange={(e) => setPassword(e.target.value)} />
        {error && <Notice>{error}</Notice>}
        <Button type="submit" icon={tab === 'login' ? LogIn : UserPlus} loading={busy} disabled={!email || !password}>
          {tab === 'login' ? 'כניסה' : busy ? t.registering : t.register}
        </Button>
      </form>
    </>
  );
}

const ticketKey = (token) => `hevanti:ticket:${token}`;
const readTicket = (token) => { try { return window.sessionStorage.getItem(ticketKey(token)); } catch { return null; } };
const writeTicket = (token, v) => { try { if (v) window.sessionStorage.setItem(ticketKey(token), v); else window.sessionStorage.removeItem(ticketKey(token)); } catch { /* storage blocked */ } };

function PickStep({ students, busy, error, onSubmit }) {
  const [rid, setRid] = useState('');
  const [idNum, setIdNum] = useState('');
  const idBad = idNum !== '' && !isValidIsraeliId(idNum);
  if (students.length === 0) return <Notice>{t.emptyList}</Notice>;
  return (
    <form className={styles.form} noValidate onSubmit={(e) => { e.preventDefault(); onSubmit(rid, normalizeIdNumber(idNum)); }}>
      <label className={styles.muted}>
        {t.pickName}
        <select value={rid} onChange={(e) => setRid(e.target.value)} style={{ display: 'block', width: '100%', minHeight: 44 }}>
          <option value="">{t.pickPlaceholder}</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <TextField label={t.idNumber} dir="ltr" inputMode="numeric" autoComplete="off" maxLength={11} required value={idNum}
        error={idBad ? t.idInvalid : undefined} onChange={(e) => setIdNum(e.target.value)} />
      {error && <Notice>{error}</Notice>}
      <Button type="submit" loading={busy} disabled={!rid || !idNum || idBad}>{busy ? t.verifying : t.verify}</Button>
    </form>
  );
}

export default function JoinPage() {
  const { token } = useParams();
  const { session, profile, isInitializing, signOut, signIn, reloadProfile } = useAuth();
  const [info, setInfo] = useState(null); // roster_for_join(): {status, class_title, course_title, students}
  const [ticket, setTicket] = useState(() => readTicket(token));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // claim_roster() result
  const [mailSent, setMailSent] = useState(null); // {email, password} kept in memory only, to continue after confirming elsewhere
  const [preferLogin, setPreferLogin] = useState(false);
  // the confirmation link is single use: opened a second time (another device, a mail scanner) it comes back with an error
  const [linkUsed] = useState(() => /error_code=otp_expired|error=access_denied/.test(`${window.location.hash}${window.location.search}`));
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkMsg, setCheckMsg] = useState('');
  const [failed, setFailed] = useState(false);
  const [startup, setStartup] = useState(false); // signed-in student: pending join / membership checked
  const claiming = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    if (!TOKEN_FORMAT.test(token ?? '')) { setInfo({ status: 'invalid' }); return undefined; }
    rosterForJoin(token).then(({ data, error: err }) => { if (alive) { if (err) setFailed(true); else setInfo(data); } });
    return () => { alive = false; };
  }, [token]);

  const isStudent = !!session && profile?.role === 'student';

  // joining writes the student's name into the profile: reload it first, so the home screen greets by name
  const goHome = async () => { try { await reloadProfile?.(); } catch { /* the home screen loads it again */ } navigate('/student', { replace: true }); };

  // signed-in student, any device/tab: finish a join verified earlier (server-side), or notice it is already done
  useEffect(() => {
    if (!isStudent || startup || result) return undefined;
    let alive = true;
    (async () => {
      const { data, error: err } = await completePendingJoin();
      if (!alive) return;
      if (err) { setFailed(true); return; }
      if (data?.ok) { writeTicket(token, null); goHome(); return; }
      const silent = ['none', 'revoked', 'expired', 'full', 'ticket_invalid', 'taken'];
      if (data && !silent.includes(data.reason)) { setResult(data); setStartup(true); return; }
      const { data: st } = await joinStatus(token);
      if (!alive) return;
      if (st?.member) { writeTicket(token, null); goHome(); return; }
      setStartup(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudent, token]);

  async function claim(tk) {
    if (claiming.current) return;
    claiming.current = true;
    setBusy(true);
    const { data, error: err } = await claimRoster(tk);
    setBusy(false);
    claiming.current = false;
    if (err) { setFailed(true); return; }
    writeTicket(token, null);
    if (data?.ok) { goHome(); return; }
    if (data?.reason === 'ticket_invalid') setTicket(null);
    setResult(data);
  }

  // a verified ticket plus a signed-in student: join without any further step
  useEffect(() => {
    if (isStudent && startup && ticket && !result && info?.status === 'ok') claim(ticket);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudent, startup, ticket, info]);

  async function verify(rid, idNumber) {
    setBusy(true); setError('');
    const { data, error: err } = await verifyRosterEntry(token, rid, idNumber);
    setBusy(false);
    if (err) { setError(errors.generic); return; }
    if (!data?.ok) { setError(t.verifyErrors[data?.reason] ?? errors.generic); return; }
    writeTicket(token, data.ticket);
    setTicket(data.ticket);
  }

  // the account may have been confirmed on another device: signing in with what was typed finishes the join (server-side)
  async function continueAfterConfirm(silent = false) {
    if (!mailSent || checkBusy) return;
    setCheckBusy(true); setCheckMsg('');
    const res = await signIn(mailSent.email, mailSent.password);
    setCheckBusy(false);
    if (res?.error && !silent) setCheckMsg(t.notConfirmedYet);
  }
  useEffect(() => {
    if (!mailSent || session) return undefined;
    const onVisible = () => { if (document.visibilityState === 'visible') continueAfterConfirm(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailSent, session, checkBusy]);

  function toExistingAccount() { signOut(); setPreferLogin(true); setResult(null); setTicket(null); writeTicket(token, null); }

  function startOver() { writeTicket(token, null); setTicket(null); setResult(null); setError(''); }

  if (failed) return <AuthLayout title={t.title}><Notice>{errors.generic}</Notice></AuthLayout>;
  if (!info || isInitializing || (isStudent && !startup && !result)) return <AuthLayout title={t.title}><LoadingState label={t.checking} /></AuthLayout>;
  if (info.status !== 'ok') {
    return <AuthLayout title={t.title}><Notice>{t[info.status] ?? t.invalid}</Notice></AuthLayout>;
  }

  const intro = <p>{t.invite(info.class_title, info.course_title)}</p>;
  let body;
  if (result) {
    if (result.ok) {
      body = (<>
        <Notice kind="success"><Check size={16} aria-hidden="true" /> {result.status === 'already_member' ? t.alreadyMember : t.joined(info.class_title)}</Notice>
        <Link to="/student/subjects" className={styles.linkButton}>{t.toSubjects}</Link>
      </>);
    } else {
      body = (<>
        <Notice>{t.results[result.reason] ?? errors.generic}</Notice>
        {result.reason === 'id_in_use' && <button type="button" className={styles.linkButton} onClick={toExistingAccount}>{t.toExistingAccount}</button>}
        {['ticket_invalid', 'bound'].includes(result.reason) && <button type="button" className={styles.linkButton} onClick={startOver}>{t.startOver}</button>}
      </>);
    }
  } else if (session && !isStudent) {
    body = (<>
      <Notice>{t.teacherAccount}</Notice>
      <button type="button" className={styles.linkButton} onClick={() => signOut()}>{t.signOut}</button>
    </>);
  } else if (isStudent && ticket) {
    body = <LoadingState label={t.joining} />;
  } else if (linkUsed && !session && !ticket) {
    // the link was already used (e.g. on the phone): the join is finished on the server, so signing in is enough
    body = (<>
      <Notice>{t.linkUsed}</Notice>
      <AuthStep loginOnly redirectTo={`${window.location.origin}/join/${token}`} ticket={null} onNeedMail={() => {}} onTicketLost={() => {}} />
      <button type="button" className={styles.linkButton} onClick={() => { window.history.replaceState(null, '', window.location.pathname); window.location.reload(); }}>{t.startOver}</button>
    </>);
  } else if (!ticket) {
    body = (<>{intro}<PickStep students={info.students ?? []} busy={busy} error={error} onSubmit={verify} /></>);
  } else if (mailSent) {
    body = (<>
      <Notice kind="success">{t.checkEmail}</Notice>
      <Button variant="outline" loading={checkBusy} onClick={() => continueAfterConfirm(false)}>{t.confirmedContinue}</Button>
      {checkMsg && <Notice>{checkMsg}</Notice>}
    </>);
  } else {
    body = (<>
      {intro}
      <AuthStep redirectTo={`${window.location.origin}/join/${token}`} ticket={ticket} initialTab={preferLogin ? 'login' : 'register'} onNeedMail={(c) => setMailSent(c)}
        onTicketLost={(reason) => { startOver(); setResult({ ok: false, reason }); }} />
      <button type="button" className={styles.linkButton} onClick={startOver}>{t.startOver}</button>
    </>);
  }

  return <AuthLayout title={t.title}><div className={styles.form}>{body}</div></AuthLayout>;
}
