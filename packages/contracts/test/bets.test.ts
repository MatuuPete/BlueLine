import { describe, expect, it } from 'vitest';
import {
  americanToDecimal,
  BetFilterSchema,
  BetInputSchema,
  BetUpdateSchema,
  cashoutError,
  computePayout,
  decimalToAmerican,
  formatMoney,
  formatSignedMoney,
  formatSignedPercent,
  outcome,
  primaryCurrency,
  profit,
  summarizeBets,
  summarizeByCurrency,
  winPayout,
  type BetLike,
} from '../src';

const bet = (o: Partial<BetLike> & { n?: number }): BetLike => ({
  id: `b${o.n ?? 0}`,
  placedOn: '2026-11-01',
  createdAt: `2026-11-01T00:00:0${o.n ?? 0}Z`,
  book: 'Stake',
  oddsDecimal: 2,
  stake: 100,
  result: 'pending',
  payout: null,
  currency: 'PHP',
  ...o,
});

describe('odds conversion', () => {
  it('converts American to decimal', () => {
    expect(americanToDecimal(150)).toBe(2.5);
    expect(americanToDecimal(-120)).toBe(1.833);
    expect(americanToDecimal(100)).toBe(2);
    expect(americanToDecimal(-110)).toBe(1.909);
  });
  it('converts decimal to American', () => {
    expect(decimalToAmerican(2.5)).toBe(150);
    expect(decimalToAmerican(1.833)).toBe(-120);
    expect(decimalToAmerican(2)).toBe(100);
  });
});

describe('payout', () => {
  it('computes by result', () => {
    const base = { stake: 365, oddsDecimal: 1.8 };
    expect(computePayout({ ...base, result: 'win' })).toBe(657);
    expect(computePayout({ ...base, result: 'loss' })).toBe(0);
    expect(computePayout({ ...base, result: 'push' })).toBe(365);
    expect(computePayout({ ...base, result: 'void' })).toBe(365);
    expect(computePayout({ ...base, result: 'pending' })).toBeNull();
    expect(computePayout({ ...base, result: 'cashout', cashout: 400 })).toBe(400);
    expect(computePayout({ ...base, result: 'cashout' })).toBeNull();
  });
  it('is cent-exact on half cents', () => {
    expect(winPayout(10.01, 1.5)).toBe(15.02);
    expect(winPayout(1.15, 3)).toBe(3.45);
  });
  it('validates cash-out bounds', () => {
    expect(cashoutError(100, 2, 150)).toBeNull();
    expect(cashoutError(100, 2, 0)).toBeNull();
    expect(cashoutError(100, 2, 200)).toBeNull();
    expect(cashoutError(100, 2, 200.01)).toMatch(/more than/);
    expect(cashoutError(100, 2, -1)).toMatch(/negative/);
    expect(cashoutError(100, 2, null)).toMatch(/Enter/);
  });
});

describe('profit and outcome', () => {
  it('excludes pending', () => {
    expect(profit({ stake: 10, result: 'pending', payout: null })).toBeNull();
    expect(profit({ stake: 10, result: 'win', payout: 25 })).toBe(15);
    expect(profit({ stake: 10, result: 'push', payout: 10 })).toBe(0);
  });
  it('classifies cash-outs', () => {
    expect(outcome({ stake: 100, result: 'cashout', payout: 120 })).toBe('win');
    expect(outcome({ stake: 100, result: 'cashout', payout: 40 })).toBe('loss');
    expect(outcome({ stake: 100, result: 'cashout', payout: 100 })).toBe('push');
  });
});

describe('summarizeBets', () => {
  it('handles an empty list', () => {
    const s = summarizeBets([]);
    expect(s).toMatchObject({ settled: 0, net: 0, roi: null, winRate: null, streak: null });
    expect(s.series).toEqual([]);
  });

  it('summarizes a mixed set', () => {
    const s = summarizeBets([
      bet({ n: 1, result: 'win', payout: 200, placedOn: '2026-10-30' }),
      bet({ n: 2, result: 'loss', payout: 0, placedOn: '2026-11-02', book: 'FanDuel' }),
      bet({ n: 3, result: 'push', payout: 100, placedOn: '2026-11-03' }),
      bet({ n: 4, result: 'void', payout: 100, placedOn: '2026-11-04' }),
      bet({ n: 5, result: 'cashout', payout: 150, placedOn: '2026-11-05' }),
      bet({ n: 6, result: 'pending', placedOn: '2026-11-06' }),
    ]);
    expect(s.settled).toBe(5);
    expect(s.pending).toBe(1);
    expect([s.wins, s.losses, s.pushes, s.voids]).toEqual([2, 1, 1, 1]);
    expect(s.staked).toBe(500);
    expect(s.returned).toBe(550);
    expect(s.net).toBe(50);
    expect(s.roi).toBeCloseTo(0.1);
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(s.avgOdds).toBe(2);
    expect(s.biggestWin).toEqual({ id: 'b1', amount: 100 });
    expect(s.biggestLoss).toEqual({ id: 'b2', amount: -100 });
    expect(s.series.map((p) => p.cumulative)).toEqual([100, 0, 0, 0, 50]);
    expect(s.byBook.map((g) => g.key)).toEqual(['Stake', 'FanDuel']);
    expect(s.byMonth.map((g) => [g.key, g.bets, g.net])).toEqual([
      ['2026-10', 1, 100],
      ['2026-11', 4, -50],
    ]);
  });

  it('orders ties on placed_on by created_at', () => {
    const s = summarizeBets([
      bet({ n: 2, result: 'loss', payout: 0 }),
      bet({ n: 1, result: 'win', payout: 200 }),
    ]);
    expect(s.series.map((p) => p.id)).toEqual(['b1', 'b2']);
    expect(s.series.map((p) => p.cumulative)).toEqual([100, 0]);
  });

  it('counts the current streak, skipping pushes and voids', () => {
    const s = summarizeBets([
      bet({ n: 1, placedOn: '2026-11-01', result: 'loss', payout: 0 }),
      bet({ n: 2, placedOn: '2026-11-02', result: 'win', payout: 200 }),
      bet({ n: 3, placedOn: '2026-11-03', result: 'push', payout: 100 }),
      bet({ n: 4, placedOn: '2026-11-04', result: 'win', payout: 200 }),
    ]);
    expect(s.streak).toEqual({ type: 'win', count: 2 });
    const l = summarizeBets([
      bet({ n: 1, result: 'win', payout: 200 }),
      bet({ n: 2, placedOn: '2026-11-02', result: 'cashout', payout: 30 }),
    ]);
    expect(l.streak).toEqual({ type: 'loss', count: 1 });
  });

  it('has null ROI when nothing was staked and null win rate with only pushes', () => {
    const s = summarizeBets([bet({ n: 1, result: 'push', payout: 100 })]);
    expect(s.winRate).toBeNull();
    expect(s.roi).toBe(0);
    expect(summarizeBets([bet({ n: 1 })]).roi).toBeNull();
  });

  it('keeps currencies apart', () => {
    const by = summarizeByCurrency([
      bet({ n: 1, result: 'win', payout: 200 }),
      bet({ n: 2, result: 'loss', payout: 0, currency: 'USD', stake: 10 }),
    ]);
    expect(by.PHP!.net).toBe(100);
    expect(by.USD!.net).toBe(-10);
    expect(Object.keys(by).sort()).toEqual(['PHP', 'USD']);
  });

  it('picks the most-used currency, PHP on ties and when empty', () => {
    expect(primaryCurrency([])).toBe('PHP');
    expect(
      primaryCurrency([
        { currency: 'USD', bets: 3 },
        { currency: 'PHP', bets: 2 },
      ]),
    ).toBe('USD');
    expect(
      primaryCurrency([
        { currency: 'USD', bets: 2 },
        { currency: 'PHP', bets: 2 },
      ]),
    ).toBe('PHP');
  });
});

