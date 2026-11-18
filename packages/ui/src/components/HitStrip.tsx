import type { Side } from '@blueline/contracts';
import { cx } from '../format';
import styles from './HitStrip.module.css';

export interface HitStripProps {
  /** Stat values, oldest game first. */
  values: number[];
  line: number;
  side: Side;
  size?: 'sm' | 'lg';
  /** Prefix for the accessible label, usually the player name. */
  label?: string;
  className?: string;
}

/** Bar length range in px (min stub, extra span for the largest margin). */
const SCALE = { sm: { min: 4, span: 13 }, lg: { min: 6, span: 28 } } as const;

type Result = 'hit' | 'miss' | 'push';

function grade(value: number, line: number, side: Side): Result {
  if (value === line) return 'push';
  return (side === 'over' ? value > line : value < line) ? 'hit' : 'miss';
}

export function stripLabel(values: number[], line: number, side: Side, prefix?: string): string {
  const results = values.map((v) => grade(v, line, side));
  const hits = results.filter((r) => r === 'hit').length;
  const pushes = results.filter((r) => r === 'push').length;
  const games = values.length === 1 ? 'game' : 'games';
  const pushText = pushes ? `, ${pushes} ${pushes === 1 ? 'push' : 'pushes'}` : '';
  const body = `cleared the line in ${hits} of the last ${values.length} ${games}${pushText}`;
  return prefix ? `${prefix}: ${body}` : body;
}

/**
 * The signature "last-10 strip": bars rise (Duke Blue, cleared) or drop (slate, missed)
 * from a hairline at the prop's line. Oldest game on the left; bar length is the margin.
 */
export function HitStrip({ values, line, side, size = 'sm', label, className }: HitStripProps) {
  const margins = values.map((v) => (side === 'over' ? v - line : line - v));
  const maxAbs = Math.max(0, ...margins.map(Math.abs)) || 1;
  const { min, span } = SCALE[size];

  return (
    <div
      role="img"
      aria-label={stripLabel(values, line, side, label)}
      className={cx(styles.strip, styles[size], className)}
    >
      <span aria-hidden="true" className={styles.rule} />
      {values.map((value, i) => {
        const result = grade(value, line, side);
        const height = min + Math.round((Math.abs(margins[i]!) / maxAbs) * span);
        const bar = (
          <span
            className={cx(styles.bar, styles[result])}
            data-hit={result === 'hit' ? 'true' : 'false'}
            data-push={result === 'push' ? 'true' : undefined}
            style={{ height: `${height}px` }}
          />
        );
        return (
          <span key={i} className={styles.game}>
            <span className={styles.up}>{result === 'hit' ? bar : null}</span>
            <span className={styles.down}>{result === 'hit' ? null : bar}</span>
          </span>
        );
      })}
    </div>
  );
}
