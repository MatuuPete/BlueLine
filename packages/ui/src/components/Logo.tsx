import { cx } from '../format';
import styles from './Logo.module.css';

export interface LogoProps {
  /** Mark size in px. 28 in the top bar, 34 on the intro. */
  size?: number;
  /** Accessible name. Without it the mark is decorative. */
  label?: string;
  /** Also print the "BlueLine" wordmark next to the mark. */
  wordmark?: boolean;
  className?: string;
}

/** The mark is a tiny version of the last-10 strip: three bars around a line. */
export function Logo({ size = 28, label, wordmark = false, className }: LogoProps) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };
  const mark = (
    <svg width={size} height={size} viewBox="0 0 28 28" className={styles.mark} {...a11y}>
      <rect x="0.5" y="0.5" width="27" height="27" rx="7" className={styles.tile} />
      <rect x="6" y="6" width="3" height="8" rx="1" className={styles.bar} />
      <rect x="12.5" y="14" width="3" height="6" rx="1" className={styles.bar2} />
      <rect x="19" y="8" width="3" height="6" rx="1" className={styles.bar} />
      <rect x="4" y="13.5" width="20" height="1.2" className={styles.bar} />
    </svg>
  );
  if (!wordmark) return className ? <span className={className}>{mark}</span> : mark;
  return (
    <span className={cx(styles.lockup, className)}>
      {mark}
      <span className={styles.word} style={{ fontSize: `${Math.round(size * 0.93)}px` }}>
        BlueLine
      </span>
    </span>
  );
}
