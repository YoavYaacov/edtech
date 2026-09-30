import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import AuthLayout from './AuthLayout';
import { useAuth } from './AuthProvider';
import Button from '../../components/ui/Button';
import TextField from '../../components/ui/TextField';
import { LoadingState } from '../../components/ui/States';
import { initialUrlHash } from '../../lib/supabaseClient';
import { linkErrorMessage, passwordErrorMessage } from '../../lib/authErrors';
import { auth } from '../../i18n/he';
import styles from './authForms.module.css';

const MIN_LENGTH = 8;
const linkHadError = /(^|[#&])error=/.test(initialUrlHash);
const linkErrorText = linkErrorMessage(initialUrlHash);

// Landing page for invite links and password-reset links.
// supabase-js reads the tokens from the URL and creates the session.
export default function SetPasswordPage() {
  const { session, isInitializing, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (isInitializing) return <LoadingState fullPage label={auth.checkingLink} />;

  if (!session || linkHadError) {
    return (
      <AuthLayout title={auth.setPasswordTitle}>
        <p className={`${styles.notice} ${styles.noticeError}`} role="alert">{linkErrorText ?? auth.linkInvalid}</p>
        <Link to="/login">{auth.backToLogin}</Link>
      </AuthLayout>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) return setError(auth.passwordTooShort);
    if (password !== confirm) return setError(auth.passwordsDontMatch);
    setBusy(true);
    setError('');
    const { error: err } = await updatePassword(password);
    setBusy(false);
    if (err) return setError(passwordErrorMessage(err));
    navigate('/', { replace: true });
  }

  return (
    <AuthLayout title={auth.setPasswordTitle}>
      <p className={styles.muted}>{auth.setPasswordExplain}</p>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <TextField label={auth.newPassword} type="password" dir="ltr" autoComplete="new-password"
          minLength={MIN_LENGTH} required value={password} onChange={(e) => setPassword(e.target.value)} />
        <TextField label={auth.confirmPassword} type="password" dir="ltr" autoComplete="new-password"
          required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && <p className={`${styles.notice} ${styles.noticeError}`} role="alert">{error}</p>}
        <Button type="submit" icon={KeyRound} loading={busy} disabled={!password || !confirm}>
          {busy ? auth.saving : auth.savePassword}
        </Button>
      </form>
    </AuthLayout>
  );
}
