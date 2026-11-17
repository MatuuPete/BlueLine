import { MARKET_COMPONENTS, type Market, type Side } from '@blueline/contracts';

/** A game line for one player. Chronological input everywhere: oldest to newest. */
export interface LogLine {
  gameId: string;
  /** YYYY-MM-DD */
  date: string;
  season: number;
  oppTeamId: string;
  isHome: boolean;
  started: boolean;
  dnp: boolean;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  fg3m: number;
  stl: number;
  blk: number;
  tov: number;
}

export type GradeOutcome = 'hit' | 'miss' | 'push';

/** Value of a market for one game line (combos sum their components). */
export function statValue(l: LogLine, m: Market): number {
  let total = 0;
  for (const k of MARKET_COMPONENTS[m]) total += l[k];
  return total;
}

/** DNP and 0-minute games are not played (spec section 5). */
export function isPlayed(l: LogLine): boolean {
  return !l.dnp && l.minutes > 0;
}

export function gradeValue(v: number, line: number, side: Side): GradeOutcome {
  if (v === line) return 'push';
  const over = v > line;
  return over === (side === 'over') ? 'hit' : 'miss';
}

export function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}
