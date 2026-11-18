import { cx } from '../format';
import styles from './HeatCell.module.css';

export interface HeatCellProps {
  hits: number;
  /** Sample size. 0 prints a dash. */
  n: number;
  /** Window label printed above the number (phone cards, detail tiles). */
  label?: string;
  /** The board's active window gets a 2px navy inset ring. */
  active?: boolean;
  /** `md`: board/card cell. `lg`: the prop detail hit-rate tile. */
  size?: 'md' | 'lg';
  className?: string;
}

export type HeatBucket = 0 | 1 | 2 | 3 | 4;

/** Heat scale steps (spec §7): <40, 40–54, 55–69, 70–84, 85+. */
export function heatBucket(percent: number): HeatBucket {
  if (percent >= 85) return 4;
  if (percent >= 70) return 3;
  if (percent >= 55) return 2;
  if (percent >= 40) return 1;
  return 0;
}

/** A hit-rate cell. The number and the fraction are always printed; color is never alone. */
export function HeatCell({
  hits,
  n,
  label,
  active = false,
  size = 'md',
  className,
}: HeatCellProps) {
  const percent = n > 0 ? Math.round((hits / n) * 100) : null;
  const bucket = percent === null ? null : heatBucket(percent);
  const fraction = size === 'lg' ? (n > 0 ? `${hits} of ${n}` : 'No games') : `${hits}/${n}`;

  return (
    <div
      className={cx(styles.cell, styles[size], styles[`b${bucket ?? 0}`], className)}
      data-bucket={bucket === null ? 'none' : String(bucket)}
      data-active={active ? 'true' : undefined}
    >
      {label ? <span className={styles.label}>{label}</span> : null}
      <span className={styles.pct}>{percent === null ? '—' : `${percent}%`}</span>
      <span className={styles.frac}>{fraction}</span>
    </div>
  );
}
