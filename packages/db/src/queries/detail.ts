import {
  type Book,
  type DvpTier,
  type GameLogEntry,
  type InjuryDTO,
  type LineMove,
  type Market,
  type MatchupDvp,
  type PropDetail,
  type PropRow,
  type ShopRow,
  type Window,
  type WindowRate,
} from '@blueline/contracts';
import {
  and,
  asc,
  desc,
  eq,
  games,
  inArray,
  injuries,
  or,
  playerGameLogs,
  players,
  propCurrent,
  propMetrics,
  propOffers,
  teamDvp,
  teams,
  type Db,
  type InferSelectModel,
} from '../index';
import { getGameSummary } from './games';

export interface PropDetailQuery {
  playerId: string;
  market: Market;
  gameId?: string | undefined;
}

const DAY_MS = 86_400_000;

function toRate(hits: number, n: number, rate: number | null): WindowRate {
  return { hits, n, rate };
}

/** prop_metrics row to board DTO. */
export function metricsToPropRow(m: InferSelectModel<typeof propMetrics>): PropRow {
  const rates: Record<Window, WindowRate> = {
    l5: toRate(m.hitsL5, m.nL5, m.rateL5),
    l10: toRate(m.hitsL10, m.nL10, m.rateL10),
    l20: toRate(m.hitsL20, m.nL20, m.rateL20),
    season: toRate(m.hitsSeason, m.nSeason, m.rateSeason),
    h2h: toRate(m.hitsH2h, m.nH2h, m.rateH2h),
    lastSeason: toRate(m.hitsLastSeason, m.nLastSeason, m.rateLastSeason),
  };
  return {
    propKey: m.propKey,
    gameId: m.gameId,
    playerId: m.playerId,
    playerName: m.playerName,
    position: m.position,
    teamId: m.teamId,
    teamAbbr: m.teamAbbr,
    oppTeamId: m.oppTeamId,
    oppAbbr: m.oppAbbr,
    isHome: m.isHome,
    tipAt: m.tipAt.toISOString(),
    market: m.market,
    side: m.side,
    line: m.line,
    rates,
    recent: m.recent,
    avg: m.avg,
    median: m.median,
    edgeAvg: m.edgeAvg,
    edgeMedian: m.edgeMedian,
    streak: m.streak,
    bestPrice: m.bestPrice,
    bestBook: m.bestBook,
    impliedProbNoVig: m.impliedProbNovig,
    value: m.value,
    dvpRank: m.dvpRank,
    dvpTier: m.dvpTier,
    restDays: m.restDays,
    isB2b: m.isB2b,
    minutesL5: m.minutesL5,
    usageL10: m.usageL10,
    isStarter: m.isStarter,
    injuryStatus: m.injuryStatus,
    teammateOut: m.teammateOut,
    teammatesOut: m.teammatesOut,
    lineOpen: m.lineOpen,
    lineMove: m.lineMove,
    gameTotal: m.gameTotal,
    gameSpread: m.gameSpread,
    computedAt: m.computedAt.toISOString(),
  };
}

/** American odds to implied probability (with vig). */
function implied(price: number): number {
  return price < 0 ? -price / (-price + 100) : 100 / (price + 100);
}

/** Two-way multiplicative devig from one book's over and under. */
function noVig(over: number | null, under: number | null): [number | null, number | null] {
  if (over === null || under === null) return [null, null];
  const po = implied(over);
  const pu = implied(under);
  return [po / (po + pu), pu / (po + pu)];
}

/** Choose the game: explicit id, else the player's team's next unfinished game, else its latest. */
async function resolveGameId(
  db: Db,
  teamId: string,
  explicit: string | undefined,
): Promise<string | null> {
  if (explicit) {
    const [g] = await db.select({ id: games.id }).from(games).where(eq(games.id, explicit));
    return g?.id ?? null;
  }
  const teamGames = await db
    .select({ id: games.id, status: games.status })
    .from(games)
    .where(or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId)))
    .orderBy(asc(games.tipAt));
  const next = teamGames.find((g) => g.status === 'scheduled' || g.status === 'in_progress');
  return (next ?? teamGames[teamGames.length - 1])?.id ?? null;
}

/**
 * Everything the prop detail page needs for one player, market and game.
 * Returns null when the player or game does not exist.
 */
