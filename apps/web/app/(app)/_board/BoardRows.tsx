'use client';

import type { PropRow, Window } from '@blueline/contracts';
import { PropCard, PropRowView, PropTable } from '@blueline/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { SlipLeg } from '../../../lib/slip';
import { useSlip } from '../_shell/SlipContext';
import styles from './board.module.css';

export function propHref(r: Pick<PropRow, 'playerId' | 'market' | 'gameId' | 'side'>): string {
  return `/props/${encodeURIComponent(r.playerId)}/${encodeURIComponent(r.market)}?gameId=${encodeURIComponent(r.gameId)}&side=${r.side}`;
}

export function rowToLeg(r: PropRow): SlipLeg {
  return {
    key: r.propKey,
    gameId: r.gameId,
    playerId: r.playerId,
    playerName: r.playerName,
    market: r.market,
    side: r.side,
    line: r.line,
    price: r.bestPrice,
    matchup: r.isHome ? `${r.oppAbbr} @ ${r.teamAbbr}` : `${r.teamAbbr} @ ${r.oppAbbr}`,
  };
}

/**
 * Desktop: the 13-column PropTable (≥ 640px). Phone: PropCard list (< 640px).
 * Both render; CSS shows one, so there is no layout shift or hydration mismatch.
 */
export function BoardRows({
  rows,
  activeWindow,
  isFavorite,
  onToggleFavorite,
  label,
  empty,
}: {
  rows: readonly PropRow[];
  activeWindow: Window;
  isFavorite: (r: PropRow) => boolean;
  onToggleFavorite: (r: PropRow) => void;
  label: string;
  empty?: ReactNode;
}) {
  const slip = useSlip();
  const common = (r: PropRow) => ({
    row: r,
    favorite: isFavorite(r),
    inSlip: slip.legs.some((l) => l.key === r.propKey && l.line === r.line),
    onToggleFavorite: () => onToggleFavorite(r),
    onToggleSlip: () => slip.toggle(rowToLeg(r)),
    activeWindow,
    href: propHref(r),
    linkComponent: Link,
  });
  return (
    <>
      <div className={styles.desktopOnly}>
        <PropTable label={label} empty={rows.length === 0 ? empty : undefined}>
          {rows.map((r) => (
            <PropRowView key={r.propKey} {...common(r)} />
          ))}
        </PropTable>
      </div>
      <div className={styles.phoneOnly}>
        {rows.length === 0 ? (
          <div className={styles.phoneEmpty}>{empty}</div>
        ) : (
          <ul className={styles.cards} aria-label={label}>
            {rows.map((r) => (
              <li key={r.propKey}>
                <PropCard {...common(r)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
