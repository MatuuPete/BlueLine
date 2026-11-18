import type { ReactNode } from 'react';
import { cx } from '../format';
import rowStyles from './PropRowView.module.css';
import styles from './PropTable.module.css';

export interface PropTableProps {
  /** Accessible table name, e.g. "NBA player props matching your filters". */
  label: string;
  /** PropRowView rows. */
  children?: ReactNode;
  /** Shown under the header when there are no rows (an EmptyState). */
  empty?: ReactNode;
  className?: string;
}

const HEADERS: Array<{
  text: string;
  sr?: boolean;
  align?: 'center' | 'right';
  edge?: 'first' | 'last';
}> = [
  { text: 'Favorite', sr: true, edge: 'first' },
  { text: 'Player' },
  { text: 'Prop' },
  { text: 'Best price' },
  { text: 'Last 10 vs line' },
  { text: 'L5', align: 'center' },
  { text: 'L10', align: 'center' },
  { text: 'L20', align: 'center' },
  { text: 'Season', align: 'center' },
  { text: 'H2H', align: 'center' },
  { text: 'Edge', align: 'right' },
  { text: 'Opp. defense' },
  { text: 'Add to slip', sr: true, edge: 'last' },
];

/** The board's 13-column ARIA table; scrolls sideways inside its own box. */
export function PropTable({ label, children, empty, className }: PropTableProps) {
  return (
    <div className={cx(styles.box, className)}>
      <div role="table" aria-label={label} className={styles.table}>
        <div role="rowgroup">
          <div role="row" className={cx(rowStyles.grid, styles.head)}>
            {HEADERS.map((h) => (
              <div
                key={h.text}
                role="columnheader"
                className={cx(
                  styles.th,
                  h.align === 'center' && styles.center,
                  h.align === 'right' && styles.right,
                  h.edge === 'first' && styles.first,
                  h.edge === 'last' && styles.last,
                )}
              >
                {h.sr ? <span className={styles.sr}>{h.text}</span> : h.text}
              </div>
            ))}
          </div>
        </div>
        <div role="rowgroup">{children}</div>
      </div>
      {empty}
    </div>
  );
}
