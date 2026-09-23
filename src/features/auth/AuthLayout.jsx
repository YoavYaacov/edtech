import Logo from '../../components/brand/Logo';
import ListMotif from '../../components/brand/ListMotif';
import { app } from '../../i18n/he';
import styles from './AuthLayout.module.css';

export default function AuthLayout({ title, children }) {
  return (
    <main className={styles.page}>
      <section className={styles.brandPanel}>
        <Logo size="lg" />
        <p className={styles.tagline}>{app.tagline}</p>
        <ListMotif />
      </section>
      <section className={styles.formPanel}>
        <div className={styles.card}>
          <h1 className={styles.title}>{title}</h1>
          {children}
        </div>
      </section>
    </main>
  );
}
