import { useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Map as MapIcon } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useAsync } from '../../lib/useAsync';
import { fetchSubjectMap } from './studentApi';
import { buildLearningMap } from './learningMap';
import StatusBadge from './StatusBadge';
import { studentMap as m } from '../../i18n/he';
import styles from './student.module.css';

// Informational only: units open to show main topics. No sub-topics, no links (master spec §3).
export function UnitCard({ unit, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const pct = unit.topics.length ? (unit.learnedCount / unit.topics.length) * 100 : 0;
  return (
    <li className={styles.unit} data-status={unit.status} data-open={open}>
      <h2 style={{ margin: 0 }}>
        <button type="button" className={styles.unitHead} aria-expanded={open} aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}>
          <span className={styles.unitTitle}>{unit.title}</span>
          <span className={styles.unitMeta}>{m.learnedOf(unit.learnedCount, unit.topics.length)}</span>
          <StatusBadge status={unit.status} />
          <ChevronDown size={20} className={styles.unitChev} aria-hidden="true" />
        </button>
      </h2>
      {open && (
        <div id={bodyId} className={styles.unitBody}>
          {unit.topics.length === 0 ? <p className={styles.muted}>{m.emptyMapBody}</p> : (
            <>
              <div className={styles.progressTrack} aria-hidden="true"><span className={styles.progressFill} style={{ width: `${pct}%`, display: 'block' }} /></div>
              <ul className={styles.topicList}>
                {unit.topics.map((t) => (
                  <li key={t.id} className={styles.topic} data-status={t.status}>
                    <span className={styles.dot} aria-hidden="true" />
                    <span className={styles.topicName}>{t.title}</span>
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export default function SubjectMapPage() {
  const { courseId } = useParams();
  const q = useAsync(() => fetchSubjectMap(courseId), [courseId]);
  const units = q.status === 'ready' && q.data ? buildLearningMap(q.data.topics, q.data.statuses) : [];
  return (
    <>
      <Link to="/student/subjects" className={styles.back}><ChevronRight size={18} aria-hidden="true" />{m.back}</Link>
      {q.status === 'loading' && <LoadingState />}
      {q.status === 'error' && <ErrorState message={m.loadError} onRetry={q.reload} />}
      {q.status === 'ready' && !q.data && <EmptyState icon={MapIcon} tone="peach" title={m.notFoundTitle} body={m.notFoundBody} />}
      {q.status === 'ready' && q.data && (
        <>
          <PageHeader title={q.data.course.title} subtitle={m.mapExplain} />
          {units.length === 0 ? (
            <EmptyState icon={MapIcon} tone="sky" title={m.emptyMapTitle} body={m.emptyMapBody} />
          ) : (
            <ul className={styles.units}>
              {units.map((u, i) => <UnitCard key={u.id} unit={u} defaultOpen={units.length === 1 || u.status === 'learning' || (i === 0 && !units.some((x) => x.status === 'learning'))} />)}
            </ul>
          )}
          <p className={styles.note}>{q.data.hasClass ? m.statusNote : m.noClassNote}</p>
        </>
      )}
    </>
  );
}
