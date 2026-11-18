import { nyDate } from '@blueline/adapters';
import {
  allWindows,
  bestPrice,
  consensusNoVig,
  edge,
  isPlayed,
  mean,
  restDays,
  statValue,
  streak,
} from '@blueline/analytics';
import {
  propKey,
  TEAMMATE_OUT_STATUSES,
  type Book,
  type DvpTier,
  type GameStatus,
  type InjuryStatus,
  type Market,
  type Side,
  type TeammateOut,
} from '@blueline/contracts';
import {
  and,
  asc,
  max,
  desc,
  eq,
  games,
  getTableColumns,
  gt,
  gte,
  inArray,
  injuries,
  notInArray,
  or,
  playerGameLogs,
  players,
  propCurrent,
  propMetrics,
  propOffers,
  sql,
  teamDvp,
  teams,
  type InferInsertModel,
  type InferSelectModel,
} from '@blueline/db';
import { loadPlayerLogs, type LogRow } from '../logs';
import type { Job, JobContext } from '../run-job';
import { chunk, excluded } from '../store';
import { computeDvp } from './dvp';

type GameRow = InferSelectModel<typeof games>;
type MetricInsert = InferInsertModel<typeof propMetrics>;

/** Games whose props are (re)computed. */
const LIVE_STATUSES: GameStatus[] = ['scheduled', 'in_progress'];
/** A teammate averaging at least this many season minutes is "key" (`teammate_out`). */
export const KEY_TEAMMATE_MINUTES = 20;
const SIDES: Side[] = ['over', 'under'];

interface OfferLine {
  line: number;
  book: Book;
  overPrice: number | null;
  underPrice: number | null;
}

/**
 * The main line (R28): the modal line across books, one vote per book. Ties
 * go to the lower line. Null for no offers.
 */
export function mainLine(offers: readonly { line: number }[]): number | null {
  const votes = new Map<number, number>();
  for (const o of offers) votes.set(o.line, (votes.get(o.line) ?? 0) + 1);
  let best: number | null = null;
  let bestVotes = 0;
  for (const [line, n] of votes) {
    if (best === null || n > bestVotes || (n === bestVotes && line < best)) {
      best = line;
      bestVotes = n;
    }
  }
  return best;
}

const groupKey = (gameId: string, playerId: string, market: string) =>
  `${gameId}|${playerId}|${market}`;

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** The current injury report (R25): every row of the newest `captured_at` batch. */
async function currentInjuries(ctx: JobContext) {
  const [last] = await ctx.db
    .select({ at: injuries.capturedAt })
    .from(injuries)
    .orderBy(desc(injuries.capturedAt))
    .limit(1);
  if (!last) return [];
  return ctx.db
    .select({
      playerId: injuries.playerId,
      status: injuries.status,
      injuryTeamId: injuries.teamId,
      playerTeamId: players.teamId,
      name: players.name,
    })
    .from(injuries)
    .innerJoin(players, eq(players.id, injuries.playerId))
    .where(eq(injuries.capturedAt, last.at));
}

/** Average minutes per played game, keyed `${playerId}|${season}`. */
async function seasonMinutes(ctx: JobContext, playerIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const part of chunk([...new Set(playerIds)], 500)) {
    const rows = await ctx.db
      .select({
        playerId: playerGameLogs.playerId,
        season: games.season,
        minutes: sql<number>`avg(${playerGameLogs.minutes})`.mapWith(Number),
      })
      .from(playerGameLogs)
      .innerJoin(games, eq(games.id, playerGameLogs.gameId))
      .where(
        and(
          inArray(playerGameLogs.playerId, part),
          eq(games.status, 'final'),
          eq(playerGameLogs.dnp, false),
          gt(playerGameLogs.minutes, 0),
        ),
      )
      .groupBy(playerGameLogs.playerId, games.season);
    for (const r of rows) out.set(`${r.playerId}|${r.season}`, r.minutes);
  }
  return out;
}

/** Each team's game dates (any status but postponed/canceled), ascending. */
async function teamGameDates(ctx: JobContext, teamIds: string[]): Promise<Map<string, string[]>> {
  const rows = await ctx.db
    .select({ date: games.date, home: games.homeTeamId, away: games.awayTeamId })
    .from(games)
    .where(
      and(
        or(inArray(games.homeTeamId, teamIds), inArray(games.awayTeamId, teamIds)),
        notInArray(games.status, ['postponed', 'canceled']),
      ),
    )
    .orderBy(asc(games.date));
  const out = new Map<string, string[]>();
  for (const r of rows) {
    push(out, r.home, r.date);
    push(out, r.away, r.date);
  }
  return out;
}

