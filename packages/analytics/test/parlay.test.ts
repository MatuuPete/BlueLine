import { describe, expect, it } from 'vitest';
import { jointHitRate, parlay } from '../src/parlay';

describe('parlay', () => {
  it('-110 x2', () => {
    const p = parlay([{ price: -110 }, { price: -110 }]);
    expect(p.decimal).toBeCloseTo(3.6446, 4);
    expect(p.american).toBeCloseTo(264.46, 1);
  });
  it('short-priced parlay gives negative american', () => {
    const p = parlay([{ price: -300 }]);
    expect(p.decimal).toBeCloseTo(1.3333, 4);
    expect(p.american).toBeCloseTo(-300, 6);
  });
  it('even money single', () => {
    expect(parlay([{ price: 100 }])).toEqual({ decimal: 2, american: 100 });
  });
});

describe('jointHitRate', () => {
  it('uses only gameIds present in every leg', () => {
    const r = jointHitRate([
      {
        values: new Map([
          ['g1', 30],
          ['g2', 10],
          ['g3', 28],
        ]),
        line: 24.5,
        side: 'over',
      },
      {
        values: new Map([
          ['g1', 9],
          ['g3', 5],
        ]),
        line: 7.5,
        side: 'over',
      },
    ]);
    // shared: g1 (hit, hit), g3 (hit, miss)
    expect(r).toEqual({ hits: 1, n: 2, rate: 0.5 });
  });
  it('a push on any leg drops the game', () => {
    const r = jointHitRate([
      {
        values: new Map([
          ['g1', 25],
          ['g2', 30],
        ]),
        line: 25,
        side: 'over',
      },
      {
        values: new Map([
          ['g1', 9],
          ['g2', 9],
        ]),
        line: 7.5,
        side: 'over',
      },
    ]);
    expect(r).toEqual({ hits: 1, n: 1, rate: 1 });
  });
  it('no legs or no shared games', () => {
    expect(jointHitRate([])).toEqual({ hits: 0, n: 0, rate: null });
    const r = jointHitRate([
      { values: new Map([['g1', 30]]), line: 24.5, side: 'over' },
      { values: new Map([['g2', 9]]), line: 7.5, side: 'over' },
    ]);
    expect(r).toEqual({ hits: 0, n: 0, rate: null });
  });
  it('under side', () => {
    const r = jointHitRate([{ values: new Map([['g1', 10]]), line: 24.5, side: 'under' }]);
    expect(r.rate).toBe(1);
  });
});
