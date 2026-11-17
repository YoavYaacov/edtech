import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, MessageSquare } from 'lucide-react';
import Button from '../../components/ui/Button';
import { showToast } from '../../components/ui/Toast';
import { copyText } from '../content/topicsExport';
import { useAsync } from '../../lib/useAsync';
import RosterPanel from './RosterPanel';
import { createJoinLink, fetchActiveJoinLink, joinUrl, revokeJoinLink } from './classesApi';
import { errors, formatDate, joinLink as t } from '../../i18n/he';
import styles from '../content/content.module.css';

// Join link controls of ONE class (teacher). The token is shown only here, to the class owner (RLS), and every
// action is re-checked in the database.
export default function JoinLinkPanel({ classId }) {
  const link = useAsync(() => fetchActiveJoinLink(classId), [classId]);
  const [days, setDays] = useState(14);
  const [max, setMax] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(fn, after) {
    setBusy(true); setError('');
    const { error: err } = await fn();
    setBusy(false);
    if (err) { setError(errors.generic); return; }
    await after?.();
  }

  const active = link.data;
  const expired = active && new Date(active.expires_at) <= new Date();
  const daysNum = Number(days);
  const maxNum = max === '' ? null : Number(max);
  const valid = Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 90 && (maxNum === null || (Number.isInteger(maxNum) && maxNum >= 1 && maxNum <= 1000));

  async function copy() {
    const ok = await copyText(joinUrl(active.token));
    showToast(ok === false ? errors.generic : t.copied, { kind: ok === false ? 'error' : 'success' });
  }

  return (
    <div className={styles.classCard} data-testid={`joinlink-${classId}`}>
      <div className={styles.classHead}>
        <strong>{t.title}</strong>
        <Link to={`/teacher/classes/${classId}`} className={styles.muted}><MessageSquare size={14} aria-hidden="true" /> {t.board}</Link>
      </div>
      {error && <p className={styles.errorNote} role="alert">{error}</p>}
      {active ? (
        <>
          <input className={styles.inlineInput} readOnly dir="ltr" value={joinUrl(active.token)} aria-label={t.title}
            onFocus={(e) => e.target.select()} />
          <p className={styles.muted}>
            {expired ? 'פג תוקף' : t.expiresOn(formatDate(active.expires_at))} · {t.usage(active.uses, active.max_uses)}
          </p>
          <div className={styles.classHead}>
            <Button variant="secondary" icon={Copy} onClick={copy} disabled={expired}>{t.copy}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => run(() => revokeJoinLink(classId), link.reload)}>{t.revoke}</Button>
          </div>
        </>
      ) : <p className={styles.muted}>{t.none}</p>}

      <div className={styles.classHead}>
        <label className={styles.muted}>{t.expiry}{' '}
          <input className={styles.inlineInput} style={{ width: 70 }} type="number" min={1} max={90} value={days}
            onChange={(e) => setDays(e.target.value)} />
        </label>
        <label className={styles.muted}>{t.maxUses}{' '}
          <input className={styles.inlineInput} style={{ width: 90 }} type="number" min={1} max={1000} value={max}
            onChange={(e) => setMax(e.target.value)} />
        </label>
        <Button variant="secondary" loading={busy} disabled={!valid}
          onClick={() => run(() => createJoinLink(classId, daysNum, maxNum), link.reload)}>
          {active ? t.renew : t.create}
        </Button>
      </div>
      {active && <p className={styles.muted}>{t.renewNote}</p>}

      <RosterPanel classId={classId} />
      <p className={styles.muted}>{t.privacyNote}</p>
    </div>
  );
}