function previousDate(dates: string[] | undefined, date: string): string | null {
  let prev: string | null = null;
  for (const d of dates ?? []) {
    if (d >= date) break;
    prev = d;
  }
  return prev;
}

/** Lines of each (game, player, market) at its first `captured_at` (the opening snapshot). */
async function openingLines(ctx: JobContext, gameIds: string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  for (const part of chunk(gameIds, 200)) {
    const sub = ctx.db
      .select({
        gameId: propOffers.gameId,
        playerId: propOffers.playerId,
        market: propOffers.market,
        line: propOffers.line,
        capturedAt: propOffers.capturedAt,
        firstAt:
          sql<Date>`min(${propOffers.capturedAt}) over (partition by ${propOffers.gameId}, ${propOffers.playerId}, ${propOffers.market})`.as(
            'first_at',
          ),
      })
      .from(propOffers)
      .where(inArray(propOffers.gameId, part))
      .as('o');
    const rows = await ctx.db
      .select({ gameId: sub.gameId, playerId: sub.playerId, market: sub.market, line: sub.line })
      .from(sub)
      .where(sql`${sub.capturedAt} = ${sub.firstAt}`);
    for (const r of rows) push(out, groupKey(r.gameId, r.playerId, r.market), r.line);
  }
  return out;
}

export interface MetricsResult {
  rows: number;
  deleted: number;
  /** Offered players we could not place on either team of their game. */
  unplaced: string[];
}

/**
 * Recompute `prop_metrics` for the given games: one row per (game, player,
 * market, side) at the main line of the latest offers (`prop_current`).
 * Rows of these games that no longer have offers are deleted; other games'
 * rows are untouched.
 */
