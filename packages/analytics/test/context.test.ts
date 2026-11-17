import { describe, expect, it } from 'vitest';
import { restDays, splitByTeammate } from '../src/context';
import { dnp, line } from './fixtures';

describe('restDays', () => {
  it('back-to-back is 0', () => expect(restDays('2026-11-07', '2026-11-08')).toBe(0));
  it('one day off is 1', () => expect(restDays('2026-11-16', '2026-11-18')).toBe(1));
  it('no previous game is null', () => expect(restDays(null, '2026-11-18')).toBeNull());
  it('crosses month boundaries', () => expect(restDays('2026-10-31', '2026-11-02')).toBe(1));
  it('same date clamps to 0', () => expect(restDays('2026-11-08', '2026-11-08')).toBe(0));
});

describe('splitByTeammate', () => {
  it('splits played games by teammate presence and ignores DNPs', () => {
    const a = line({ gameId: 'a' });
    const b = line({ gameId: 'b' });
    const c = dnp({ gameId: 'c' });
    const out = splitByTeammate([a, b, c], new Set(['a', 'c']));
    expect(out.with).toEqual([a]);
    expect(out.without).toEqual([b]);
  });
});
