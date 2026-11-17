export function americanToDecimal(a: number): number {
  return a > 0 ? 1 + a / 100 : 1 + 100 / -a;
}

export function impliedProb(a: number): number {
  return 1 / americanToDecimal(a);
}

/** Two-way multiplicative devig using the same book's over and under. */
export function devigTwoWay(over: number, under: number): { over: number; under: number } {
  const po = impliedProb(over);
  const pu = impliedProb(under);
  const total = po + pu;
  return { over: po / total, under: pu / total };
}

/** Mean of per-book no-vig probabilities; null when no book has both sides. */
export function consensusNoVig(
  pairs: { over: number; under: number }[],
): { over: number; under: number } | null {
  if (pairs.length === 0) return null;
  let o = 0;
  let u = 0;
  for (const p of pairs) {
    const d = devigTwoWay(p.over, p.under);
    o += d.over;
    u += d.under;
  }
  return { over: o / pairs.length, under: u / pairs.length };
}

/** Highest American price is the best payout (+102 > -115, -105 > -110). First wins ties. */
export function bestPrice<T extends { price: number }>(offers: T[]): T | null {
  let best: T | null = null;
  for (const o of offers) {
    if (best === null || o.price > best.price) best = o;
  }
  return best;
}
