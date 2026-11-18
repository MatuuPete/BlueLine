import type { ReactNode } from 'react';
import { cx } from '../format';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  title: string;
  /** What to change, e.g. "Lower the hit-rate floor or widen the price range." */
  hint: string;
  /** Usually a Button, e.g. "Reset filters". */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, hint, action, className }: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, className)}>
      <p className={styles.title}>{title}</p>
      <p className={styles.hint}>{hint}</p>
      {action}
    </div>
  );
}
