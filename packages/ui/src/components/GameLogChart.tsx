import type { ReactNode } from 'react';
import type { Side } from '@blueline/contracts';
import { cx, formatLine } from '../format';
import styles from './GameLogChart.module.css';

export interface GameLogEntryView {
  value: number;
  /** Bold x-axis label, e.g. "vs NYK". */
  label: string;
  /** Muted x-axis label, e.g. "Nov 16 · 36m". */
  sublabel: string;
  /** Game against tonight's opponent: gets the navy ring. */
  isH2h: boolean;
}

export interface GameLogChartProps {
  /** Oldest game first. */
  entries: GameLogEntryView[];
  line: number;
  side: Side;
  /** Stat name for the accessible description, e.g. "points". */
  statLabel?: string;
  /** Legend text for ringed games, e.g. "vs New York". */
  h2hLabel?: string;
  /** Shown over the empty chart, e.g. a "Clear splits" button. */
  emptyAction?: ReactNode;
  className?: string;
}

type Result = 'hit' | 'miss' | 'push';

/** Plot height and the share bars may use (canvas: 260px box, 230px of bar). */
const PLOT = 260;
const BAR_MAX = 230;

function grade(value: number, line: number, side: Side): Result {
  if (value === line) return 'push';
  return (side === 'over' ? value > line : value < line) ? 'hit' : 'miss';
}

/**
 * The prop detail game log: one bar per game, the line drawn across as a navy rule
 * labelled with the number. Bars ease height on split changes (250ms).
 */
export function GameLogChart({
  entries,
  line,
  side,
  statLabel = 'results',
  h2hLabel = 'Head-to-head',
  emptyAction,
  className,
}: GameLogChartProps) {
  const results = entries.map((e) => grade(e.value, line, side));
  const hits = results.filter((r) => r === 'hit').length;
  const pushes = results.filter((r) => r === 'push').length;
  const decided = entries.length - pushes;
  const top = Math.max(line, ...entries.map((e) => e.value)) * 1.15 || 1;
  const lineY = Math.round((line / top) * BAR_MAX);
  const lineText = formatLine(line);
  const pushText = pushes ? `, ${pushes} ${pushes === 1 ? 'push' : 'pushes'}` : '';
  const description =
    `Bar chart of ${statLabel} in ${entries.length} ${entries.length === 1 ? 'game' : 'games'} ` +
    `against a line of ${lineText}. ${hits} of ${decided} cleared it${pushText}.`;

  return (
    <div className={cx(styles.root, className)}>
      <div className={styles.frame}>
        <div role="img" aria-label={description} className={styles.chart}>
          <div aria-hidden="true" className={styles.axis}>
            <span>{Math.round((top / BAR_MAX) * PLOT)}</span>
            <span>{Math.round((top / BAR_MAX) * (PLOT / 2))}</span>
            <span>0</span>
          </div>
          <div className={styles.plot}>
            <span aria-hidden="true" className={styles.grid} style={{ top: 0 }} />
            <span aria-hidden="true" className={styles.grid} style={{ top: `${PLOT / 2}px` }} />
            {entries.map((entry, i) => {
              const result = results[i]!;
              const height = Math.max(3, Math.round((entry.value / top) * BAR_MAX));
              return (
                <div key={i} className={styles.col}>
                  <span className={cx(styles.value, result === 'hit' && styles.valueHit)}>
                    {entry.value}
                  </span>
                  <span
                    className={cx(styles.bar, styles[result])}
                    data-result={result}
                    data-h2h={entry.isH2h ? 'true' : undefined}
                    style={{ height: `${height}px` }}
                  />
                </div>
              );
            })}
            <div aria-hidden="true" className={styles.line} style={{ bottom: `${lineY}px` }}>
              <span className={styles.lineLabel}>{lineText}</span>
            </div>
          </div>
          <div aria-hidden="true" className={styles.xlabels}>
            {entries.map((entry, i) => (
              <span key={i} className={styles.xlabel}>
                <span className={styles.xmain}>{entry.label}</span>
                <span>{entry.sublabel}</span>
              </span>
            ))}
          </div>
        </div>
        {entries.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>No games match these splits</p>
            {emptyAction}
          </div>
        ) : null}
      </div>

      <ul className={styles.legend}>
        <li>
          <span aria-hidden="true" className={cx(styles.swatch, styles.hit)} />
          Cleared the line
        </li>
        <li>
          <span aria-hidden="true" className={cx(styles.swatch, styles.miss)} />
          Missed
        </li>
        <li>
          <span aria-hidden="true" className={cx(styles.swatch, styles.push)} />
          Push
        </li>
        {entries.some((e) => e.isH2h) ? (
          <li>
            <span aria-hidden="true" className={cx(styles.swatch, styles.h2hSwatch)} />
            {h2hLabel}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
