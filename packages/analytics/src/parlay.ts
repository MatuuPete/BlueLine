import type { Side } from '@blueline/contracts';
import { americanToDecimal } from './odds';
import { gradeValue } from './stats';

export function parlay(legs: { price: number }[]): { decimal: number; american: number } {
  const decimal = legs.reduce((acc, l) => acc * americanToDecimal(l.price), 1);
  const american = decimal >= 2 ? (decimal - 1) * 100 : -100 / (decimal - 1);
  return { decimal, american };
}

/**
 * Share of games (present in every leg) where all legs hit. A game where any leg
 * pushes is excluded from n, like a push on a single leg.
 */
export function jointHitRate(legs: { values: Map<string, number>; line: number; side: Side }[]): {
  hits: number;
  n: number;
  rate: number | null;
} {
  const first = legs[0];
  if (!first) return { hits: 0, n: 0, rate: null };
  let hits = 0;
  let n = 0;
  for (const gameId of first.values.keys()) {
    if (!legs.every((l) => l.values.has(gameId))) continue;
    const grades = legs.map((l) => gradeValue(l.values.get(gameId) as number, l.line, l.side));
    if (grades.includes('push')) continue;
    n++;
    if (grades.every((g) => g === 'hit')) hits++;
  }
  return { hits, n, rate: n === 0 ? null : hits / n };
}