export async function computeMetrics(ctx: JobContext, targets: GameRow[]): Promise<MetricsResult> {
  const result: MetricsResult = { rows: 0, deleted: 0, unplaced: [] };
  if (targets.length === 0) return result;
  const gameIds = targets.map((g) => g.id);
  const gameById = new Map(targets.map((g) => [g.id, g]));

  // Latest offer per book, grouped by (game, player, market), books in name order.
  const current = new Map<string, OfferLine[]>();
  const offered: { gameId: string; playerId: string; market: Market }[] = [];
  for (const part of chunk(gameIds, 200)) {
    const rows = await ctx.db
      .select({
        gameId: propCurrent.gameId,
        playerId: propCurrent.playerId,
        market: propCurrent.market,
        line: propCurrent.line,
        book: propCurrent.book,
        overPrice: propCurrent.overPrice,
        underPrice: propCurrent.underPrice,
      })
      .from(propCurrent)
      .where(inArray(propCurrent.gameId, part))
      .orderBy(
        asc(propCurrent.gameId),
        asc(propCurrent.playerId),
        asc(propCurrent.market),
        asc(propCurrent.book),
      );
    for (const r of rows) {
      const k = groupKey(r.gameId, r.playerId, r.market);
      if (!current.has(k))
        offered.push({ gameId: r.gameId, playerId: r.playerId, market: r.market });
      push(current, k, r);
    }
  }
  const opening = await openingLines(ctx, gameIds);

  const playerIds = [...new Set(offered.map((o) => o.playerId))];
  const playerRows = new Map<string, InferSelectModel<typeof players>>();
  for (const part of chunk(playerIds, 500)) {
    for (const p of await ctx.db.select().from(players).where(inArray(players.id, part))) {
      playerRows.set(p.id, p);
    }
  }
  const abbrOf = new Map(
    (await ctx.db.select({ id: teams.id, abbr: teams.abbr }).from(teams)).map((t) => [
      t.id,
      t.abbr,
    ]),
  );
  const logsByPlayer = await loadPlayerLogs(ctx.db, playerIds);
  const teamIds = [...new Set(targets.flatMap((g) => [g.homeTeamId, g.awayTeamId]))];
  const datesByTeam = await teamGameDates(ctx, teamIds);

  // Injuries: the current report only (R25).
  const report = await currentInjuries(ctx);
  const statusOf = new Map<string, InjuryStatus>(report.map((r) => [r.playerId, r.status]));
  const outRows = report.filter((r) => TEAMMATE_OUT_STATUSES.includes(r.status));
  const minutes = await seasonMinutes(
    ctx,
    outRows.map((r) => r.playerId),
  );
  const outByTeam = new Map<string, typeof outRows>();
  for (const r of outRows) {
    const teamId = r.injuryTeamId ?? r.playerTeamId;
    if (teamId) push(outByTeam, teamId, r);
  }
  const teammatesOutFor = (teamId: string, playerId: string, season: number): TeammateOut[] =>
    (outByTeam.get(teamId) ?? [])
      .filter((r) => r.playerId !== playerId)
      .map((r) => {
        // No minutes yet this season (e.g. out since opening night): last season's average.
        const m =
          minutes.get(`${r.playerId}|${season}`) ?? minutes.get(`${r.playerId}|${season - 1}`);
        return {
          playerId: r.playerId,
          name: r.name,
          status: r.status,
          minutes: m === undefined ? null : Math.round(m * 10) / 10,
        };
      })
      .sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1) || (a.playerId < b.playerId ? -1 : 1));

  // DvP: the opponent's l15 rank for the player's position and market.
  const dvp = new Map<string, { rank: number; tier: DvpTier }>();
  const dvpRows = await ctx.db
    .select({
      teamId: teamDvp.teamId,
      position: teamDvp.position,
      market: teamDvp.market,
      rank: teamDvp.rank,
      tier: teamDvp.tier,
    })
    .from(teamDvp)
    .where(eq(teamDvp.window, 'l15'));
  for (const r of dvpRows) {
    dvp.set(`${r.teamId}|${r.position}|${r.market}`, { rank: r.rank, tier: r.tier });
  }

  const unplaced = new Set<string>();
  const rows: MetricInsert[] = [];
  for (const { gameId, playerId, market } of offered) {
    const game = gameById.get(gameId)!;
    const player = playerRows.get(playerId);
    if (!player) continue;
    const allLogs = logsByPlayer.get(playerId) ?? [];

    // The player's side: the roster team, else the team of the latest box score.
    const gameTeams = [game.homeTeamId, game.awayTeamId];
    const lastTeam = allLogs.at(-1)?.teamId;
    const teamId =
      player.teamId && gameTeams.includes(player.teamId)
        ? player.teamId
        : lastTeam && gameTeams.includes(lastTeam)
          ? lastTeam
          : null;
    if (!teamId) {
      unplaced.add(player.name);
      continue;
    }
    const isHome = teamId === game.homeTeamId;
    const oppTeamId = isHome ? game.awayTeamId : game.homeTeamId;

    const k = groupKey(gameId, playerId, market);
    const offers = current.get(k)!;
    const line = mainLine(offers)!;
    const atMain = offers.filter((o) => o.line === line);
    const lineOpen = mainLine((opening.get(k) ?? []).map((l) => ({ line: l })));
    const novig = consensusNoVig(
      atMain.flatMap((o) =>
        o.overPrice !== null && o.underPrice !== null
          ? [{ over: o.overPrice, under: o.underPrice }]
          : [],
      ),
    );

    const logs: LogRow[] = allLogs.filter((l) => l.tipAt < game.tipAt);
    const played = logs.filter(isPlayed);
    const last5 = played.slice(-5);
    const last10 = played.slice(-10);
    const usage = last10.flatMap((l) => (l.usageProxy === null ? [] : [l.usageProxy]));
    const rest = restDays(previousDate(datesByTeam.get(teamId), game.date), game.date);
    const teammatesOut = teammatesOutFor(teamId, playerId, game.season);
    const dv = dvp.get(`${oppTeamId}|${player.position}|${market}`);
    const shared = {
      gameId,
      playerId,
      market,
      line,
      playerName: player.name,
      position: player.position,
      teamId,
      teamAbbr: abbrOf.get(teamId) ?? teamId.toUpperCase(),
      oppTeamId,
      oppAbbr: abbrOf.get(oppTeamId) ?? oppTeamId.toUpperCase(),
      isHome,
      tipAt: game.tipAt,
      recent: last10.map((l) => statValue(l, market)),
      dvpRank: dv?.rank ?? null,
      dvpTier: dv?.tier ?? null,
      restDays: rest,
      isB2b: rest === 0,
      minutesL5: mean(last5.map((l) => l.minutes)),
      usageL10: mean(usage),
      isStarter: last5.filter((l) => l.started).length * 2 > last5.length,
      injuryStatus: statusOf.get(playerId) ?? null,
      teammateOut: teammatesOut.some((t) => (t.minutes ?? 0) >= KEY_TEAMMATE_MINUTES),
      teammatesOut,
      lineOpen,
      lineMove: lineOpen === null ? null : line - lineOpen,
      gameTotal: game.total,
      gameSpread: game.spread,
      computedAt: ctx.now,
    };

    for (const side of SIDES) {
      const w = allWindows(logs, market, line, side, { oppTeamId, season: game.season });
      const e = edge(logs, market, line, side);
      const best = bestPrice(
        atMain.flatMap((o) => {
          const price = side === 'over' ? o.overPrice : o.underPrice;
          return price === null ? [] : [{ price, book: o.book }];
        }),
      );
      const implied = novig ? novig[side] : null;
      rows.push({
        ...shared,
        propKey: propKey({ gameId, playerId, market, side }),
        side,
        hitsL5: w.l5.hits,
        nL5: w.l5.n,
        rateL5: w.l5.rate,
        hitsL10: w.l10.hits,
        nL10: w.l10.n,
        rateL10: w.l10.rate,
        hitsL20: w.l20.hits,
        nL20: w.l20.n,
        rateL20: w.l20.rate,
        hitsSeason: w.season.hits,
        nSeason: w.season.n,
        rateSeason: w.season.rate,
        hitsH2h: w.h2h.hits,
        nH2h: w.h2h.n,
        rateH2h: w.h2h.rate,
        hitsLastSeason: w.lastSeason.hits,
        nLastSeason: w.lastSeason.n,
        rateLastSeason: w.lastSeason.rate,
        avg: e.avg,
        median: e.median,
        edgeAvg: e.edgeAvg,
        edgeMedian: e.edgeMedian,
        streak: streak(logs, market, line, side),
        bestPrice: best?.price ?? null,
        bestBook: best?.book ?? null,
        impliedProbNovig: implied,
        value: implied === null || w.l10.rate === null ? null : w.l10.rate - implied,
      });
    }
  }

  const cols = getTableColumns(propMetrics);
  const updatable = (Object.keys(cols) as (keyof typeof cols & string)[]).filter(
    (c) => c !== 'propKey',
  );
  const keysByGame = new Map<string, string[]>();
  for (const r of rows) push(keysByGame, r.gameId, r.propKey);

  await ctx.db.transaction(async (tx) => {
    for (const gameId of gameIds) {
      const keep = keysByGame.get(gameId) ?? [];
      const gone = await tx
        .delete(propMetrics)
        .where(
          keep.length
            ? and(eq(propMetrics.gameId, gameId), notInArray(propMetrics.propKey, keep))
            : eq(propMetrics.gameId, gameId),
        )
        .returning({ k: propMetrics.propKey });
      result.deleted += gone.length;
    }
    for (const part of chunk(rows, 300)) {
      await tx
        .insert(propMetrics)
        .values(part)
        .onConflictDoUpdate({ target: propMetrics.propKey, set: excluded(cols, updatable) });
    }
  });
  result.rows = rows.length;
  result.unplaced = [...unplaced].sort();
  return result;
}

