import { isPlayed, type LogLine } from './stats';

const DAY_MS = 86_400_000;

function dayNumber(d: string): number {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day) / DAY_MS;
}

/** Days of rest between games; the day after = 0 (back-to-back). Null with no previous game. */
export function restDays(prevGameDate: string | null, gameDate: string): number | null {
  if (prevGameDate === null) return null;
  return Math.max(0, dayNumber(gameDate) - dayNumber(prevGameDate) - 1);
}

/** Splits played games by whether the teammate played (gameId in the set). */
export function splitByTeammate(
  logs: LogLine[],
  teammatePlayed: Set<string>,
): { with: LogLine[]; without: LogLine[] } {
  const withT: LogLine[] = [];
  const withoutT: LogLine[] = [];
  for (const l of logs) {
    if (!isPlayed(l)) continue;
    (teammatePlayed.has(l.gameId) ? withT : withoutT).push(l);
  }
  return { with: withT, without: withoutT };
}
