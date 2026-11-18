// Box-score rows as analytics `LogLine`s, loaded in batches.
import type { LogLine } from '@blueline/analytics';
import { and, asc, eq, games, inArray, playerGameLogs, type Db, type SQL } from '@blueline/db';
import { chunk } from './store';

/** A `LogLine` plus the columns the worker needs beyond analytics. */
export interface LogRow extends LogLine {
  playerId: string;
  teamId: string;
  tipAt: Date;
  usageProxy: number | null;
}

const logColumns = {
  playerId: playerGameLogs.playerId,
  gameId: playerGameLogs.gameId,
  teamId: playerGameLogs.teamId,
  oppTeamId: playerGameLogs.oppTeamId,
  isHome: playerGameLogs.isHome,
  started: playerGameLogs.started,
  dnp: playerGameLogs.dnp,
  minutes: playerGameLogs.minutes,
  pts: playerGameLogs.pts,
  reb: playerGameLogs.reb,
  ast: playerGameLogs.ast,
  fg3m: playerGameLogs.fg3m,
  stl: playerGameLogs.stl,
  blk: playerGameLogs.blk,
  tov: playerGameLogs.tov,
  usageProxy: playerGameLogs.usageProxy,
  date: games.date,
  season: games.season,
  tipAt: games.tipAt,
};

async function select(db: Db, where: SQL | undefined): Promise<LogRow[]> {
  return db
    .select(logColumns)
    .from(playerGameLogs)
    .innerJoin(games, eq(games.id, playerGameLogs.gameId))
    .where(where)
    .orderBy(asc(games.tipAt), asc(playerGameLogs.gameId));
}

/** Each player's logs from final games, oldest → newest. */
export async function loadPlayerLogs(
  db: Db,
  playerIds: readonly string[],
): Promise<Map<string, LogRow[]>> {
  const out = new Map<string, LogRow[]>();
  for (const part of chunk([...new Set(playerIds)], 500)) {
    const rows = await select(
      db,
      and(inArray(playerGameLogs.playerId, part), eq(games.status, 'final')),
    );
    for (const r of rows) {
      const list = out.get(r.playerId);
      if (list) list.push(r);
      else out.set(r.playerId, [r]);
    }
  }
  return out;
}

/** Every log of the given games. */
export async function loadGameLogs(db: Db, gameIds: readonly string[]): Promise<LogRow[]> {
  const out: LogRow[] = [];
  for (const part of chunk([...new Set(gameIds)], 500)) {
    out.push(...(await select(db, inArray(playerGameLogs.gameId, part))));
  }
  return out;
}
