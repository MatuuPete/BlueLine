import { DEFAULT_BOARD_FILTER } from '@blueline/contracts';
import { describe, expect, it } from 'vitest';
import { filterFromRecord } from '../lib/board-params';
import { shouldShowIntro } from '../lib/intro';
import { parseTheme, themeCookie, THEME_SCRIPT } from '../lib/theme';
import { monogram, shortDate, slateLabel, tipClockET, tipTimeET } from '../lib/time';

describe('filterFromRecord (R11 for server pages)', () => {
  it('strips unknown keys and parses known ones', () => {
    const f = filterFromRecord({ markets: 'PTS', utm_source: 'x', minHitRate: '70' });
    expect(f.markets).toEqual(['PTS']);
    expect(f.minHitRate).toBe(70);
  });
  it('joins repeated values', () => {
    expect(filterFromRecord({ teams: ['BOS', 'NYK'] }).teams).toEqual(['BOS', 'NYK']);
  });
  it('falls back to the default on invalid input', () => {
    expect(filterFromRecord({ minHitRate: 'abc' })).toEqual(DEFAULT_BOARD_FILTER);
    expect(filterFromRecord({ side: 'sideways' })).toEqual(DEFAULT_BOARD_FILTER);
  });
});

describe('shouldShowIntro', () => {
  it('first visit shows the intro', () => {
    expect(shouldShowIntro({ seenIntro: false, skipIntro: false })).toBe(true);
  });
  it('the seen_intro cookie or the skipIntro setting skips it', () => {
    expect(shouldShowIntro({ seenIntro: true, skipIntro: false })).toBe(false);
    expect(shouldShowIntro({ seenIntro: false, skipIntro: true })).toBe(false);
  });
});

describe('theme cookie', () => {
  it('accepts only light and dark', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('system')).toBeNull();
    expect(parseTheme(undefined)).toBeNull();
    expect(parseTheme('<script>')).toBeNull();
  });
  it('writes a one-year SameSite=Lax cookie', () => {
    expect(themeCookie('dark')).toBe('theme=dark; Path=/; Max-Age=31536000; SameSite=Lax');
    expect(themeCookie(null)).toBe('theme=; Path=/; Max-Age=0; SameSite=Lax');
  });
  it('the pre-paint script only fills data-theme when the server left it empty', () => {
    expect(THEME_SCRIPT).toContain('prefers-color-scheme: dark');
    expect(THEME_SCRIPT).toContain('dataset.theme');
  });
});

describe('time and name helpers', () => {
  it('tip time in Eastern', () => {
    expect(tipTimeET('2026-11-19T00:30:00.000Z')).toBe('7:30 PM ET');
  });
  it('clock time for the intro slate', () => {
    expect(tipClockET('2026-11-19T00:30:00.000Z')).toBe('7:30');
  });
  it('short and long dates from YYYY-MM-DD', () => {
    expect(shortDate('2026-11-16')).toBe('Nov 16');
    expect(slateLabel('2026-11-18')).toBe('Wednesday, November 18');
  });
  it('monograms', () => {
    expect(monogram('Marcus Dell')).toBe('MD');
    expect(monogram('Nene')).toBe('NE');
    expect(monogram('Karl-Anthony Towns Jr.')).toBe('KT');
  });
});
