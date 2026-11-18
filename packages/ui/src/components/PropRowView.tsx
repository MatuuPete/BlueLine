'use client';

import { BOOK_LABELS } from '@blueline/contracts';
import { BOOK_SHORT, cx, formatAmerican, formatSigned, HEAT_WINDOWS } from '../format';
import { Badge } from './Badge';
import { DefenseChip } from './DefenseChip';
import { HeatCell } from './HeatCell';
import { HitStrip } from './HitStrip';
import {
  FavoriteButton,
  MarketLine,
  PlayerName,
  playerMeta,
  propTitle,
  SlipButton,
  teammateOutText,
  type PropViewProps,
} from './propParts';
import styles from './PropRowView.module.css';

export type PropRowViewProps = PropViewProps;

/** One desktop board row: 13 cells, laid out to match PropTable's header. */
export function PropRowView({
  row,
  favorite,
  inSlip,
  onToggleFavorite,
  onToggleSlip,
  activeWindow,
  href,
  linkComponent,
}: PropRowViewProps) {
  const tout = teammateOutText(row);
  const edge = row.edgeAvg;

  return (
    <div role="row" className={cx(styles.grid, styles.row)}>
      <div role="cell" className={cx(styles.cell, styles.first)}>
        <FavoriteButton row={row} favorite={favorite} onToggle={onToggleFavorite} />
      </div>

      <div role="cell" className={cx(styles.cell, styles.stack)}>
        <PlayerName row={row} href={href} linkComponent={linkComponent} />
        <span className={styles.meta}>{playerMeta(row)}</span>
        {tout ? <span className={styles.tout}>{tout}</span> : null}
      </div>

      <div role="cell" className={cx(styles.cell, styles.stack)}>
        <span className={styles.data}>{propTitle(row)}</span>
        <MarketLine row={row} />
      </div>

      <div role="cell" className={cx(styles.cell, styles.stack)}>
        {row.bestPrice !== null ? (
          <span className={styles.price}>
            <span className={styles.data}>{formatAmerican(row.bestPrice)}</span>
            {row.bestBook ? (
              <Badge tone="book" title={BOOK_LABELS[row.bestBook]}>
                {BOOK_SHORT[row.bestBook]}
              </Badge>
            ) : null}
          </span>
        ) : (
          <span className={styles.data}>—</span>
        )}
        {row.value !== null ? (
          <span className={styles.small}>Value {formatSigned(row.value * 100, 0)}%</span>
        ) : null}
      </div>

      <div role="cell" className={styles.cell}>
        <HitStrip values={row.recent} line={row.line} side={row.side} label={row.playerName} />
      </div>

      {HEAT_WINDOWS.map((w) => (
        <div role="cell" key={w.key} className={styles.heat}>
          <HeatCell
            hits={row.rates[w.key].hits}
            n={row.rates[w.key].n}
            active={w.key === activeWindow}
          />
        </div>
      ))}

      <div
        role="cell"
        className={cx(styles.cell, styles.edge, edge !== null && edge < 0 && styles.neg)}
      >
        {edge === null ? '—' : formatSigned(edge)}
      </div>

      <div role="cell" className={styles.cell}>
        {row.dvpTier && row.dvpRank !== null ? (
          <DefenseChip
            tier={row.dvpTier}
            rank={row.dvpRank}
            position={row.position}
            side={row.side}
          />
        ) : (
          <span className={styles.small}>—</span>
        )}
      </div>

      <div role="cell" className={cx(styles.cell, styles.last)}>
        <SlipButton row={row} inSlip={inSlip} onToggle={onToggleSlip} />
      </div>
    </div>
  );
}
