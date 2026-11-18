import type { GameLogEntry, PropDetail, ShopRow } from '@blueline/contracts';
import { DetailSplitSchema } from '@blueline/contracts';
import { describe, expect, it } from 'vitest';
import {
  applySplits,
  bestPriceAt,
  defaultLine,
  DEFAULT_SPLIT,
  stepLine,
} from '../lib/detail-splits';

let n = 0;
function log(p: Partial<GameLogEntry> = {}): GameLogEntry {
  n += 1;
  return {
    gameId: `g${n}`,
    date: `2026-11-${String((n % 28) + 1).padStart(2, '0')}`,
    season: 2026,
    teamId: 'BOS',
    oppTeamId: 'NYK',
    oppAbbr: 'NYK',
    isHome: true,
    started: true,
    dnp: false,
    minutes: 34,
    pts: 20,
    reb: 5,
    ast: 5,
    fg3m: 2,
    stl: 1,
    blk: 0,
    tov: 2,
    won: true,
    restDays: 1,
    oppTier: 'good',
    ...p,
  };
}

const ctx = { oppTeamId: 'NYK', season: 2026, teammates: [] };
const split = (p: Record<string, unknown> = {}) => DetailSplitSchema.parse(p);

describe('applySplits', () => {
  it('drops DNP and zero-minute games even with no split', () => {
    const logs = [log(), log({ dnp: true }), log({ minutes: 0 }), log()];
    expect(applySplits(logs, split(), ctx)).toHaveLength(2);
  });

  it('home/away', () => {
    const logs = [log({ isHome: true }), log({ isHome: false }), log({ isHome: false })];
    expect(applySplits(logs, split({ homeAway: 'away' }), ctx)).toHaveLength(2);
    expect(applySplits(logs, split({ homeAway: 'home' }), ctx)).toHaveLength(1);
  });

  it('rest: b2b = 0 days, one = 1 day, twoPlus = 2+; unknown rest is excluded', () => {
    const logs = [
      log({ restDays: 0 }),
      log({ restDays: 1 }),
      log({ restDays: 2 }),
      log({ restDays: 4 }),
      log({ restDays: null }),
    ];
    expect(applySplits(logs, split({ rest: 'b2b' }), ctx)).toHaveLength(1);
    expect(applySplits(logs, split({ rest: 'one' }), ctx)).toHaveLength(1);
    expect(applySplits(logs, split({ rest: 'twoPlus' }), ctx)).toHaveLength(2);
    expect(applySplits(logs, split(), ctx)).toHaveLength(5);
  });

  it('vs tonight’s opponent', () => {
    const logs = [log({ oppTeamId: 'NYK' }), log({ oppTeamId: 'MIA' })];
    expect(applySplits(logs, split({ vsOpponent: true }), ctx).map((l) => l.oppTeamId)).toEqual([
      'NYK',
    ]);
  });

  it('with / without a teammate', () => {
    const a = log();
    const b = log();
    const c = log();
    const tctx = { ...ctx, teammates: [{ playerId: 't1', name: 'T', playedGameIds: [a.gameId] }] };
    const w = applySplits([a, b, c], split({ teammateId: 't1', teammateMode: 'with' }), tctx);
    const wo = applySplits([a, b, c], split({ teammateId: 't1', teammateMode: 'without' }), tctx);
    expect(w.map((l) => l.gameId)).toEqual([a.gameId]);
    expect(wo.map((l) => l.gameId)).toEqual([b.gameId, c.gameId]);
  });

  it('an unknown teammate id applies no teammate split', () => {
    const logs = [log(), log()];
    expect(applySplits(logs, split({ teammateId: 'nobody' }), ctx)).toHaveLength(2);
  });

  it('minutes floor, starter/bench, opponent tier, season, win/loss', () => {
    const logs = [
      log({ minutes: 36, started: true, oppTier: 'worst', season: 2026, won: true }),
      log({ minutes: 22, started: false, oppTier: 'best', season: 2025, won: false }),
      log({ minutes: 31, started: true, oppTier: null, season: 2026, won: null }),
    ];
    expect(applySplits(logs, split({ minMinutes: 30 }), ctx)).toHaveLength(2);
    expect(applySplits(logs, split({ role: 'bench' }), ctx)).toHaveLength(1);
    expect(applySplits(logs, split({ role: 'starter' }), ctx)).toHaveLength(2);
    expect(applySplits(logs, split({ oppTiers: ['bad', 'worst'] }), ctx)).toHaveLength(1);
    expect(applySplits(logs, split({ season: 'current' }), ctx)).toHaveLength(2);
    expect(applySplits(logs, split({ season: 'last' }), ctx)).toHaveLength(1);
    expect(applySplits(logs, split({ result: 'win' }), ctx)).toHaveLength(1);
    expect(applySplits(logs, split({ result: 'loss' }), ctx)).toHaveLength(1);
  });

  it('the window is applied last, to the filtered games, keeping the newest', () => {
    const logs = Array.from({ length: 12 }, (_, i) => log({ isHome: i % 2 === 0, pts: i }));
    const out = applySplits(logs, split({ homeAway: 'home', window: 'l5' }), ctx);
    expect(out.map((l) => l.pts)).toEqual([2, 4, 6, 8, 10]);
  });

  it('DEFAULT_SPLIT starts on the last 10 games', () => {
    expect(DEFAULT_SPLIT.window).toBe('l10');
  });
});

