'use client';

import type { BoardFilter } from '@blueline/contracts';
import { Button } from '@blueline/ui';
import { resetFilter, type FilterPreset } from '../../../lib/board-presets';
import { FilterControls, type GameOption } from './FilterControls';
import styles from './FilterRail.module.css';
import { PresetBar } from './PresetBar';

export interface FilterRailProps {
  value: BoardFilter;
  onChange: (next: BoardFilter) => void;
  presets: readonly FilterPreset[];
  games?: readonly GameOption[];
  onSavePreset?: () => void;
}

/** Desktop filter rail (spec 6a / 7). Task 12 lays it out; it never fetches. */
export function FilterRail({ value, onChange, presets, games, onSavePreset }: FilterRailProps) {
  return (
    <aside aria-label="Filters" className={styles.rail}>
      <div className={styles.head}>
        <h2 className={styles.title}>Filters</h2>
        <Button variant="ghost" onClick={() => onChange(resetFilter(value))}>
          Reset filters
        </Button>
      </div>
      <PresetBar value={value} onChange={onChange} presets={presets} onSavePreset={onSavePreset} />
      <FilterControls value={value} onChange={onChange} games={games} />
    </aside>
  );
}
