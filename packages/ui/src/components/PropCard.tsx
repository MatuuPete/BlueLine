'use client';

import { BOOK_LABELS, MARKET_LABELS } from '@blueline/contracts';
import { BOOK_SHORT, cx, formatAmerican, formatSigned, HEAT_WINDOWS } from '../format';
import { Badge } from './Badge';
import { DefenseChip } from './DefenseChip';
import { HeatCell } from './HeatCell';
import { HitStrip } from './HitStrip';
import {
  FavoriteButton,
  PlayerHeadshot,
  PlayerName,
  playerMeta,
  propTitle,
  SlipButton,
  teammateOutText,
  type PropViewProps,
} from './propParts';
import styles from './PropCard.module.css';

export type PropCardProps = PropViewProps;

/** Phone prop card: strip, edge, defense chip, 5 heat cells, add button. */
export function PropCard({
  row,
  favorite,
  inSlip,
  onToggleFavorite,
  onToggleSlip,
  activeWindow,
  href,
  linkComponent,
}: PropCardProps) {
  const tout = teammateOutText(row);
  const edge = row.edgeAvg;

  return (
    <article
      className={styles.card}
      aria-label={`${row.playerName} ${propTitle(row)} ${row.market}`}
    >
      <div className={styles.top}>
        <FavoriteButton row={row} favorite={favorite} onToggle={onToggleFavorite} />
        <PlayerHeadshot row={row} size={40} />
        <div className={styles.who}>
          <PlayerName row={row} href={href} linkComponent={linkComponent} className={styles.name} />
          <span className={styles.meta}>{playerMeta(row)}</span>
          {tout ? <span className={styles.tout}>{tout}</span> : null}
        </div>
        <div className={styles.what}>
          <span className={styles.prop}>{propTitle(row)}</span>
          <span className={styles.market}>{MARKET_LABELS[row.market]}</span>
          {row.bestPrice !== null ? (
            <span className={styles.price}>
              <span className={styles.data}>{formatAmerican(row.bestPrice)}</span>
              {row.bestBook ? (
                <Badge tone="book" title={BOOK_LABELS[row.bestBook]}>
                  {BOOK_SHORT[row.bestBook]}
                </Badge>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>

      <div className={styles.mid}>
        <HitStrip values={row.recent} line={row.line} side={row.side} label={row.playerName} />
        <span className={styles.edgeLabel}>
          Edge{' '}
          <span className={cx(styles.edge, edge !== null && edge < 0 && styles.neg)}>
            {edge === null ? '—' : formatSigned(edge)}
          </span>
        </span>
        {row.dvpTier && row.dvpRank !== null ? (
          <DefenseChip
            compact
            tier={row.dvpTier}
            rank={row.dvpRank}
            position={row.position}
            side={row.side}
            className={styles.dvp}
          />
        ) : null}
      </div>

      <div className={styles.cells}>
        {HEAT_WINDOWS.map((w) => (
          <HeatCell
            key={w.key}
            label={w.short}
            hits={row.rates[w.key].hits}
            n={row.rates[w.key].n}
            active={w.key === activeWindow}
            className={styles.cell}
          />
        ))}
        <SlipButton row={row} inSlip={inSlip} onToggle={onToggleSlip} tall />
      </div>
    </article>
  );
}