function shop(p: Partial<ShopRow>): ShopRow {
  return {
    book: 'draftkings',
    line: 24.5,
    overPrice: -110,
    underPrice: -110,
    noVigOver: 0.5,
    noVigUnder: 0.5,
    isBestOver: false,
    isBestUnder: false,
    capturedAt: '2026-11-18T12:00:00.000Z',
    ...p,
  };
}

describe('bestPriceAt', () => {
  const rows = [
    shop({ book: 'draftkings', overPrice: -120, underPrice: -102 }),
    shop({ book: 'fanduel', overPrice: -105, underPrice: -115 }),
    shop({ book: 'betmgm', line: 25.5, overPrice: 110, underPrice: -140 }),
  ];
  it('picks the highest price at the line for the side', () => {
    expect(bestPriceAt(rows, 24.5, 'over')).toEqual({ book: 'fanduel', price: -105 });
    expect(bestPriceAt(rows, 24.5, 'under')).toEqual({ book: 'draftkings', price: -102 });
    expect(bestPriceAt(rows, 25.5, 'over')).toEqual({ book: 'betmgm', price: 110 });
  });
  it('null when no book offers the line', () => {
    expect(bestPriceAt(rows, 23.5, 'over')).toBeNull();
  });
  it('respects a books allowlist (empty = all)', () => {
    expect(bestPriceAt(rows, 24.5, 'over', ['draftkings'])).toEqual({
      book: 'draftkings',
      price: -120,
    });
    expect(bestPriceAt(rows, 24.5, 'over', [])).toEqual({ book: 'fanduel', price: -105 });
  });
});

describe('defaultLine', () => {
  const base = { metrics: [], shop: [], logs: [], market: 'PTS' } as unknown as PropDetail;
  it('uses the board line for the side first', () => {
    const d = {
      ...base,
      metrics: [
        { side: 'over', line: 24.5 },
        { side: 'under', line: 23.5 },
      ],
    } as unknown as PropDetail;
    expect(defaultLine(d, 'under')).toBe(23.5);
  });
  it('then the most common sportsbook line', () => {
    const d = {
      ...base,
      shop: [shop({ line: 7.5 }), shop({ line: 8.5 }), shop({ line: 8.5 })],
    } as PropDetail;
    expect(defaultLine(d, 'over')).toBe(8.5);
  });
  it('then the recent median, on a half point', () => {
    const d = {
      ...base,
      logs: [log({ pts: 20 }), log({ pts: 22 }), log({ pts: 27 })],
    } as PropDetail;
    expect(defaultLine(d, 'over')).toBe(21.5);
  });
  it('0.5 with no data at all', () => {
    expect(defaultLine(base, 'over')).toBe(0.5);
  });
});

describe('stepLine', () => {
  it('moves by 0.5 and never below 0.5', () => {
    expect(stepLine(24.5, 1)).toBe(25);
    expect(stepLine(24.5, -1)).toBe(24);
    expect(stepLine(0.5, -1)).toBe(0.5);
  });
});