describe('money formatting', () => {
  it('formats pesos with signs that are text', () => {
    expect(formatMoney(657, 'PHP')).toBe('₱657.00');
    expect(formatMoney(-12.5, 'PHP')).toBe('−₱12.50');
    expect(formatSignedMoney(292, 'PHP')).toBe('+₱292.00');
    expect(formatSignedMoney(-292, 'PHP')).toBe('−₱292.00');
    expect(formatSignedMoney(0, 'PHP')).toBe('₱0.00');
    expect(formatSignedMoney(5, 'USD')).toBe('+$5.00');
    expect(formatSignedPercent(0.1234)).toBe('+12.3%');
    expect(formatSignedPercent(null)).toBe('—');
  });
});

const valid = {
  placedOn: '2026-11-18',
  book: ' Stake ',
  description: ' Over 61.5 · 3rd Quarter Total ',
  odds: { decimal: 1.8 },
  stake: 365,
};

describe('BetInputSchema', () => {
  it('trims, applies defaults and accepts decimal odds', () => {
    const r = BetInputSchema.parse(valid);
    expect(r).toMatchObject({
      book: 'Stake',
      description: 'Over 61.5 · 3rd Quarter Total',
      sport: 'NBA',
      betType: 'single',
      legs: 1,
      currency: 'PHP',
      result: 'pending',
      oddsDecimal: 1.8,
      event: null,
      notes: null,
      payout: null,
    });
  });
  it('accepts American odds', () => {
    expect(BetInputSchema.parse({ ...valid, odds: { american: -120 } }).oddsDecimal).toBe(1.833);
    expect(BetInputSchema.parse({ ...valid, odds: { american: 150 } }).oddsDecimal).toBe(2.5);
  });
  it('rejects bad input', () => {
    for (const bad of [
      { ...valid, extra: 1 },
      { ...valid, stake: 0 },
      { ...valid, odds: { decimal: 1 } },
      { ...valid, odds: { decimal: 1001 } },
      { ...valid, odds: { american: 50 } },
      { ...valid, legs: 21 },
      { ...valid, book: '' },
      { ...valid, book: 'x'.repeat(41) },
      { ...valid, description: 'x'.repeat(161) },
      { ...valid, notes: 'x'.repeat(501) },
      { ...valid, placedOn: '2026-02-30' },
      { ...valid, result: 'won' },
      { ...valid, result: 'cashout' },
      { ...valid, result: 'cashout', payout: 999 },
    ]) {
      expect(BetInputSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
  it('accepts a valid cash-out and upper-cases currency', () => {
    const r = BetInputSchema.parse({ ...valid, result: 'cashout', payout: 300, currency: 'usd' });
    expect(r.payout).toBe(300);
    expect(r.currency).toBe('USD');
  });
});

describe('BetUpdateSchema and BetFilterSchema', () => {
  it('is partial but not empty', () => {
    expect(BetUpdateSchema.parse({ result: 'win' })).toEqual({ result: 'win' });
    expect(BetUpdateSchema.parse({ odds: { american: 150 } })).toEqual({ oddsDecimal: 2.5 });
    expect(BetUpdateSchema.safeParse({}).success).toBe(false);
    expect(BetUpdateSchema.safeParse({ nope: 1 }).success).toBe(false);
  });
  it('parses filters', () => {
    expect(BetFilterSchema.parse({ from: '2026-11-01', result: 'win', currency: 'PHP' })).toEqual({
      from: '2026-11-01',
      result: 'win',
      currency: 'PHP',
    });
    expect(BetFilterSchema.safeParse({ from: 'nope' }).success).toBe(false);
  });
});
