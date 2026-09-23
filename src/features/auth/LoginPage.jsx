import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { LogIn, Mail } from 'lucide-react';
import AuthLayout from './AuthLayout';
import { useAuth } from './AuthProvider';
import Button from '../../components/ui/Button';
import TextField from '../../components/ui/TextField';
import { LoadingState } from '../../components/ui/States';
import { authErrorMessage } from '../../lib/authErrors';
import { auth, errors } from '../../i18n/he';
import styles from './authForms.module.css';

export default function LoginPage() {
  const { session, isInitializing, signIn, sendPasswordReset } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState('login'); // login | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  if (isInitializing) return <LoadingState fullPage />;
  if (session) return <Navigate to={location.state?.from ?? '/'} replace />;

  async function handleLogin(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await signIn(email.trim(), password);
    setBusy(false);
    if (err) setError(authErrorMessage(err));
    // on success, onAuthStateChange updates the session and we redirect
  }

  async function handleReset(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await sendPasswordReset(email.trim());
    setBusy(false);
    // Same message whether or not the email exists (no account enumeration),
    // except for rate limiting / network problems.
    if (err) {
      const msg = authErrorMessage(err);
      if (msg === errors.rateLimited || msg === errors.network) {
        setError(msg);
        return;
      }
    }
    setResetSent(true);
  }

  function switchMode(next) {
    setMode(next);
    setError('');
    setResetSent(false);
  }

  if (mode === 'reset') {
    return (
      <AuthLayout title={auth.resetTitle}>
        <p className={styles.muted}>{auth.resetExplain}</p>
        {resetSent ? (
          <p className={`${styles.notice} ${styles.noticeSuccess}`} role="status">{auth.resetSent}</p>
        ) : (
          <form className={styles.form} onSubmit={handleReset} noValidate>
            <TextField label={auth.email} type="email" dir="ltr" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)} />
            {error && <p className={`${styles.notice} ${styles.noticeError}`} role="alert">{error}</p>}
            <Button type="submit" icon={Mail} loading={busy} disabled={!email}>
              {busy ? auth.sending : auth.sendResetLink}
            </Button>
          </form>
        )}
        <button type="button" className={styles.linkButton} onClick={() => switchMode('login')}>
          {auth.backToLogin}
        </button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={auth.loginTitle}>
      <form className={styles.form} onSubmit={handleLogin} noValidate>
        <TextField label={auth.email} type="email" dir="ltr" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label={auth.password} type="password" dir="ltr" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className={`${styles.notice} ${styles.noticeError}`} role="alert">{error}</p>}
        <Button type="submit" icon={LogIn} loading={busy} disabled={!email || !password}>
          {busy ? auth.signingIn : auth.signIn}
        </Button>
      </form>
      <button type="button" className={styles.linkButton} onClick={() => switchMode('reset')}>
        {auth.forgotPassword}
      </button>
      <p className={styles.muted}>{auth.noSignupNote}</p>
    </AuthLayout>
  );
}
