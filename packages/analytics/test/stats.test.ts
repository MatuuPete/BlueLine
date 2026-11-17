import { describe, expect, it } from 'vitest';
import { gradeValue, isPlayed, mean, median, statValue } from '../src/stats';
import { dnp, line } from './fixtures';

describe('statValue', () => {
  const l = line({ pts: 20, reb: 8, ast: 5, fg3m: 3, stl: 2, blk: 1, tov: 4 });
  it.each([
    ['PTS', 20],
    ['REB', 8],
    ['AST', 5],
    ['3PM', 3],
    ['STL', 2],
    ['BLK', 1],
    ['TOV', 4],
    ['PRA', 33],
    ['PR', 28],
    ['PA', 25],
    ['RA', 13],
    ['STOCKS', 3],
  ] as const)('%s', (m, expected) => {
    expect(statValue(l, m)).toBe(expected);
  });
});

describe('isPlayed', () => {
  it('true for minutes > 0 and not dnp', () => expect(isPlayed(line())).toBe(true));
  it('false for dnp', () => expect(isPlayed(dnp())).toBe(false));
  it('false for 0 minutes', () => expect(isPlayed(line({ minutes: 0 }))).toBe(false));
});

describe('gradeValue', () => {
  it('over', () => {
    expect(gradeValue(26, 25.5, 'over')).toBe('hit');
    expect(gradeValue(25, 25.5, 'over')).toBe('miss');
  });
  it('under', () => {
    expect(gradeValue(25, 25.5, 'under')).toBe('hit');
    expect(gradeValue(26, 25.5, 'under')).toBe('miss');
  });
  it('push on exact line for both sides', () => {
    expect(gradeValue(25, 25, 'over')).toBe('push');
    expect(gradeValue(25, 25, 'under')).toBe('push');
  });
});

describe('mean / median', () => {
  it('empty', () => {
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
  });
  it('values', () => {
    expect(mean([1, 2, 6])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
