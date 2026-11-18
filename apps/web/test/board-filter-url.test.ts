import { DEFAULT_BOARD_FILTER, serializeBoardFilter } from '@blueline/contracts';
import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  applyFilterChange,
  filterFromParams,
  stripUnknownKeys,
} from '../lib/board-filter-url';

describe('stripUnknownKeys', () => {
  it('drops keys that are not board filter fields', () => {
    const out = stripUnknownKeys(new URLSearchParams('markets=PTS&utm_source=x&foo=1&page=2'));
    expect([...out.keys()].sort()).toEqual(['markets', 'page']);
  });
  it('keeps repeated known keys', () => {
    const out = stripUnknownKeys(new URLSearchParams('teams=BOS&teams=NYK&zzz=1'));
    expect(out.getAll('teams')).toEqual(['BOS', 'NYK']);
  });
});

describe('filterFromParams (R11)', () => {
  it('empty params give the default filter', () => {
    expect(filterFromParams(new URLSearchParams(''))).toEqual(DEFAULT_BOARD_FILTER);
  });
  it('parses known keys and ignores unknown ones', () => {
    const f = filterFromParams(new URLSearchParams('markets=PTS,PRA&minHitRate=70&utm=1'));
    expect(f.markets).toEqual(['PTS', 'PRA']);
    expect(f.minHitRate).toBe(70);
  });
  it('falls back to the default on invalid values, never throws', () => {
    expect(filterFromParams(new URLSearchParams('minHitRate=abc'))).toEqual(DEFAULT_BOARD_FILTER);
    expect(filterFromParams(new URLSearchParams('markets=NOPE'))).toEqual(DEFAULT_BOARD_FILTER);
    expect(filterFromParams(new URLSearchParams('sort=drop_table'))).toEqual(DEFAULT_BOARD_FILTER);
  });
  it('round-trips with serializeBoardFilter', () => {
    const f = {
      ...DEFAULT_BOARD_FILTER,
      side: 'over' as const,
      teammateOutOnly: true,
      minGames: 8,
    };
    expect(filterFromParams(new URLSearchParams(serializeBoardFilter(f)))).toEqual(f);
  });
});

describe('applyFilterChange', () => {
  it('resets to page 1 when a non-page field changes', () => {
    const prev = { ...DEFAULT_BOARD_FILTER, page: 3 };
    expect(applyFilterChange(prev, { ...prev, side: 'over' }).page).toBe(1);
  });
  it('keeps an explicit page change', () => {
    const prev = { ...DEFAULT_BOARD_FILTER, page: 3 };
    expect(applyFilterChange(prev, { ...prev, page: 4 }).page).toBe(4);
  });
});

describe('activeFilterCount', () => {
  it('is 0 for the default and counts each non-default field group member', () => {
    expect(activeFilterCount(DEFAULT_BOARD_FILTER)).toBe(0);
    const f = {
      ...DEFAULT_BOARD_FILTER,
      minHitRate: 70,
      side: 'over' as const,
      markets: ['PTS' as const],
    };
    expect(activeFilterCount(f)).toBe(3);
  });
  it('ignores sort, dir, page and date', () => {
    const f = {
      ...DEFAULT_BOARD_FILTER,
      sort: 'edge' as const,
      dir: 'asc' as const,
      page: 2,
      date: '2026-11-18',
    };
    expect(activeFilterCount(f)).toBe(0);
  });
});
