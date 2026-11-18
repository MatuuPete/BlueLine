import type { Market, Side, Window } from '@blueline/contracts';
import { WINDOWS } from '@blueline/contracts';
import { gradeValue, isPlayed, mean, median, statValue, type LogLine } from './stats';

export interface HitRate {
  hits: number;
  misses: number;
  pushes: number;
  n: number;
  rate: number | null;
}

/** Pushes are excluded from `n`; DNP / 0-minute games are excluded entirely. */
export function hitRate(logs: LogLine[], m: Market, line: number, side: Side): HitRate {
  let hits = 0;
  let misses = 0;
  let pushes = 0;
  for (const l of logs) {
    if (!isPlayed(l)) continue;
    const g = gradeValue(statValue(l, m), line, side);
    if (g === 'hit') hits++;
    else if (g === 'miss') misses++;
    else pushes++;
  }
  const n = hits + misses;
  return { hits, misses, pushes, n, rate: n === 0 ? null : hits / n };
}

export interface WindowCtx {
  oppTeamId: string;
  season: number;
}

/**
 * Played games only. l5/l10/l20 = last N played; season = current season;
 * h2h = vs the opponent in the current and previous season; lastSeason = previous season.
 */
export function selectWindow(logs: LogLine[], w: Window, ctx: WindowCtx): LogLine[] {
  const played = logs.filter(isPlayed);
  switch (w) {
    case 'l5':
      return played.slice(-5);
    case 'l10':
      return played.slice(-10);
    case 'l20':
      return played.slice(-20);
    case 'season':
      return played.filter((l) => l.season === ctx.season);
    case 'h2h':
      return played.filter(
        (l) =>
          l.oppTeamId === ctx.oppTeamId && (l.season === ctx.season || l.season === ctx.season - 1),
      );
    case 'lastSeason':
      return played.filter((l) => l.season === ctx.season - 1);
  }
}

export function allWindows(
  logs: LogLine[],
  m: Market,
  line: number,
  side: Side,
  ctx: WindowCtx,
): Record<Window, HitRate> {
  const out = {} as Record<Window, HitRate>;
  for (const w of WINDOWS) out[w] = hitRate(selectWindow(logs, w, ctx), m, line, side);
  return out;
}

export interface Edge {
  avg: number | null;
  median: number | null;
  edgeAvg: number | null;
  edgeMedian: number | null;
}

/** avg/median over the last n played games; edge = value - line, sign flipped for Unders. */
export function edge(logs: LogLine[], m: Market, line: number, side: Side, n = 10): Edge {
  const vals = logs
    .filter(isPlayed)
    .slice(-n)
    .map((l) => statValue(l, m));
  const avg = mean(vals);
  const med = median(vals);
  const sign = side === 'over' ? 1 : -1;
  return {
    avg,
    median: med,
    edgeAvg: avg === null || med === null ? null : sign * (avg - line),
    edgeMedian: avg === null || med === null ? null : sign * (med - line),
  };
}

/** +k consecutive latest hits, -k misses; pushes skipped; DNPs ignored. */
export function streak(logs: LogLine[], m: Market, line: number, side: Side): number {
  let dir = 0;
  let count = 0;
  for (let i = logs.length - 1; i >= 0; i--) {
    const l = logs[i] as LogLine;
    if (!isPlayed(l)) continue;
    const g = gradeValue(statValue(l, m), line, side);
    if (g === 'push') continue;
    const d = g === 'hit' ? 1 : -1;
    if (dir === 0) dir = d;
    else if (d !== dir) break;
    count++;
  }
  return dir * count;
}
