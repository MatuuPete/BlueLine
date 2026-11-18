import { BUILT_IN_PRESETS, DEFAULT_BOARD_FILTER } from '@blueline/contracts';
import { describe, expect, it } from 'vitest';
import {
  allPresets,
  applyPreset,
  clearPreset,
  isPresetActive,
  resetFilter,
} from '../lib/board-presets';

const plus = BUILT_IN_PRESETS.find((p) => p.id === 'plus-money')!;
const locks = BUILT_IN_PRESETS.find((p) => p.id === 'l10-locks')!;

describe('presets', () => {
  it('lists built-ins then user presets', () => {
    const user = { id: 'u1', name: 'Mine', filter: { side: 'over' as const } };
    expect(allPresets([user]).map((p) => p.id)).toEqual([
      ...BUILT_IN_PRESETS.map((p) => p.id),
      'u1',
    ]);
  });
  it('applies over defaults, keeping date/sort/dir and resetting page', () => {
    const cur = {
      ...DEFAULT_BOARD_FILTER,
      date: '2026-11-18',
      sort: 'edge' as const,
      dir: 'asc' as const,
      page: 4,
      side: 'under' as const,
    };
    const next = applyPreset(cur, plus);
    expect(next).toMatchObject({
      oddsMin: 100,
      minValue: 5,
      date: '2026-11-18',
      sort: 'edge',
      dir: 'asc',
      page: 1,
      side: 'both',
    });
  });
  it('detects an active preset and clears only its fields', () => {
    const on = applyPreset(DEFAULT_BOARD_FILTER, locks);
    expect(isPresetActive(on, locks)).toBe(true);
    expect(isPresetActive(DEFAULT_BOARD_FILTER, locks)).toBe(false);
    const withExtra = { ...on, side: 'over' as const };
    const cleared = clearPreset(withExtra, locks);
    expect(cleared.minHitRate).toBeUndefined();
    expect(cleared.minGames).toBeUndefined();
    expect(cleared.side).toBe('over');
  });
  it('reset returns defaults but keeps view state', () => {
    const cur = {
      ...DEFAULT_BOARD_FILTER,
      date: '2026-11-18',
      minHitRate: 70,
      sort: 'value' as const,
    };
    expect(resetFilter(cur)).toEqual({
      ...DEFAULT_BOARD_FILTER,
      date: '2026-11-18',
      sort: 'value',
    });
  });
  it('an empty preset is never active', () => {
    expect(isPresetActive(DEFAULT_BOARD_FILTER, { id: 'x', name: 'x', filter: {} })).toBe(false);
  });
});
