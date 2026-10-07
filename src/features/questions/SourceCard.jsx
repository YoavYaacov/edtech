import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import Collapsible from '../../components/ui/Collapsible';
import { useAsync } from '../../lib/useAsync';
import { formatDate, imports as it, provenance as t } from '../../i18n/he';
import { fetchProvenance } from '../imports/importsApi';
import styles from './questions.module.css';

// Read-only "where did this question come from" card, shown ONLY for a question that was created by approving an
// imported proposal (a row exists in question_provenance). It never edits anything and never blocks the editor.
export default function SourceCard({ questionId }) {
  const q = useAsync(() => fetchProvenance(questionId), [questionId]);
  const p = q.data;
  if (q.status !== 'ready' || !p) return null;
  return (
    <section className={styles.panel} aria-labelledby="sec-source">
      <h2 id="sec-source" className={styles.panelTitle}><FileText size={18} aria-hidden="true" />{t.title}</h2>
      <p className={styles.muted}>{t.explain}</p>
      <ul className={styles.sourceList}>
        <li dir="auto">{t.file(p.file_name)}</li>
        <li>{t.pages(p.source_pages)}{p.source_label ? ` · ${t.label(p.source_label)}` : ''}</li>
        <li>{t.model(p.model, p.prompt_version)}</li>
        <li><Badge tone={p.teacher_edited ? 'lavender' : 'mint'}>{p.teacher_edited ? t.edited : t.notEdited}</Badge> {t.approvedAt(formatDate(p.approved_at))}</li>
        {(p.flags ?? []).length > 0 && (
          <li>{t.flags}: {(p.flags ?? []).map((f) => <Badge key={f.kind} tone={f.severity === 'material' ? 'butter' : 'neutral'}>{it.flags[f.kind] ?? f.kind}</Badge>)}</li>
        )}
      </ul>
      <Collapsible title={t.showText} defaultOpen={false} headingLevel={3} storageKey={`provenance-${questionId}`}>
        <pre className={styles.sourceText} dir="auto">{p.source_text}</pre>
      </Collapsible>
      <Link to={`/teacher/questions/import/${p.import_id}`} className={styles.muted}>{t.openImport}</Link>
    </section>
  );
}
