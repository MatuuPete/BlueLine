import type { ReactNode } from 'react';
import { cx } from '../format';
import styles from './Badge.module.css';

export interface BadgeProps {
  /** out: injury Out. questionable: Questionable / GTD. book: sportsbook text badge. */
  tone: 'out' | 'questionable' | 'book';
  /** Defaults to "Out" / "Questionable". Books always pass their name. */
  children?: ReactNode;
  /** Full text for abbreviated badges ("Q" → "Questionable"). */
  title?: string;
  className?: string;
}

const DEFAULT_TEXT = { out: 'Out', questionable: 'Questionable', book: null } as const;

export function Badge({ tone, children, title, className }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], className)} data-tone={tone} title={title}>
      {children ?? DEFAULT_TEXT[tone]}
    </span>
  );
}
