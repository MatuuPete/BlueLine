import { dvpRank, dvpTier, statValue, type LogLine } from '@blueline/analytics';
import { MARKETS, POSITIONS, STAT_KEYS, type Position, type StatKey } from '@blueline/contracts';
import {
  and,
  eq,
  games,
  gt,
  playerGameLogs,
  players,
  sql,
  teamDvp,
  type InferInsertModel,
} from '@blueline/db';
import type { Job, JobContext } from '../run-job';
import { chunk } from '../store';

/** The l15 window: a team's last 15 games. */
export const DVP_RECENT_GAMES = 15;

export const DVP_WINDOWS = ['l15', 'season'] as const;
export type DvpWindow = (typeof DVP_WINDOWS)[number];

type Totals = Record<StatKey, number>;

interface DefendedGame {
  gameId: string;
  tipAt: number;
  season: number;
  /** Stats allowed to opponents' players of each position (played lines only). */
  byPos: Partial<Record<Position, Totals>>;
}

const ZERO: Totals = { pts: 0, reb: 0, ast: 0, fg3m: 0, stl: 0, blk: 0, tov: 0 };

/** A position's totals in one game, shaped as a LogLine so analytics `statValue` can sum markets. */
function asLine(t: Totals): LogLine {
  return {
    gameId: '',
    date: '',
    season: 0,
    oppTeamId: '',
    isHome: false,
    started: false,
    dnp: false,
    minutes: 1,
    ...t,
  };
}

export interface DvpResult {
  rows: number;
  teams: number;
  season: number | null;
}

/**
 * Rebuilds `team_dvp`: per defending team, position (G/F/C) and market, the stat
 * allowed per game to opponents' players of that position (DNP and 0-minute
 * lines excluded; a game where nobody of the position played counts as 0),
 * over the team's last 15 games (`l15`) and the current season (`season`, the
 * latest season with final games). Ranked across teams with analytics `dvpRank`
 * (1 = toughest) and tiered with `dvpTier`. Idempotent: the table is replaced.
 */
export async function computeDvp(ctx: JobContext): Promise<DvpResult> {
  const sum = (c: (typeof playerGameLogs)[StatKey]) => sql<number>`sum(${c})`.mapWith(Number);
  const agg = await ctx.db
    .select({
      teamId: playerGameLogs.oppTeamId,
      gameId: playerGameLogs.gameId,
      tipAt: games.tipAt,
      season: games.season,
      position: players.position,
      pts: sum(playerGameLogs.pts),
      reb: sum(playerGameLogs.reb),
      ast: sum(playerGameLogs.ast),
      fg3m: sum(playerGameLogs.fg3m),
      stl: sum(playerGameLogs.stl),
      blk: sum(playerGameLogs.blk),
      tov: sum(playerGameLogs.tov),
    })
    .from(playerGameLogs)
    .innerJoin(games, eq(games.id, playerGameLogs.gameId))
    .innerJoin(players, eq(players.id, playerGameLogs.playerId))
    .where(
      and(eq(games.status, 'final'), eq(playerGameLogs.dnp, false), gt(playerGameLogs.minutes, 0)),
    )
    .groupBy(
      playerGameLogs.oppTeamId,
      playerGameLogs.gameId,
      games.tipAt,
      games.season,
      players.position,
    );

  const byTeam = new Map<string, Map<string, DefendedGame>>();
  let season: number | null = null;
  for (const r of agg) {
    let teamGames = byTeam.get(r.teamId);
    if (!teamGames) byTeam.set(r.teamId, (teamGames = new Map()));
    let g = teamGames.get(r.gameId);
    if (!g) {
      g = { gameId: r.gameId, tipAt: r.tipAt.getTime(), season: r.season, byPos: {} };
      teamGames.set(r.gameId, g);
    }
    const totals = { ...ZERO };
    for (const k of STAT_KEYS) totals[k] = r[k];
    g.byPos[r.position] = totals;
    if (season === null || r.season > season) season = r.season;
  }

  // allowed[window][position][market] = [{ teamId, allowedPerGame }]
  type Allowed = { teamId: string; allowedPerGame: number };
  const allowed = new Map<string, Allowed[]>();
  const keyOf = (w: DvpWindow, p: Position, m: string) => `${w}|${p}|${m}`;
  for (const [teamId, teamGames] of byTeam) {
    const recentFirst = [...teamGames.values()].sort(
      (a, b) => b.tipAt - a.tipAt || (a.gameId < b.gameId ? 1 : -1),
    );
    const windows: Record<DvpWindow, DefendedGame[]> = {
      l15: recentFirst.slice(0, DVP_RECENT_GAMES),
      season: recentFirst.filter((g) => g.season === season),
    };
    for (const w of DVP_WINDOWS) {
      const list = windows[w];
      if (list.length === 0) continue;
      for (const p of POSITIONS) {
        const lines = list.map((g) => asLine(g.byPos[p] ?? ZERO));
        for (const m of MARKETS) {
          let total = 0;
          for (const l of lines) total += statValue(l, m);
          const k = keyOf(w, p, m);
          const arr = allowed.get(k) ?? [];
          arr.push({ teamId, allowedPerGame: total / lines.length });
          allowed.set(k, arr);
        }
      }
    }
  }

  const rows: InferInsertModel<typeof teamDvp>[] = [];
  for (const w of DVP_WINDOWS) {
    for (const p of POSITIONS) {
      for (const m of MARKETS) {
        const list = allowed.get(keyOf(w, p, m));
        if (!list) continue;
        const ranks = dvpRank(list);
        for (const a of list) {
          const rank = ranks.get(a.teamId)!;
          rows.push({
            teamId: a.teamId,
            position: p,
            market: m,
            window: w,
            allowedPerGame: a.allowedPerGame,
            rank,
            tier: dvpTier(rank),
            computedAt: ctx.now,
          });
        }
      }
    }
  }

  await ctx.db.transaction(async (tx) => {
    await tx.delete(teamDvp);
    for (const part of chunk(rows, 1000)) await tx.insert(teamDvp).values(part);
  });
  return { rows: rows.length, teams: byTeam.size, season };
}

/** dvp: rebuild `team_dvp` from the box scores. */
export const dvp: Job = async (ctx) => {
  const res = await computeDvp(ctx);
  return { meta: { ...res } };
};
