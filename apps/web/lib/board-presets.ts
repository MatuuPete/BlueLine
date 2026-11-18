// Pure preset helpers shared by the filter components (no React, unit-tested in node).
import { BUILT_IN_PRESETS, DEFAULT_BOARD_FILTER, type BoardFilter } from '@blueline/contracts';

/** A built-in or user preset. `PresetDTO` from the API fits this shape. */
export interface FilterPreset {
  id: string;
  name: string;
  filter: Partial<BoardFilter>;
}

/** View state that presets and "reset" never touch. */
const KEEP: readonly (keyof BoardFilter)[] = ['date', 'sort', 'dir'];

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Built-in presets first, then the user's own (user presets win on id clash). */
export function allPresets(user: readonly FilterPreset[]): FilterPreset[] {
  const ids = new Set(user.map((p) => p.id));
  return [...BUILT_IN_PRESETS.filter((p) => !ids.has(p.id)), ...user];
}

/** Start from DEFAULT_BOARD_FILTER, keep date/sort/dir, merge the preset on top, back to page 1. */
export function applyPreset(current: BoardFilter, preset: FilterPreset): BoardFilter {
  const kept = Object.fromEntries(KEEP.map((k) => [k, current[k]]));
  return { ...DEFAULT_BOARD_FILTER, ...kept, ...preset.filter, page: 1 } as BoardFilter;
}

/** A preset is "on" when every field it sets matches the current filter. */
export function isPresetActive(current: BoardFilter, preset: FilterPreset): boolean {
  const entries = Object.entries(preset.filter) as [keyof BoardFilter, unknown][];
  return entries.length > 0 && entries.every(([k, v]) => same(current[k], v));
}

/** Pressing an active preset again clears just the fields it set. */
export function clearPreset(current: BoardFilter, preset: FilterPreset): BoardFilter {
  const next: BoardFilter = { ...current, page: 1 };
  for (const k of Object.keys(preset.filter) as (keyof BoardFilter)[]) {
    (next as Record<string, unknown>)[k] = DEFAULT_BOARD_FILTER[k];
  }
  return next;
}

/** "Reset filters": default filter, keeping date/sort/dir. */
export function resetFilter(current: BoardFilter): BoardFilter {
  return applyPreset(current, { id: 'reset', name: 'Reset', filter: {} });
}
