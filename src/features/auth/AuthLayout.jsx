import Logo from '../../components/brand/Logo';
import doodlesUrl from '../../assets/brand/hevanti-login-doodles.svg';
import styles from './AuthLayout.module.css';

export default function AuthLayout({ title, children }) {
  return (
    <main className={styles.page}>
      <section className={styles.brandPanel}>
        {/* Decorative hand-drawn sketches (math + CS) scattered around the centred logo. */}
        <img className={styles.doodles} src={doodlesUrl} alt="" aria-hidden="true" draggable="false" />
        <Logo variant="full" size="lg" />
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
