import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Trash2, Users } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import InviteStudentForm from './InviteStudentForm';
import DeleteStudentDialog from './DeleteStudentDialog';
import { fetchMyStudents, fetchStudentAuthStatus, setStudentArchived } from './studentsApi';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { common, errors, formatDate, students as t } from '../../i18n/he';
import styles from './students.module.css';

export default function StudentsPage() {
  const { user } = useAuth();
  const { status, data, reload } = useAsync(() => fetchMyStudents(user.id), [user.id]);
  // Invite status is a nice-to-have: a failure here never blocks the list.
  const authStatus = useAsync(() => fetchStudentAuthStatus(), []);
  const [showArchived, setShowArchived] = useState(false);
  const [toArchive, setToArchive] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ kind: '', text: '' });

  const inviteBy = useMemo(() => new Map((authStatus.data ?? []).map((r) => [r.student_id, r.invite_status])), [authStatus.data]);
  const rows = data ?? [];
  const visible = rows.filter((r) => showArchived || r.status === 'active');
  const hasArchived = rows.some((r) => r.status === 'archived');

  async function setArchived(row, archived) {
    setBusy(true);
    setNotice({ kind: '', text: '' });
    const { error } = await setStudentArchived(user.id, row.student.id, archived);
    setBusy(false);
    setToArchive(null);
    if (error) return setNotice({ kind: 'error', text: t.archiveError });
    setNotice({ kind: 'success', text: archived ? t.archived(row.student.full_name) : t.restored(row.student.full_name) });
    reload();
  }

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <InviteStudentForm onInvited={() => { reload(); authStatus.reload(); }} />

      {notice.text && (
        <p className={notice.kind === 'error' ? styles.error : styles.success} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>
      )}

      <div className={styles.listArea}>
        {status === 'loading' && <LoadingState />}
        {status === 'error' && <ErrorState message={errors.generic} onRetry={reload} />}
        {status === 'ready' && rows.length === 0 && (
          <EmptyState icon={Users} tone="sky" title={t.emptyTitle} body={t.emptyBody} />
        )}
        {status === 'ready' && visible.length > 0 && (
          <ul className={styles.list}>
            {visible.map((row) => {
              const archived = row.status === 'archived';
              const invite = inviteBy.get(row.student.id);
              return (
                <li key={row.student.id} className={`${styles.row} ${archived ? styles.rowArchived : ''}`}>
                  <span className={styles.avatar} aria-hidden="true">
                    {row.student.full_name?.trim()?.[0] ?? '?'}
                  </span>
                  <div className={styles.rowText}>
                    <span className={styles.name}>{row.student.full_name}</span>
                    <span className={styles.muted}>{common.since} {formatDate(row.created_at)}</span>
                  </div>
                  {!archived && (invite === 'pending' || invite === 'no_password') && (
                    <Badge tone="butter">{t.authStatus[invite]}</Badge>
                  )}
                  <span className={`${styles.badge} ${styles[row.status]}`}>{t.status[row.status]}</span>
                  <span className={styles.rowActions}>
                    {archived ? (
                      <>
                        <Button variant="ghost" icon={ArchiveRestore} disabled={busy}
                          onClick={() => setArchived(row, false)}>{t.restoreAction}</Button>
                        <Button variant="dangerGhost" icon={Trash2} disabled={busy}
                          onClick={() => setToDelete(row.student)}>{t.deleteAction}</Button>
                      </>
                    ) : (
                      <Button variant="ghost" icon={Archive} disabled={busy}
                        onClick={() => setToArchive(row)}>{t.archiveAction}</Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {status === 'ready' && hasArchived && (
          <label className={styles.toggle}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            {t.showArchived}
          </label>
        )}
      </div>

      <ConfirmDialog open={Boolean(toArchive)} title={toArchive ? t.archiveTitle(toArchive.student.full_name) : ''}
        body={t.archiveBody} confirmLabel={common.archive} busy={busy}
        onConfirm={() => setArchived(toArchive, true)} onCancel={() => setToArchive(null)} />
      {toDelete && (
        <DeleteStudentDialog student={toDelete} onClose={() => setToDelete(null)}
          onDeleted={(name) => { setToDelete(null); setNotice({ kind: 'success', text: t.delete.deleted(name) }); reload(); authStatus.reload(); }} />
      )}
    </>
  );
}
