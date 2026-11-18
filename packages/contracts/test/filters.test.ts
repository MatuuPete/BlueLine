import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  BOARD_SORTS,
  BUILT_IN_PRESETS,
  BoardFilterPatchSchema,
  BoardFilterSchema,
  DEFAULT_BOARD_FILTER,
  DetailSplitSchema,
  parseBoardFilter,
  serializeBoardFilter,
  type BoardFilter,
} from '../src/index';

const busy: BoardFilter = {
  ...DEFAULT_BOARD_FILTER,
  date: '2026-11-18',
  games: ['g1', 'g2'],
  teams: ['BOS'],
  positions: ['G', 'C'],
  q: 'jay tatum, jr',
  markets: ['PTS', 'PRA', '3PM'],
  side: 'over',
  window: 'l5',
  minHitRate: 70,
  minGames: 8,
  minStreak: 3,
  minEdge: 1.5,
  oddsMin: -200,
  oddsMax: 150,
  books: ['draftkings', 'fanduel'],
  bestPriceOnly: true,
  minValue: 5,
  dvpTiers: ['bad', 'worst'],
  dvpRankMin: 16,
  dvpRankMax: 30,
  homeAway: 'home',
  b2bOnly: true,
  restDaysMin: 1,
  restDaysMax: 3,
  totalMin: 220.5,
  totalMax: 240,
  absSpreadMax: 9.5,
  minMinutes: 28,
  minUsage: 22.5,
  starterOnly: true,
  excludeQuestionable: true,
  teammateOutOnly: true,
  minLineMove: 1,
  lineMoveDir: 'up',
  sort: 'edge',
  dir: 'asc',
  page: 3,
};

describe('parseBoardFilter / serializeBoardFilter', () => {
  it('round-trips a filter with every field set', () => {
    const qs = serializeBoardFilter(busy);
    expect(parseBoardFilter(new URLSearchParams(qs))).toEqual(busy);
  });

  it('round-trips the defaults to an empty string', () => {
    expect(serializeBoardFilter(DEFAULT_BOARD_FILTER)).toBe('');
    expect(parseBoardFilter(new URLSearchParams(''))).toEqual(DEFAULT_BOARD_FILTER);
  });

  it('round-trips each built-in preset', () => {
    for (const p of BUILT_IN_PRESETS) {
      const f = { ...DEFAULT_BOARD_FILTER, ...p.filter };
      expect(parseBoardFilter(new URLSearchParams(serializeBoardFilter(f)))).toEqual(f);
    }
  });

  it('omits default values and comma-joins arrays', () => {
    const qs = serializeBoardFilter({
      ...DEFAULT_BOARD_FILTER,
      markets: ['PTS', 'PRA'],
      minHitRate: 80,
    });
    expect(qs).toBe('markets=PTS,PRA&minHitRate=80');
  });

  it('returns DEFAULT_BOARD_FILTER for empty input', () => {
    expect(parseBoardFilter({})).toEqual(DEFAULT_BOARD_FILTER);
    expect(parseBoardFilter(new URLSearchParams())).toEqual(DEFAULT_BOARD_FILTER);
  });

  it('treats empty values as absent', () => {
    expect(parseBoardFilter({ markets: '', minHitRate: '', q: undefined })).toEqual(
      DEFAULT_BOARD_FILTER,
    );
  });

  it.each([
    ['unknown key', { foo: '1' }],
    ['oddsMin=50 (not valid American odds)', { oddsMin: '50' }],
    ['oddsMin=-99', { oddsMin: '-99' }],
    ['oddsMax=10001', { oddsMax: '10001' }],
    ['oddsMin=110.5 (not an integer)', { oddsMin: '110.5' }],
    ['markets=FOO', { markets: 'FOO' }],
    ['markets=PTS,FOO', { markets: 'PTS,FOO' }],
    ['minHitRate=101', { minHitRate: '101' }],
    ['minHitRate=-1', { minHitRate: '-1' }],
    ['minHitRate=abc', { minHitRate: 'abc' }],
    ['b2bOnly=maybe', { b2bOnly: 'maybe' }],
    ['sort=drop table', { sort: 'drop table' }],
    ['page=0', { page: '0' }],
    ['dvpRankMax=31', { dvpRankMax: '31' }],
  ])('rejects %s', (_label, input) => {
    expect(() => parseBoardFilter(input)).toThrow(ZodError);
  });

  it('parses comma-joined arrays', () => {
    expect(parseBoardFilter({ markets: 'PTS,PRA' }).markets).toEqual(['PTS', 'PRA']);
  });

  it('accepts repeated keys and string[] values as arrays', () => {
    const sp = new URLSearchParams('markets=PTS&markets=PRA');
    expect(parseBoardFilter(sp).markets).toEqual(['PTS', 'PRA']);
    expect(parseBoardFilter({ markets: ['PTS', 'REB,AST'] }).markets).toEqual([
      'PTS',
      'REB',
      'AST',
    ]);
  });

  it('parses booleans without z.coerce pitfalls', () => {
    expect(parseBoardFilter({ b2bOnly: 'false' }).b2bOnly).toBe(false);
    expect(parseBoardFilter({ b2bOnly: '0' }).b2bOnly).toBe(false);
    expect(parseBoardFilter({ b2bOnly: '1' }).b2bOnly).toBe(true);
    expect(parseBoardFilter({ b2bOnly: 'true' }).b2bOnly).toBe(true);
  });

  it('parses signed American odds, including a URL-decoded "+100"', () => {
    expect(parseBoardFilter(new URLSearchParams('oddsMin=+100')).oddsMin).toBe(100);
    expect(parseBoardFilter({ oddsMin: '-110' }).oddsMin).toBe(-110);
  });

  it('accepts already-typed values (JSON bodies, saved presets)', () => {
    const f = BoardFilterSchema.parse({ markets: ['PTS'], b2bOnly: true, minHitRate: 60 });
    expect(f).toEqual({ ...DEFAULT_BOARD_FILTER, markets: ['PTS'], b2bOnly: true, minHitRate: 60 });
  });
});

