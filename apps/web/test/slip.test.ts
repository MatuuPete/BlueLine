import type { GameLogEntry } from '@blueline/contracts';
import { describe, expect, it } from 'vitest';
import {
  correlatedKeys,
  formatDecimalOdds,
  jointFromLogs,
  parseStoredLegs,
  slipHitEstimate,
  MAX_LEGS,
  slipBody,
  slipOdds,
  toggleLeg,
  type SlipLeg,
} from '../lib/slip';

function leg(p: Partial<SlipLeg> = {}): SlipLeg {
  return {
    key: 'g1:p1:PTS:over',
    gameId: 'g1',
    playerId: 'p1',
    playerName: 'Marcus Dell',
    market: 'PTS',
    side: 'over',
    line: 24.5,
    price: -110,
    matchup: 'BOS @ NYK',
    ...p,
  };
}

describe('toggleLeg', () => {
  it('adds a new leg and removes an existing one', () => {
    const a = leg();
    const added = toggleLeg([], a);
    expect(added).toEqual([a]);
    expect(toggleLeg(added, a)).toEqual([]);
  });
  it('replaces the other side of the same prop instead of stacking both', () => {
    const over = leg();
    const under = leg({ key: 'g1:p1:PTS:under', side: 'under' });
    expect(toggleLeg([over], under)).toEqual([under]);
  });
  it(`stops at ${MAX_LEGS} legs`, () => {
    const legs = Array.from({ length: MAX_LEGS }, (_, i) =>
      leg({ key: `k${i}`, playerId: `p${i}` }),
    );
    expect(toggleLeg(legs, leg({ key: 'extra', playerId: 'px' }))).toHaveLength(MAX_LEGS);
  });
});

describe('slipOdds', () => {
  it('multiplies decimal odds (parlay)', () => {
    const r = slipOdds([leg({ price: 100 }), leg({ key: 'b', price: 100 })]);
    expect(r?.decimal).toBeCloseTo(4);
    expect(r?.american).toBeCloseTo(300);
  });
  it('null when a leg has no price or there are no legs', () => {
    expect(slipOdds([])).toBeNull();
    expect(slipOdds([leg({ price: null })])).toBeNull();
  });
});

describe('formatDecimalOdds', () => {
  it('two places', () => {
    expect(formatDecimalOdds(3.6436)).toBe('3.64');
  });
});

describe('correlatedKeys', () => {
  it('flags legs that share a game', () => {
    const a = leg({ key: 'a', gameId: 'g1' });
    const b = leg({ key: 'b', gameId: 'g1', playerId: 'p2' });
    const c = leg({ key: 'c', gameId: 'g2', playerId: 'p3' });
    expect([...correlatedKeys([a, b, c])].sort()).toEqual(['a', 'b']);
  });
});

function g(gameId: string, pts: number, extra: Partial<GameLogEntry> = {}): GameLogEntry {
  return {
    gameId,
    date: '2026-11-01',
    season: 2026,
    teamId: 'BOS',
    oppTeamId: 'NYK',
    oppAbbr: 'NYK',
    isHome: true,
    started: true,
    dnp: false,
    minutes: 30,
    pts,
    reb: 5,
    ast: 5,
    fg3m: 1,
    stl: 1,
    blk: 1,
    tov: 1,
    won: true,
    restDays: 1,
    oppTier: null,
    ...extra,
  };
}

describe('jointFromLogs', () => {
  it('counts games where every leg hit, over the games all legs played', () => {
    const a = leg({ key: 'a', line: 19.5 });
    const b = leg({ key: 'b', playerId: 'p2', line: 9.5 });
    const logs = new Map([
      ['a', [g('x', 25), g('y', 18), g('z', 22)]],
      ['b', [g('x', 12), g('y', 15), g('w', 30)]],
    ]);
    // shared games x, y: x both hit, y a misses.
    expect(jointFromLogs([a, b], logs)).toEqual({ hits: 1, n: 2, rate: 0.5 });
  });
  it('skips DNPs and returns null when a leg has no logs', () => {
    const a = leg({ key: 'a' });
    expect(jointFromLogs([a], new Map())).toBeNull();
    const logs = new Map([['a', [g('x', 30), g('y', 30, { dnp: true, minutes: 0 })]]]);
    expect(jointFromLogs([a], logs)).toEqual({ hits: 1, n: 1, rate: 1 });
  });
});

