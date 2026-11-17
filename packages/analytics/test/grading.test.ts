import { describe, expect, it } from 'vitest';
import { gradeLeg } from '../src/grading';
import { dnp, line } from './fixtures';

const leg = { market: 'PTS', line: 25, side: 'over' } as const;

describe('gradeLeg', () => {
  it('hit / miss', () => {
    expect(gradeLeg(leg, line({ pts: 30 }), 'final')).toBe('hit');
    expect(gradeLeg(leg, line({ pts: 20 }), 'final')).toBe('miss');
    expect(gradeLeg({ ...leg, side: 'under' }, line({ pts: 20 }), 'final')).toBe('hit');
  });
  it('push on an exact whole line', () => {
    expect(gradeLeg(leg, line({ pts: 25 }), 'final')).toBe('push');
  });
  it('combo market uses summed stats', () => {
    expect(gradeLeg({ ...leg, market: 'PRA', line: 30.5 }, line({ pts: 20, reb: 6, ast: 5 }), 'final')).toBe(
      'hit',
    );
  });
  it('void for a DNP, 0 minutes, or missing box on a final game', () => {
    expect(gradeLeg(leg, dnp(), 'final')).toBe('void');
    expect(gradeLeg(leg, line({ minutes: 0, pts: 30 }), 'final')).toBe('void');
    expect(gradeLeg(leg, null, 'final')).toBe('void');
  });
  it('void when postponed or canceled', () => {
    expect(gradeLeg(leg, line({ pts: 30 }), 'postponed')).toBe('void');
    expect(gradeLeg(leg, null, 'canceled')).toBe('void');
  });
  it('pending until final', () => {
    expect(gradeLeg(leg, null, 'scheduled')).toBe('pending');
    expect(gradeLeg(leg, line({ pts: 30 }), 'in_progress')).toBe('pending');
  });
});
