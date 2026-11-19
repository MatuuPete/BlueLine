import { describe, expect, it } from 'vitest';
import {
  activePreset,
  filterToQuery,
  formatDay,
  formatMonth,
  parseBetFilter,
  presetRange,
  todayLocal,
} from '../lib/bets';

describe('bet UI helpers', () => {
  it('uses the local calendar date', () => {
    expect(todayLocal(new Date(2026, 10, 5, 23, 59))).toBe('2026-11-05');
    expect(todayLocal(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });

  it('builds preset ranges ending today', () => {
    expect(presetRange('7d', '2026-11-19')).toEqual({ from: '2026-11-13', to: '2026-11-19' });
    expect(presetRange('30d', '2026-11-19')).toEqual({ from: '2026-10-21', to: '2026-11-19' });
    expect(presetRange('month', '2026-11-19')).toEqual({ from: '2026-11-01', to: '2026-11-19' });
    expect(presetRange('all', '2026-11-19')).toEqual({});
  });

  it('recognises the active preset', () => {
    const t = '2026-11-19';
    expect(activePreset({}, t)).toBe('all');
    expect(activePreset(presetRange('30d', t), t)).toBe('30d');
    expect(activePreset({ from: '2026-11-02', to: t }, t)).toBeNull();
  });

  it('round-trips the filter through the URL, dropping invalid values', () => {
    expect(filterToQuery({})).toBe('');
    expect(filterToQuery({ from: '2026-11-01', result: 'win', currency: 'PHP' })).toBe(
      '?from=2026-11-01&result=win&currency=PHP',
    );
    expect(parseBetFilter({ from: '2026-11-01', result: ['loss', 'win'], book: 'Stake' })).toEqual({
      from: '2026-11-01',
      result: 'loss',
      book: 'Stake',
    });
    expect(parseBetFilter({ from: 'garbage', result: 'win', extra: 'x' })).toEqual({
      result: 'win',
    });
  });

  it('formats days and months', () => {
    expect(formatDay('2026-11-18')).toBe('Nov 18, 2026');
    expect(formatMonth('2026-11')).toBe('Nov 2026');
    expect(formatDay('nope')).toBe('nope');
  });
});
