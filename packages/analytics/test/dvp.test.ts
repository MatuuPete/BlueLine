import { describe, expect, it } from 'vitest';
import { dvpRank, dvpTier } from '../src/dvp';

describe('dvpRank', () => {
  it('ascending allowed gets rank 1', () => {
    const r = dvpRank([
      { teamId: 'A', allowedPerGame: 25 },
      { teamId: 'B', allowedPerGame: 20 },
      { teamId: 'C', allowedPerGame: 30 },
    ]);
    expect(r.get('B')).toBe(1);
    expect(r.get('A')).toBe(2);
    expect(r.get('C')).toBe(3);
  });
  it('breaks ties by teamId deterministically', () => {
    const rows = [
      { teamId: 'Z', allowedPerGame: 20 },
      { teamId: 'A', allowedPerGame: 20 },
    ];
    expect(dvpRank(rows).get('A')).toBe(1);
    expect(dvpRank([...rows].reverse()).get('A')).toBe(1);
  });
  it('empty', () => expect(dvpRank([]).size).toBe(0));
});

describe('dvpTier', () => {
  it.each([
    [1, 'best'],
    [6, 'best'],
    [7, 'good'],
    [15, 'good'],
    [16, 'bad'],
    [24, 'bad'],
    [25, 'worst'],
    [30, 'worst'],
  ] as const)('rank %i is %s', (rank, tier) => {
    expect(dvpTier(rank)).toBe(tier);
  });
});
