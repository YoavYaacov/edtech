import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MonitorPlay } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import UploadPanel from './UploadPanel';
import { fetchLessons, fetchUploadContext } from './lessonsApi';
import { useAsync } from '../../lib/useAsync';
import { lessons as t } from '../../i18n/he';
import styles from './lessons.module.css';

export default function LessonsPage() {
  const list = useAsync(fetchLessons, []);
  const ctx = useAsync(fetchUploadContext, []);
  const [showArchived, setShowArchived] = useState(false);
  const loading = list.status === 'loading' || ctx.status === 'loading';
  const failed = list.status === 'error' || ctx.status === 'error';
  const all = list.data ?? [];
  const shown = all.filter((l) => showArchived || !l.is_archived);

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      {loading && <LoadingState />}
      {failed && <ErrorState message={t.loadError} onRetry={() => { list.reload(); ctx.reload(); }} />}
      {!loading && !failed && (
        <>
          <UploadPanel courses={ctx.data} lessons={all} onSaved={list.reload} />
          {all.some((l) => l.is_archived) && (
            <label className={styles.check}><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> {t.showArchived}</label>
          )}
          {shown.length === 0 ? <EmptyState icon={MonitorPlay} title={t.empty} body={t.emptyBody} /> : (
            <ul className={styles.list}>
              {shown.map((l) => (
                <li key={l.id} className={styles.card}>
                  <div className={styles.cardRow}>
                    <div className={styles.grow}>
                      <Link to={`/teacher/lessons/${l.id}`} className={styles.name}>{l.title}</Link>
                      <div className={styles.meta}>{l.course?.title} · {t.versions(l.versions.length)} · {l.topics.length === 0 ? t.noTopics : `${l.topics.length} ${t.topicsLabel}`}</div>
                    </div>
                    {l.is_archived ? <Badge tone="neutral">{t.statusArchived}</Badge>
                      : l.published_version_id ? <Badge tone="mint">{t.statusPublished}</Badge> : <Badge tone="butter">{t.statusDraft}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
