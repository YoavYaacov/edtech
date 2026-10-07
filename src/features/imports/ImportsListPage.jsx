import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, FileUp, Plus } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useAsync } from '../../lib/useAsync';
import { formatDateTime, imports as t } from '../../i18n/he';
import { archiveImport, countCandidates, fetchImports } from './importsApi';
import qStyles from '../questions/questions.module.css';
import styles from './imports.module.css';

export default function ImportsListPage() {
  const navigate = useNavigate();
  const q = useAsync(() => fetchImports(), []);
  const [toArchive, setToArchive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function doArchive() {
    setBusy(true);
    const { error } = await archiveImport(toArchive.id);
    setBusy(false);
    if (error) { setMessage(t.archiveFailed); setToArchive(null); return; }
    setToArchive(null); setMessage(''); q.reload();
  }

  const list = q.data ?? [];
  return (
    <>
      <Link to="/teacher/questions" className={qStyles.backLink}><ArrowRight size={16} aria-hidden="true" />{t.backToBank}</Link>
      <PageHeader title={t.title} subtitle={t.subtitle}
        actions={<Link to="/teacher/questions/import/new" className={qStyles.linkButton}><Plus size={18} aria-hidden="true" />{t.newImport}</Link>} />
      {message && <p className={styles.errorLine} role="alert">{message}</p>}
      {q.status === 'loading' && <LoadingState />}
      {q.status === 'error' && <ErrorState message={t.loadFailed} onRetry={q.reload} />}
      {q.status === 'ready' && list.length === 0 && (
        <EmptyState icon={FileUp} tone="sky" title={t.emptyTitle} body={t.emptyBody}
          action={<Link to="/teacher/questions/import/new" className={qStyles.linkButton}>{t.newImport}</Link>} />
      )}
      {q.status === 'ready' && list.length > 0 && (
        <ul className={styles.list}>
          {list.map((imp) => {
            const c = countCandidates(imp.import_candidates);
            const file = imp.import_files?.[0];
            return (
              <li key={imp.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <Link to={`/teacher/questions/import/${imp.id}`} className={styles.rowTitle}>
                    {imp.source_name || file?.original_name || t.statuses[imp.status]}
                  </Link>
                  <div className={styles.rowMeta}>
                    <Badge tone={t.statusTones[imp.status] ?? 'neutral'}>{t.statuses[imp.status] ?? imp.status}</Badge>
                    {imp.courses?.title && <span>{imp.courses.title}</span>}
                    {file && <span>{t.pagesOf(file.page_count)}</span>}
                    <span>{formatDateTime(imp.created_at)}</span>
                  </div>
                  <div className={styles.rowSub}>{c.total > 0 ? t.counts(c.total, c.pending, c.approved) : t.noCandidates}</div>
                </div>
                <div className={styles.rowActions}>
                  <Button variant="secondary" onClick={() => navigate(`/teacher/questions/import/${imp.id}`)}>{t.open}</Button>
                  <Button variant="ghost" onClick={() => setToArchive(imp)}>{t.archive}</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog open={Boolean(toArchive)} title={t.archiveTitle} body={t.archiveBody} confirmLabel={t.archive}
        onConfirm={doArchive} onCancel={() => setToArchive(null)} busy={busy} />
    </>
  );
}
