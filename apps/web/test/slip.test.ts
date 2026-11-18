import type { GameLogEntry } from '@blueline/contracts';
import { describe, expect, it } from 'vitest';
import {
  correlatedKeys,
  formatDecimalOdds,
  jointFromLogs,
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
