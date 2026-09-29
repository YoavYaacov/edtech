import Logo from '../../components/brand/Logo';
import ListMotif from '../../components/brand/ListMotif';
import styles from './AuthLayout.module.css';

export default function AuthLayout({ title, children }) {
  return (
    <main className={styles.page}>
      <section className={styles.brandPanel}>
        <Logo variant="full" size="lg" />
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
