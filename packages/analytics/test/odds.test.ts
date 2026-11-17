import { describe, expect, it } from 'vitest';
import { americanToDecimal, bestPrice, consensusNoVig, devigTwoWay, impliedProb } from '../src/odds';

describe('conversions', () => {
  it('americanToDecimal', () => {
    expect(americanToDecimal(100)).toBe(2);
    expect(americanToDecimal(150)).toBeCloseTo(2.5);
    expect(americanToDecimal(-110)).toBeCloseTo(1.9091, 4);
  });
  it('impliedProb', () => {
    expect(impliedProb(-110)).toBeCloseTo(0.5238, 4);
    expect(impliedProb(100)).toBe(0.5);
  });
});

describe('devigTwoWay', () => {
  it('-110/-110 is 50/50', () => {
    const d = devigTwoWay(-110, -110);
    expect(d.over).toBeCloseTo(0.5, 10);
    expect(d.under).toBeCloseTo(0.5, 10);
  });
  it('-120/+100 (multiplicative: 0.5455 / 1.0455)', () => {
    const d = devigTwoWay(-120, 100);
    expect(d.over).toBeCloseTo(0.5217, 4);
    expect(d.over + d.under).toBeCloseTo(1, 10);
  });
});

describe('consensusNoVig', () => {
  it('null for no pairs', () => expect(consensusNoVig([])).toBeNull());
  it('means the no-vig probabilities', () => {
    const c = consensusNoVig([
      { over: -110, under: -110 },
      { over: -120, under: 100 },
    ]);
    expect(c?.over).toBeCloseTo((0.5 + 0.52174) / 2, 4);
    expect((c?.over ?? 0) + (c?.under ?? 0)).toBeCloseTo(1, 10);
  });
});

describe('bestPrice', () => {
  it('plus money beats minus', () => {
    expect(bestPrice([{ price: -115 }, { price: -120 }, { price: 102 }])).toEqual({ price: 102 });
  });
  it('least negative wins', () => {
    expect(bestPrice([{ price: -105 }, { price: -110 }])).toEqual({ price: -105 });
  });
  it('keeps extra fields and the first on ties', () => {
    const r = bestPrice([
      { price: -110, book: 'a' },
      { price: -110, book: 'b' },
    ]);
    expect(r?.book).toBe('a');
  });
  it('empty is null', () => expect(bestPrice([])).toBeNull());
});
