import type { DvpTier, Position, Side } from '@blueline/contracts';
import { cx, ordinal, TIER_LABELS } from '../format';
import styles from './DefenseChip.module.css';

export type DefenseTone = 'favorable' | 'tough' | 'neutral';

/**
 * Side-aware matchup tone (spec §7). Rank 1 = toughest defense.
 * Over: Bad/Worst help, Best hurts. Under: Best/Good help, Worst hurts.
 */
export function defenseTone(tier: DvpTier, side: Side): DefenseTone {
  if (side === 'over') {
    if (tier === 'bad' || tier === 'worst') return 'favorable';
    if (tier === 'best') return 'tough';
    return 'neutral';
  }
  if (tier === 'best' || tier === 'good') return 'favorable';
  if (tier === 'worst') return 'tough';
  return 'neutral';
}

export interface DefenseChipProps {
  tier: DvpTier;
  /** 1–30, 1 = toughest. */
  rank: number;
  position: Position;
  side: Side;
  /** One-line phone variant: "Worst D · 28". */
  compact?: boolean;
  className?: string;
}

const TONE_TEXT: Record<DefenseTone, string> = {
  favorable: 'helps',
  tough: 'hurts',
  neutral: 'is neutral for',
};

export function DefenseChip({ tier, rank, position, side, compact, className }: DefenseChipProps) {
  const tone = defenseTone(tier, side);
  const sr = <span className={styles.sr}>{`, matchup ${TONE_TEXT[tone]} the ${side}`}</span>;

  if (compact) {
    return (
      <span className={cx(styles.chip, styles.compact, styles[tone], className)} data-tone={tone}>
        {`${TIER_LABELS[tier]} D · ${rank}`}
        {sr}
      </span>
    );
  }

  return (
    <span className={cx(styles.chip, styles[tone], className)} data-tone={tone}>
      <span className={styles.tier}>{TIER_LABELS[tier]}</span>
      <span className={styles.rank}>{`${ordinal(rank)} vs ${position}`}</span>
      {sr}
    </span>
  );
}
