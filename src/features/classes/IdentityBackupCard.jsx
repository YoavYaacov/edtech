import { useState } from 'react';
import Button from '../../components/ui/Button';
import { useAsync } from '../../lib/useAsync';
import { identityBackupExport, identityBackupImport, identityBackupStatus } from './classesApi';
import { identityBackup as t } from '../../i18n/he';
import styles from '../content/content.module.css';

const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);

// Backup of the encrypted student IDs of this system. Shown only to the system owner (the TeacherApp owner teacher).
// The file holds ciphertext + a signature only: no plain IDs and no names. Restore matches by stable ids only.
export default function IdentityBackupCard() {
  const q = useAsync(async () => {
    const { data, error } = await identityBackupStatus();
    return { data: error || !data?.ok ? null : data, error: null };
  }, []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [pkg, setPkg] = useState(null);
  const [extra, setExtra] = useState(null);
  const st = extra ?? q.data;
  if (!st) return null;
  const age = daysSince(st.last_export_at);

  async function exportPkg() {
    setBusy(true); setMsg('');
    const { data, error } = await identityBackupExport();
    setBusy(false);
    if (error || !data?.ok) { setMsg(t.failed); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data.package)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `hevanti-identity-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg(t.exported);
    const s = await identityBackupStatus();
    if (s.data?.ok) setExtra(s.data);
  }
  async function pick(file) {
    if (!file) return;
    setMsg(''); setPkg(null);
    try {
      const data = JSON.parse(await file.text());
      const { data: r, error } = await identityBackupImport(data, false);
      if (error || !r?.ok) { setMsg(t.reasons[r?.reason] ?? t.failed); return; }
      setPkg({ data, check: r });
    } catch { setMsg(t.unreadable); }
  }
  async function restore() {
    setBusy(true);
    const { data: r, error } = await identityBackupImport(pkg.data, true);
    setBusy(false);
    if (error || !r?.ok) { setMsg(t.reasons[r?.reason] ?? t.failed); return; }
    setMsg(t.restored(r.restored)); setPkg(null);
  }

  return (
    <section data-testid="identity-backup" aria-label={t.title}>
      <h3>{t.title}</h3>
      <p className={styles.muted}>{t.status(st.total, age)}{st.readable < st.total ? ` ${t.unreadable2(st.total - st.readable)}` : ''}</p>
      {(age === null || age > 30) && st.total > 0 && <p className={styles.muted} role="status">{t.remind}</p>}
      <div className={styles.classHead}>
        <Button variant="outline" loading={busy} onClick={exportPkg}>{t.export}</Button>
        <label className={styles.linkBtn}>
          {t.restore}
          <input type="file" accept=".json" hidden aria-label={t.restore} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
      {pkg && (
        <p role="status">
          {t.preview(pkg.check.restored, pkg.check.same, pkg.check.no_target, pkg.check.conflict)}{' '}
          <Button variant="outline" disabled={busy || !pkg.check.restored} onClick={restore}>{t.confirm}</Button>
        </p>
      )}
      {msg && <p className={styles.muted} role="status">{msg}</p>}
    </section>
  );
}
