import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/ui/States';
import { notFound } from '../i18n/he';

export default function NotFoundPage() {
  return (
    <main style={{ maxWidth: 560, margin: '10vh auto', padding: 16 }}>
      <EmptyState icon={Compass} tone="peach" title={notFound.title} body={notFound.body}
        action={<Link to="/">{notFound.home}</Link>} />
    </main>
  );
}
