'use client';

import type { BoardFilter, DvpTier } from '@blueline/contracts';
import { Chip } from '@blueline/ui';
import { activeFilterCount } from '../../../lib/board-filter-url';
import styles from './QuickFilters.module.css';

export interface QuickFiltersProps {
  value: BoardFilter;
  onChange: (next: BoardFilter) => void;
  /** Opens the FilterSheet. */
  onOpenFilters: () => void;
}

const SOFT: readonly DvpTier[] = ['bad', 'worst'];

const isSoft = (tiers: readonly DvpTier[]) =>
  tiers.length === SOFT.length && SOFT.every((t) => tiers.includes(t));

/** Phone quick-filter row (spec 7): Filters button with active count plus four one-tap chips. */
export function QuickFilters({ value, onChange, onOpenFilters }: QuickFiltersProps) {
  const active = activeFilterCount(value);
  const patch = (p: Partial<BoardFilter>) => onChange({ ...value, ...p, page: 1 });
  const l10On = value.window === 'l10' && value.minHitRate === 70;

  return (
    <div role="toolbar" aria-label="Quick filters" className={styles.row}>
      <button type="button" className={styles.open} onClick={onOpenFilters}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        Filters
        {active > 0 ? (
          <span className={styles.count} aria-label={`${active} active`}>
            {active}
          </span>
        ) : null}
      </button>
      <Chip
        className={styles.chip}
        pressed={l10On}
        onClick={() => patch(l10On ? { minHitRate: undefined } : { window: 'l10', minHitRate: 70 })}
      >
        L10 70%+
      </Chip>
      <Chip
        className={styles.chip}
        pressed={value.side === 'over'}
        onClick={() => patch({ side: value.side === 'over' ? 'both' : 'over' })}
      >
        Overs
      </Chip>
      <Chip
        className={styles.chip}
        pressed={isSoft(value.dvpTiers)}
        onClick={() => patch({ dvpTiers: isSoft(value.dvpTiers) ? [] : [...SOFT] })}
      >
        Soft matchups
      </Chip>
      <Chip
        className={styles.chip}
        pressed={value.teammateOutOnly}
        onClick={() => patch({ teammateOutOnly: !value.teammateOutOnly })}
      >
        Teammate out
      </Chip>
    </div>
  );
}
