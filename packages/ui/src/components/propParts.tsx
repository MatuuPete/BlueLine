'use client';

import type { ComponentType, ReactNode } from 'react';
import type { PropRow, Window } from '@blueline/contracts';
import { MARKET_LABELS } from '@blueline/contracts';
import { cx, formatLine, injuryBadge, SIDE_LETTER, shortName } from '../format';
import { Badge } from './Badge';
import styles from './propParts.module.css';

export type LinkComponent =
  'a' | ComponentType<{ href: string; className?: string; children?: ReactNode }>;

/** Props shared by PropRowView (desktop board) and PropCard (phone). */
export interface PropViewProps {
  row: PropRow;
  favorite: boolean;
  inSlip: boolean;
  onToggleFavorite: () => void;
  onToggleSlip: () => void;
  /** Window the board is filtered/sorted by; its heat cell gets the navy ring. */
  activeWindow: Window;
  /** Prop detail URL. Without it the player name is plain text. */
  href?: string;
  /** e.g. Next's Link. Defaults to a plain anchor. */
  linkComponent?: LinkComponent;
}

export function propTitle(row: PropRow): string {
  return `${SIDE_LETTER[row.side]} ${formatLine(row.line)}`;
}

export function playerMeta(row: PropRow, withB2b = true): string {
  const venue = row.isHome ? 'vs' : '@';
  return `${row.teamAbbr} · ${row.position} · ${venue} ${row.oppAbbr}${withB2b && row.isB2b ? ' · B2B' : ''}`;
}

export function teammateOutText(row: PropRow): string | null {
  if (!row.teammateOut || row.teammatesOut.length === 0) return null;
  const first = shortName(row.teammatesOut[0]!.name);
  const more = row.teammatesOut.length - 1;
  return `${first}${more > 0 ? ` +${more}` : ''} out`;
}

export function PlayerName({
  row,
  href,
  linkComponent: Link = 'a',
  className,
}: Pick<PropViewProps, 'row' | 'href' | 'linkComponent'> & { className?: string }) {
  const badge = injuryBadge(row.injuryStatus);
  return (
    <span className={styles.nameLine}>
      {href ? (
        <Link href={href} className={cx(styles.name, className)}>
          {row.playerName}
        </Link>
      ) : (
        <span className={cx(styles.name, className)}>{row.playerName}</span>
      )}
      {badge ? (
        <Badge tone={badge.tone} title={badge.title}>
          {badge.text}
        </Badge>
      ) : null}
    </span>
  );
}

/** "Points · ▲ 0.5 since open". */
export function MarketLine({ row }: { row: PropRow }) {
  const move = row.lineMove ?? 0;
  return (
    <span className={styles.sub}>
      {MARKET_LABELS[row.market]}
      {move !== 0 ? (
        <>
          {' · '}
          <span aria-hidden="true">{move > 0 ? '▲' : '▼'}</span>
          <span className={styles.sr}>{move > 0 ? 'up' : 'down'}</span> {Math.abs(move).toFixed(1)}{' '}
          since open
        </>
      ) : null}
    </span>
  );
}

const STAR = 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z';

export function FavoriteButton({
  row,
  favorite,
  onToggle,
}: {
  row: PropRow;
  favorite: boolean;
  onToggle: () => void;
}) {
  const label = favorite
    ? `Remove ${row.playerName} ${row.market} ${row.side} from favorites`
    : `Save ${row.playerName} ${row.market} ${row.side} to favorites`;
  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={label}
      onClick={onToggle}
      className={cx(styles.fav, favorite && styles.favOn)}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d={STAR} strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function SlipButton({
  row,
  inSlip,
  onToggle,
  tall = false,
}: {
  row: PropRow;
  inSlip: boolean;
  onToggle: () => void;
  /** Phone card: 48px tall, fills its grid track. */
  tall?: boolean;
}) {
  const what = `${row.playerName} ${row.side} ${formatLine(row.line)} ${row.market}`;
  return (
    <button
      type="button"
      aria-pressed={inSlip}
      aria-label={inSlip ? `Remove ${what} from slip` : `Add ${what} to slip`}
      onClick={onToggle}
      className={cx(styles.slip, tall && styles.slipTall, inSlip && styles.slipOn)}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d={inSlip ? 'M3 8.5l3.2 3L13 4.5' : 'M8 3v10M3 8h10'}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
