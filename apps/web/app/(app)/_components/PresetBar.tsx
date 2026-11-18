'use client';

import type { BoardFilter } from '@blueline/contracts';
import { Button, Chip } from '@blueline/ui';
import {
  allPresets,
  applyPreset,
  clearPreset,
  isPresetActive,
  type FilterPreset,
} from '../../../lib/board-presets';
import styles from './PresetBar.module.css';

export interface PresetBarProps {
  value: BoardFilter;
  onChange: (next: BoardFilter) => void;
  /** The user's saved presets. Built-in presets are always shown first. */
  presets: readonly FilterPreset[];
  /** Omit to hide the "Save as preset" button (the page owns persistence). */
  onSavePreset?: () => void;
}

/** Built-in plus saved presets. Pressing one applies it; pressing the active one clears it. */
export function PresetBar({ value, onChange, presets, onSavePreset }: PresetBarProps) {
  return (
    <section className={styles.bar} aria-labelledby="preset-bar-h">
      <h3 id="preset-bar-h" className={styles.title}>
        Presets
      </h3>
      <div className={styles.grid} role="group" aria-label="Presets">
        {allPresets(presets).map((p) => {
          const on = isPresetActive(value, p);
          return (
            <Chip
              key={p.id}
              shape="rounded"
              className={styles.preset}
              pressed={on}
              onClick={() => onChange(on ? clearPreset(value, p) : applyPreset(value, p))}
            >
              {p.name}
            </Chip>
          );
        })}
      </div>
      {onSavePreset ? (
        <Button variant="secondary" onClick={onSavePreset}>
          Save as preset
        </Button>
      ) : null}
    </section>
  );
}
