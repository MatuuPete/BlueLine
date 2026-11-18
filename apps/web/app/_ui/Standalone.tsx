import { Disclaimer, Logo } from '@blueline/ui';
import type { ReactNode } from 'react';
import styles from './Standalone.module.css';

/** A page outside the app shell (sign-in, offline): navy band, one card, the disclaimer. */
export function Standalone({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.band}>
        <a href="/welcome" className={styles.home} aria-label="BlueLine intro">
          <Logo size={28} wordmark />
        </a>
      </header>
      <main className={styles.main}>
        <div className={styles.card}>
          <h1 className={styles.title}>{title}</h1>
          {children}
        </div>
        <Disclaimer className={styles.disclaimer} />
      </main>
    </div>
  );
}
