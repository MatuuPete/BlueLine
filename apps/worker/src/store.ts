// Idempotent writes of normalized provider data. Every upsert is keyed by our
// internal ids, so re-running a job rewrites the same rows instead of adding more.
import type { NormBoxScore, NormGame, NormPlayer, NormTeam } from '@blueline/contracts';
import {
  games,
  getTableColumns,
  playerGameLogs,
  players,
  sql,
  teams,
  type Db,
  type SQL,
} from '@blueline/db';
import { gameIdOf, playerIdOf, teamIdOf } from './ids';
import type { JobContext } from './run-job';

/** `SET col = excluded.col` for the given columns of an insert … on conflict. */
export function excluded<C extends Record<string, { name: string }>, K extends keyof C & string>(
  cols: C,
  keys: readonly K[],
): Record<K, SQL> {
  const out = {} as Record<K, SQL>;
  for (const k of keys) out[k] = sql.raw(`excluded."${cols[k]!.name}"`);
  return out;
}

export function chunk<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

export interface TeamRef {
  id: string;
  abbr: string;
}

/** ESPN team id → our team. */
export type TeamsByEspn = Map<string, TeamRef>;

export async function upsertTeams(db: Db, list: NormTeam[]): Promise<number> {
  if (list.length === 0) return 0;
  await db
    .insert(teams)
    .values(
      list.map((t) => ({ id: teamIdOf(t.abbr), abbr: t.abbr, name: t.name, espnId: t.externalId })),
    )
    .onConflictDoUpdate({
      target: teams.id,
      set: excluded(getTableColumns(teams), ['abbr', 'name', 'espnId']),
    });
  return list.length;
}

export async function loadTeams(db: Db): Promise<TeamsByEspn> {
  const rows = await db
    .select({ id: teams.id, abbr: teams.abbr, espnId: teams.espnId })
    .from(teams);
  return new Map(rows.filter((r) => r.espnId).map((r) => [r.espnId!, { id: r.id, abbr: r.abbr }]));
}

/** Our teams by ESPN id, fetching the team list first if any id is unknown. */
export async function ensureTeams(
  ctx: JobContext,
  espnIds: Iterable<string>,
): Promise<TeamsByEspn> {
  let map = await loadTeams(ctx.db);
  if ([...espnIds].some((id) => !map.has(id))) {
    await upsertTeams(ctx.db, await ctx.stats.getTeams());
    map = await loadTeams(ctx.db);
  }
  return map;
}

function team(map: TeamsByEspn, espnId: string): TeamRef {
  const t = map.get(espnId);
  if (!t) throw new Error(`Unknown ESPN team id ${espnId}`);
  return t;
}

export async function upsertGames(db: Db, list: NormGame[], map: TeamsByEspn): Promise<number> {
  if (list.length === 0) return 0;
  await db
    .insert(games)
    .values(
      list.map((g) => ({
        id: gameIdOf(g.externalId),
        espnId: g.externalId,
        season: g.season,
        date: g.date,
        tipAt: new Date(g.tipAt),
        homeTeamId: team(map, g.homeTeamExternalId).id,
        awayTeamId: team(map, g.awayTeamExternalId).id,
        status: g.status,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
      })),
    )
    .onConflictDoUpdate({
      target: games.id,
      set: excluded(getTableColumns(games), [
        'espnId',
        'season',
        'date',
        'tipAt',
        'homeTeamId',
        'awayTeamId',
        'status',
        'homeScore',
        'awayScore',
      ]),
    });
  return list.length;
}

/** Rosters are authoritative for a player's current team, position and status. */
export async function upsertRosterPlayers(
  db: Db,
  list: NormPlayer[],
  map: TeamsByEspn,
): Promise<number> {
  for (const part of chunk(list, 500)) {
    await db
      .insert(players)
      .values(
        part.map((p) => ({
          id: playerIdOf(p.externalId),
          espnId: p.externalId,
          name: p.name,
          teamId: map.get(p.teamExternalId)?.id ?? null,
          position: p.position,
          active: p.active,
        })),
      )
      .onConflictDoUpdate({
        target: players.id,
        set: excluded(getTableColumns(players), ['name', 'teamId', 'position', 'active']),
      });
  }
  return list.length;
}

/**
 * Usage rate (0..1): the share of team possessions a player used while on the
 * floor. (FGA + 0.44·FTA + TOV) · (team minutes / 5) / (minutes · team possessions).
 */
export function usageProxy(
  line: { minutes: number; fga: number; fta: number; tov: number; dnp: boolean },
  team: { minutes: number; poss: number },
): number | null {
  if (line.dnp || line.minutes <= 0 || team.poss <= 0) return null;
  const used = line.fga + 0.44 * line.fta + line.tov;
  const u = (used * (team.minutes / 5)) / (line.minutes * team.poss);
  return Math.round(Math.min(1, Math.max(0, u)) * 10000) / 10000;
}

/**
 * Write one finished game: the game row, any players not seen before (box-score
 * players never change an existing player's team), and one log per player.
 */
export async function upsertBoxScore(db: Db, box: NormBoxScore, map: TeamsByEspn): Promise<number> {
  await upsertGames(db, [box.game], map);
  const gameId = gameIdOf(box.game.externalId);
  const home = box.game.homeTeamExternalId;
  const away = box.game.awayTeamExternalId;

  const newPlayers = box.lines.map((l) => ({
    id: playerIdOf(l.playerExternalId),
    espnId: l.playerExternalId,
    name: l.playerName,
    teamId: map.get(l.teamExternalId)?.id ?? null,
    position: l.position ?? ('F' as const),
  }));
  if (newPlayers.length) await db.insert(players).values(newPlayers).onConflictDoNothing();

  const teamTotals = new Map<string, { minutes: number; poss: number }>();
  for (const l of box.lines) {
    const t = teamTotals.get(l.teamExternalId) ?? { minutes: 0, poss: 0 };
    if (!l.dnp) {
      t.minutes += l.minutes;
      t.poss += l.fga + 0.44 * l.fta + l.tov;
    }
    teamTotals.set(l.teamExternalId, t);
  }

  const logs = box.lines.map((l) => ({
    playerId: playerIdOf(l.playerExternalId),
    gameId,
    teamId: team(map, l.teamExternalId).id,
    oppTeamId: team(map, l.teamExternalId === home ? away : home).id,
    isHome: l.teamExternalId === home,
    started: l.started,
    minutes: l.minutes,
    pts: l.pts,
    reb: l.reb,
    ast: l.ast,
    fg3m: l.fg3m,
    stl: l.stl,
    blk: l.blk,
    tov: l.tov,
    fga: l.fga,
    fta: l.fta,
    usageProxy: usageProxy(l, teamTotals.get(l.teamExternalId)!),
    dnp: l.dnp,
  }));
  if (logs.length === 0) return 0;
  await db
    .insert(playerGameLogs)
    .values(logs)
    .onConflictDoUpdate({
      target: [playerGameLogs.playerId, playerGameLogs.gameId],
      set: excluded(getTableColumns(playerGameLogs), [
        'teamId',
        'oppTeamId',
        'isHome',
        'started',
        'minutes',
        'pts',
        'reb',
        'ast',
        'fg3m',
        'stl',
        'blk',
        'tov',
        'fga',
        'fta',
        'usageProxy',
        'dnp',
      ]),
    });
  return logs.length;
}
