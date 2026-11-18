import { describe, expect, it } from 'vitest';
import { allWindows, edge, hitRate, selectWindow, streak } from '../src/hitrate';
import { dnp, line, ptsLines } from './fixtures';

const TEN = [27, 22, 31, 26, 29, 19, 28, 33, 25, 30];

describe('hitRate', () => {
  it('over 24.5', () => {
    expect(hitRate(ptsLines(TEN), 'PTS', 24.5, 'over')).toMatchObject({
      hits: 8,
      n: 10,
      rate: 0.8,
    });
  });
  it('over 25 with a push', () => {
    expect(hitRate(ptsLines([25, 26, 24]), 'PTS', 25, 'over')).toEqual({
      hits: 1,
      misses: 1,
      pushes: 1,
      n: 2,
      rate: 0.5,
    });
  });
  it('under 21.5', () => {
    expect(hitRate(ptsLines([18, 23, 17]), 'PTS', 21.5, 'under')).toMatchObject({ hits: 2, n: 3 });
  });
  it('excludes DNPs and 0-minute games', () => {
    const logs = [...ptsLines([27, 22]), dnp(), line({ minutes: 0 })];
    expect(hitRate(logs, 'PTS', 24.5, 'over').n).toBe(2);
  });
  it('empty input', () => {
    expect(hitRate([], 'PTS', 24.5, 'over')).toMatchObject({ rate: null, n: 0 });
  });
  it('all pushes gives null rate', () => {
    expect(hitRate(ptsLines([25]), 'PTS', 25, 'over')).toMatchObject({
      n: 0,
      pushes: 1,
      rate: null,
    });
  });
});

describe('selectWindow', () => {
  const ctx = { oppTeamId: 'BOS', season: 2026 };
  it('l5 is last 5 played, skipping a trailing DNP', () => {
    const played = ptsLines([1, 2, 3, 4, 5, 6, 7]);
    const out = selectWindow([...played, dnp()], 'l5', ctx);
    expect(out.map((l) => l.pts)).toEqual([3, 4, 5, 6, 7]);
  });
  it('l10 and l20 cap at N', () => {
    const logs = ptsLines(Array.from({ length: 25 }, (_, i) => i));
    expect(selectWindow(logs, 'l10', ctx)).toHaveLength(10);
    expect(selectWindow(logs, 'l20', ctx)).toHaveLength(20);
  });
  it('season only current season', () => {
    const logs = [...ptsLines([1], { season: 2025 }), ...ptsLines([2, 3], { season: 2026 })];
    expect(selectWindow(logs, 'season', ctx).map((l) => l.pts)).toEqual([2, 3]);
  });
  it('lastSeason only previous season', () => {
    const logs = [...ptsLines([1], { season: 2025 }), ...ptsLines([2, 3], { season: 2026 })];
    expect(selectWindow(logs, 'lastSeason', ctx).map((l) => l.pts)).toEqual([1]);
  });
  it('h2h only opponent, current and last season', () => {
    const logs = [
      ...ptsLines([1], { oppTeamId: 'NYK' }),
      ...ptsLines([2], { oppTeamId: 'BOS', season: 2025 }),
      ...ptsLines([3], { oppTeamId: 'BOS', season: 2026 }),
      ...ptsLines([4], { oppTeamId: 'BOS', season: 2024 }),
      dnp({ oppTeamId: 'BOS' }),
    ];
    expect(selectWindow(logs, 'h2h', ctx).map((l) => l.pts)).toEqual([2, 3]);
  });
});

describe('allWindows', () => {
  it('computes every window', () => {
    const logs = ptsLines(TEN);
    const w = allWindows(logs, 'PTS', 24.5, 'over', { oppTeamId: 'BOS', season: 2026 });
    expect(Object.keys(w).sort()).toEqual(['h2h', 'l10', 'l20', 'l5', 'lastSeason', 'season']);
    expect(w.l10.rate).toBe(0.8);
    expect(w.lastSeason.rate).toBeNull();
  });
});

describe('edge', () => {
  it('over 24.5', () => {
    const e = edge(ptsLines(TEN), 'PTS', 24.5, 'over');
    expect(e.avg).toBe(27);
    expect(e.median).toBe(27.5);
    expect(e.edgeAvg).toBeCloseTo(2.5);
    expect(e.edgeMedian).toBeCloseTo(3);
  });
  it('under flips the sign', () => {
    const e = edge(ptsLines(TEN), 'PTS', 24.5, 'under');
    expect(e.edgeAvg).toBeCloseTo(-2.5);
    expect(e.edgeMedian).toBeCloseTo(-3);
  });
  it('uses only the last n played', () => {
    const e = edge([...ptsLines([100]), ...ptsLines([10, 20]), dnp()], 'PTS', 0, 'over', 2);
    expect(e.avg).toBe(15);
  });
  it('empty gives nulls', () => {
    expect(edge([], 'PTS', 10, 'over')).toEqual({
      avg: null,
      median: null,
      edgeAvg: null,
      edgeMedian: null,
    });
  });
});

describe('streak', () => {
  it('three hits after a miss', () => {
    expect(streak(ptsLines([20, 10, 30, 28, 27]), 'PTS', 24.5, 'over')).toBe(3);
  });
  it('misses are negative', () => {
    expect(streak(ptsLines([30, 10, 12]), 'PTS', 24.5, 'over')).toBe(-2);
  });
  it('skips pushes and DNPs', () => {
    expect(streak([...ptsLines([30, 25, 31]), dnp()], 'PTS', 25, 'over')).toBe(2);
  });
  it('empty is 0', () => {
    expect(streak([], 'PTS', 25, 'over')).toBe(0);
  });
  it('only pushes is 0', () => {
    expect(streak(ptsLines([25, 25]), 'PTS', 25, 'over')).toBe(0);
  });
});
