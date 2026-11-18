import type { GameSummary } from '@blueline/contracts';
import { alias } from 'drizzle-orm/pg-core';
import { asc, eq, games, propMetrics, sql, teams, type Db } from '../index';

/** Slate games joined with both teams and a count of distinct (player, market) props. */
async function selectGames(db: Db, where: ReturnType<typeof eq>): Promise<GameSummary[]> {
  const home = alias(teams, 'home_team');
  const away = alias(teams, 'away_team');
  const rows = await db
    .select({
      g: games,
      home: { id: home.id, abbr: home.abbr, name: home.name },
      away: { id: away.id, abbr: away.abbr, name: away.name },
      propCount: sql<number>`(
        select count(distinct (${propMetrics.playerId}, ${propMetrics.market}))
        from ${propMetrics} where ${propMetrics.gameId} = ${games.id}
      )::int`,
    })
    .from(games)
    .innerJoin(home, eq(home.id, games.homeTeamId))
    .innerJoin(away, eq(away.id, games.awayTeamId))
    .where(where)
    .orderBy(asc(games.tipAt), asc(games.id));
  return rows.map(({ g, home: h, away: a, propCount }) => ({
    id: g.id,
    date: g.date,
    tipAt: g.tipAt.toISOString(),
    status: g.status,
    home: { ...h, score: g.homeScore },
    away: { ...a, score: g.awayScore },
    spread: g.spread,
    total: g.total,
    propCount: Number(propCount),
  }));
}

/** All games on a slate date (YYYY-MM-DD, America/New_York), by tip time. */
export function listGames(db: Db, dateYmd: string): Promise<GameSummary[]> {
  return selectGames(db, eq(games.date, dateYmd));
}

export async function getGameSummary(db: Db, gameId: string): Promise<GameSummary | null> {
  return (await selectGames(db, eq(games.id, gameId)))[0] ?? null;
}