describe('slipBody', () => {
  it('builds the POST /api/slips body', () => {
    expect(slipBody('Tuesday', [leg()])).toEqual({
      name: 'Tuesday',
      book: null,
      stake: null,
      legs: [
        { gameId: 'g1', playerId: 'p1', market: 'PTS', side: 'over', line: 24.5, price: -110 },
      ],
    });
  });
  it('null when a leg has no price', () => {
    expect(slipBody('x', [leg({ price: null })])).toBeNull();
  });
});

describe('formatOdds (settings: American or decimal)', () => {
  it('prints American with a typographic minus, or decimal to two places', async () => {
    const { formatOdds } = await import('../lib/odds-format');
    expect(formatOdds(-110, 'american')).toBe('−110');
    expect(formatOdds(150, 'american')).toBe('+150');
    expect(formatOdds(-110, 'decimal')).toBe('1.91');
    expect(formatOdds(150, 'decimal')).toBe('2.50');
  });
});

describe('slipHitEstimate (spec §5: independent legs when no games are shared)', () => {
  const a = leg({ key: 'a', line: 19.5 });
  const b = leg({ key: 'b', playerId: 'p2', line: 9.5 });

  it('uses the joint hit rate when the legs share games', () => {
    const logs = new Map([
      ['a', [g('x', 25), g('y', 18)]],
      ['b', [g('x', 12), g('y', 15)]],
    ]);
    expect(slipHitEstimate([a, b], logs)).toEqual({ kind: 'joint', hits: 1, n: 2, rate: 0.5 });
  });

  it('multiplies each leg’s own L10 hit rate when no game is shared', () => {
    // a: 3 of 4 over 19.5; b: 1 of 2 over 9.5 → 0.75 × 0.5.
    const logs = new Map([
      ['a', [g('a1', 25), g('a2', 22), g('a3', 10), g('a4', 30), g('a5', 40, { dnp: true, minutes: 0 })]],
      ['b', [g('b1', 12), g('b2', 3)]],
    ]);
    const r = slipHitEstimate([a, b], logs);
    expect(r?.kind).toBe('independent');
    expect(r?.rate).toBeCloseTo(0.375);
  });

  it('only counts the last 10 played games per leg', () => {
    const many = Array.from({ length: 15 }, (_, i) => g(`m${i}`, i < 5 ? 30 : 0));
    const logs = new Map([
      ['a', many],
      ['b', [g('b1', 12)]],
    ]);
    // last 10 of `a` are all misses.
    expect(slipHitEstimate([a, b], logs)?.rate).toBe(0);
  });

  it('rate is null when a leg has no played games; null while logs load', () => {
    const logs = new Map([
      ['a', [g('a1', 25)]],
      ['b', [] as GameLogEntry[]],
    ]);
    expect(slipHitEstimate([a, b], logs)).toEqual({ kind: 'independent', rate: null });
    expect(slipHitEstimate([a, b], new Map())).toBeNull();
  });
});

describe('parseStoredLegs (localStorage is untrusted)', () => {
  it('keeps valid legs and drops malformed ones', () => {
    const good = leg();
    const raw = JSON.stringify([
      good,
      { ...good, key: 'x', market: 'NOPE' },
      { ...good, key: 'y', side: 'sideways' },
      { ...good, key: 'z', line: 'abc' },
      { ...good, key: 'w', price: 'free' },
      null,
      42,
      { ...good, key: 'v', price: null },
    ]);
    expect(parseStoredLegs(raw).map((l) => l.key)).toEqual([good.key, 'v']);
  });
  it('garbage, non-arrays and duplicates', () => {
    expect(parseStoredLegs('{not json')).toEqual([]);
    expect(parseStoredLegs('{"a":1}')).toEqual([]);
    expect(parseStoredLegs(null)).toEqual([]);
    expect(parseStoredLegs(JSON.stringify([leg(), leg()]))).toHaveLength(1);
  });
  it(`keeps at most ${MAX_LEGS}`, () => {
    const many = Array.from({ length: 20 }, (_, i) => leg({ key: `k${i}`, playerId: `p${i}` }));
    expect(parseStoredLegs(JSON.stringify(many))).toHaveLength(MAX_LEGS);
  });
});