export async function getPropDetail(db: Db, q: PropDetailQuery): Promise<PropDetail | null> {
  const [p] = await db
    .select({
      id: players.id,
      name: players.name,
      position: players.position,
      teamId: players.teamId,
      teamAbbr: teams.abbr,
    })
    .from(players)
    .leftJoin(teams, eq(teams.id, players.teamId))
    .where(eq(players.id, q.playerId));
  if (!p || !p.teamId || !p.teamAbbr) return null;
  const teamId = p.teamId;

  const gameId = await resolveGameId(db, teamId, q.gameId);
  if (!gameId) return null;
  const game = await getGameSummary(db, gameId);
  if (!game) return null;
  // An explicit game the player's team is not in has no meaningful opponent.
  if (game.home.id !== teamId && game.away.id !== teamId) return null;
  const oppTeamId = game.home.id === teamId ? game.away.id : game.home.id;

  // Game logs: this season and last, joined with the game for date/score and opp abbr.
  const seasonRows = await db
    .select({ season: games.season })
    .from(games)
    .where(eq(games.id, gameId));
  const season = seasonRows[0]!.season;
  const logRows = await db
    .select({ l: playerGameLogs, g: games, oppAbbr: teams.abbr })
    .from(playerGameLogs)
    .innerJoin(games, eq(games.id, playerGameLogs.gameId))
    .innerJoin(teams, eq(teams.id, playerGameLogs.oppTeamId))
    .where(
      and(
        eq(playerGameLogs.playerId, q.playerId),
        inArray(games.season, [season, season - 1]),
      ),
    )
    .orderBy(asc(games.tipAt), asc(games.id));

  // Opponent DvP tier per team (current snapshot; the table keeps no history).
  const dvpRows = await db
    .select()
    .from(teamDvp)
    .where(and(eq(teamDvp.position, p.position), eq(teamDvp.market, q.market)));
  const tierByOpp = new Map<string, DvpTier>();
  for (const r of dvpRows) if (r.window === 'season') tierByOpp.set(r.teamId, r.tier);

  let prevTip: number | null = null;
  const logs: GameLogEntry[] = logRows.map(({ l, g, oppAbbr }) => {
    const tip = g.tipAt.getTime();
    const restDays = prevTip === null ? null : Math.max(0, Math.round((tip - prevTip) / DAY_MS) - 1);
    prevTip = tip;
    const final = g.status === 'final' && g.homeScore !== null && g.awayScore !== null;
    const won = final ? (l.isHome ? g.homeScore! > g.awayScore! : g.awayScore! > g.homeScore!) : null;
    return {
      gameId: l.gameId,
      date: g.date,
      season: g.season,
      teamId: l.teamId,
      oppTeamId: l.oppTeamId,
      oppAbbr,
      isHome: l.isHome,
      started: l.started,
      dnp: l.dnp,
      minutes: l.minutes,
      pts: l.pts,
      reb: l.reb,
      ast: l.ast,
      fg3m: l.fg3m,
      stl: l.stl,
      blk: l.blk,
      tov: l.tov,
      won,
      restDays,
      oppTier: tierByOpp.get(l.oppTeamId) ?? null,
    };
  });

  // Teammates and the player's logged games they appeared in.
  const logGameIds = logs.map((l) => l.gameId);
  const mates = await db
    .select({ id: players.id, name: players.name })
    .from(players)
    .where(and(eq(players.teamId, teamId), eq(players.active, true)))
    .orderBy(asc(players.name));
  const mateIds = mates.filter((m) => m.id !== q.playerId).map((m) => m.id);
  const played = new Map<string, string[]>();
  if (mateIds.length > 0 && logGameIds.length > 0) {
    const rows = await db
      .select({
        playerId: playerGameLogs.playerId,
        gameId: playerGameLogs.gameId,
        minutes: playerGameLogs.minutes,
        dnp: playerGameLogs.dnp,
      })
      .from(playerGameLogs)
      .where(
        and(inArray(playerGameLogs.playerId, mateIds), inArray(playerGameLogs.gameId, logGameIds)),
      );
    const order = new Map(logGameIds.map((id, i) => [id, i]));
    for (const r of rows) {
      if (r.dnp || r.minutes <= 0) continue;
      const arr = played.get(r.playerId) ?? [];
      arr.push(r.gameId);
      played.set(r.playerId, arr);
    }
    for (const arr of played.values()) arr.sort((x, y) => order.get(x)! - order.get(y)!);
  }
  const teammates = mates
    .filter((m) => m.id !== q.playerId && (played.get(m.id)?.length ?? 0) > 0)
    .map((m) => ({ playerId: m.id, name: m.name, playedGameIds: played.get(m.id)! }));

  // Board metrics rows (one per side).
  const metricRows = await db
    .select()
    .from(propMetrics)
    .where(
      and(
        eq(propMetrics.gameId, gameId),
        eq(propMetrics.playerId, q.playerId),
        eq(propMetrics.market, q.market),
      ),
    )
    .orderBy(desc(propMetrics.side));

  // Line shop: latest offer per book, best price per side within each line.
  const current = await db
    .select()
    .from(propCurrent)
    .where(
      and(
        eq(propCurrent.gameId, gameId),
        eq(propCurrent.playerId, q.playerId),
        eq(propCurrent.market, q.market),
      ),
    )
    .orderBy(asc(propCurrent.book));
  const bestOver = new Map<number, number>();
  const bestUnder = new Map<number, number>();
  for (const c of current) {
    if (c.overPrice !== null) bestOver.set(c.line, Math.max(bestOver.get(c.line) ?? -Infinity, c.overPrice));
    if (c.underPrice !== null) bestUnder.set(c.line, Math.max(bestUnder.get(c.line) ?? -Infinity, c.underPrice));
  }
  const shop: ShopRow[] = current.map((c) => {
    const [nvo, nvu] = noVig(c.overPrice, c.underPrice);
    return {
      book: c.book as Book,
      line: c.line,
      overPrice: c.overPrice,
      underPrice: c.underPrice,
      noVigOver: nvo,
      noVigUnder: nvu,
      isBestOver: c.overPrice !== null && c.overPrice === bestOver.get(c.line),
      isBestUnder: c.underPrice !== null && c.underPrice === bestUnder.get(c.line),
      capturedAt: c.capturedAt.toISOString(),
    };
  });

  // Line moves: the full append-only history.
  const moveRows = await db
    .select()
    .from(propOffers)
    .where(
      and(
        eq(propOffers.gameId, gameId),
        eq(propOffers.playerId, q.playerId),
        eq(propOffers.market, q.market),
      ),
    )
    .orderBy(asc(propOffers.capturedAt), asc(propOffers.id));
  const lineMoves: LineMove[] = moveRows.map((r) => ({
    book: r.book,
    line: r.line,
    overPrice: r.overPrice,
    underPrice: r.underPrice,
    capturedAt: r.capturedAt.toISOString(),
  }));

  // Latest injury snapshot per player on both teams.
  const injRows = await db
    .select({
      playerId: injuries.playerId,
      name: players.name,
      teamId: players.teamId,
      status: injuries.status,
      detail: injuries.detail,
      capturedAt: injuries.capturedAt,
    })
    .from(injuries)
    .innerJoin(players, eq(players.id, injuries.playerId))
    .where(inArray(players.teamId, [teamId, oppTeamId]))
    .orderBy(desc(injuries.capturedAt), desc(injuries.id));
  const seen = new Set<string>();
  const injuryList: InjuryDTO[] = [];
  for (const r of injRows) {
    if (seen.has(r.playerId)) continue;
    seen.add(r.playerId);
    injuryList.push({
      playerId: r.playerId,
      name: r.name,
      teamId: r.teamId!,
      status: r.status,
      detail: r.detail,
      capturedAt: r.capturedAt.toISOString(),
    });
  }

  // Matchup DvP text inputs: the opponent vs this position for the market, both windows.
  const matchup: MatchupDvp[] = dvpRows
    .filter((r) => r.teamId === oppTeamId)
    .sort((a, b) => a.window.localeCompare(b.window))
    .map((r) => ({
      oppTeamId: r.teamId,
      position: r.position,
      market: r.market,
      window: r.window,
      allowedPerGame: r.allowedPerGame,
      rank: r.rank,
      tier: r.tier,
    }));

  return {
    player: { id: p.id, name: p.name, position: p.position, teamId, teamAbbr: p.teamAbbr },
    game,
    market: q.market,
    metrics: metricRows.map(metricsToPropRow),
    logs,
    teammates,
    shop,
    lineMoves,
    injuries: injuryList,
    matchup,
  };
}