/**
 * `team_dvp` is stale when it is empty or a final game with box-score lines
 * tipped after it was last computed.
 */
export async function dvpIsStale(ctx: JobContext): Promise<boolean> {
  const [last] = await ctx.db.select({ at: max(teamDvp.computedAt) }).from(teamDvp);
  if (!last?.at) return true;
  const [newest] = await ctx.db
    .select({ tip: max(games.tipAt) })
    .from(games)
    .where(
      and(
        eq(games.status, 'final'),
        sql`exists (select 1 from ${playerGameLogs} where ${playerGameLogs.gameId} = ${games.id})`,
      ),
    );
  return newest?.tip != null && newest.tip.getTime() > last.at.getTime();
}

/** Game statuses whose props are over: their rows leave the board. */
const FINISHED_STATUSES: GameStatus[] = ['final', 'postponed', 'canceled'];

/**
 * precompute [--incremental]
 * Rebuilds `team_dvp` (always in a full run; with --incremental only when it
 * is stale, see `dvpIsStale`), then `prop_metrics` for live games (scheduled
 * or in progress) dated today (America/New_York) or later; --incremental
 * limits it to games tipping today. A full run also deletes the rows of
 * finished (final, postponed, canceled) games.
 * Idempotent: the same inputs and clock give the same rows.
 */
export const precompute: Job = async (ctx, opts) => {
  const incremental = opts.incremental === true;
  const today = nyDate(ctx.now);

  let dvpRows: number | null = null;
  if (!incremental || (await dvpIsStale(ctx))) dvpRows = (await computeDvp(ctx)).rows;

  let finishedDeleted = 0;
  if (!incremental) {
    const gone = await ctx.db
      .delete(propMetrics)
      .where(
        inArray(
          propMetrics.gameId,
          ctx.db
            .select({ id: games.id })
            .from(games)
            .where(inArray(games.status, FINISHED_STATUSES)),
        ),
      )
      .returning({ k: propMetrics.propKey });
    finishedDeleted = gone.length;
  }

  const targets = await ctx.db
    .select()
    .from(games)
    .where(
      and(
        inArray(games.status, LIVE_STATUSES),
        incremental ? eq(games.date, today) : gte(games.date, today),
      ),
    )
    .orderBy(asc(games.tipAt), asc(games.id));
  const res = await computeMetrics(ctx, targets);
  return {
    meta: {
      incremental,
      date: today,
      games: targets.length,
      rows: res.rows,
      deleted: res.deleted,
      finishedDeleted,
      dvpRows,
      unplaced: res.unplaced,
    },
  };
};