describe('constants', () => {
  it('has the default sort in BOARD_SORTS', () => {
    expect(BOARD_SORTS).toContain(DEFAULT_BOARD_FILTER.sort);
  });

  it('ships the four built-in presets with the spec §6a filters', () => {
    const byId = Object.fromEntries(BUILT_IN_PRESETS.map((p) => [p.id, p.filter]));
    expect(byId['l10-locks']).toEqual({ window: 'l10', minHitRate: 80, minGames: 8 });
    expect(byId['soft-matchups']).toEqual({ dvpTiers: ['worst'], minHitRate: 60 });
    expect(byId['teammate-out']).toEqual({ teammateOutOnly: true, minHitRate: 60 });
    expect(byId['plus-money']).toEqual({ oddsMin: 100, minValue: 5 });
    for (const p of BUILT_IN_PRESETS) expect(() => BoardFilterSchema.parse(p.filter)).not.toThrow();
  });
});

describe('BoardFilterPatchSchema', () => {
  it('keeps only the given keys (no defaults filled in)', () => {
    expect(BoardFilterPatchSchema.parse({ minHitRate: 70 })).toEqual({ minHitRate: 70 });
    for (const p of BUILT_IN_PRESETS)
      expect(BoardFilterPatchSchema.parse(p.filter)).toEqual(p.filter);
  });

  it('still validates values and rejects unknown keys', () => {
    expect(() => BoardFilterPatchSchema.parse({ oddsMin: 50 })).toThrow(ZodError);
    expect(() => BoardFilterPatchSchema.parse({ foo: 1 })).toThrow(ZodError);
  });
});

describe('DetailSplitSchema', () => {
  it('defaults to no splits', () => {
    expect(DetailSplitSchema.parse({})).toMatchObject({
      homeAway: 'all',
      rest: 'all',
      vsOpponent: false,
      role: 'all',
      season: 'all',
      window: 'all',
      result: 'all',
      oppTiers: [],
    });
  });

  it('rejects unknown keys', () => {
    expect(() => DetailSplitSchema.parse({ nope: true })).toThrow(ZodError);
  });
});

describe('BoardFilter date is a real calendar date', () => {
  it('accepts real dates', () => {
    expect(parseBoardFilter(new URLSearchParams('date=2026-11-18')).date).toBe('2026-11-18');
    expect(parseBoardFilter(new URLSearchParams('date=2028-02-29')).date).toBe('2028-02-29');
  });
  it('rejects impossible dates that match YYYY-MM-DD', () => {
    for (const d of ['2026-13-01', '2026-02-30', '2026-00-10', '2026-11-31', '2027-02-29']) {
      expect(() => parseBoardFilter(new URLSearchParams(`date=${d}`))).toThrow();
    }
  });
});
