import { normalizeName, nyDate } from '@blueline/adapters';
import { MARKETS, type NormGame, type NormGameLine, type NormPropOffer } from '@blueline/contracts';
import {
  and,
  eq,
  gt,
  inArray,
  lte,
  players,
  propCurrent,
  propOffers,
  providerAliases,
  teams,
  games as gamesTable,
  type Db,
  type InferSelectModel,
} from '@blueline/db';
import { parseYmd } from '../ids';
import type { Job, JobContext } from '../run-job';
import { chunk } from '../store';
import { addUsage, DEFAULT_ODDS_MONTHLY_BUDGET, getUsage, monthOf, planMarkets } from './budget';

/** `--closing` pulls games tipping within this window and flags their offers. */
export const CLOSING_WINDOW_MS = 45 * 60_000;

type GameRow = InferSelectModel<typeof gamesTable>;
type TeamRow = InferSelectModel<typeof teams>;

function toNormGame(g: GameRow, teamsById: Map<string, TeamRow>): NormGame {
  return {
    externalId: g.espnId ?? g.id,
    date: g.date,
    tipAt: g.tipAt.toISOString(),
    season: g.season,
    homeTeamExternalId: teamsById.get(g.homeTeamId)?.espnId ?? g.homeTeamId,
    awayTeamExternalId: teamsById.get(g.awayTeamId)?.espnId ?? g.awayTeamId,
    status: g.status,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
  };
}

/**
 * Maps odds-provider player ids to ours through `provider_aliases`. On a miss it
 * matches the normalized name among the two teams' players (the offer's team
 * first when the provider gives one) and stores the alias.
 */
export function createPlayerResolver(db: Db, provider: string) {
  let aliases: Promise<Map<string, string>> | undefined;
  const byTeam = new Map<string, Promise<{ id: string; norm: string }[]>>();

  const teamPlayers = (teamId: string) => {
    let p = byTeam.get(teamId);
    if (!p) {
      p = db
        .select({ id: players.id, name: players.name })
        .from(players)
        .where(eq(players.teamId, teamId))
        .then((rows) => rows.map((r) => ({ id: r.id, norm: normalizeName(r.name) })));
      byTeam.set(teamId, p);
    }
    return p;
  };

  return async function resolve(
    offer: NormPropOffer,
    game: GameRow,
    teamIdByAbbr: Map<string, string>,
  ): Promise<string | null> {
    aliases ??= db
      .select({ externalId: providerAliases.externalId, internalId: providerAliases.internalId })
      .from(providerAliases)
      .where(and(eq(providerAliases.provider, provider), eq(providerAliases.kind, 'player')))
      .then((rows) => new Map(rows.map((r) => [r.externalId, r.internalId])));
    const known = await aliases;
    const hit = known.get(offer.providerPlayerId);
    if (hit) return hit;

    const norm = normalizeName(offer.playerName);
    const gameTeams = [game.homeTeamId, game.awayTeamId];
    const own = offer.teamAbbr ? teamIdByAbbr.get(offer.teamAbbr.toLowerCase()) : undefined;
    const order = own && gameTeams.includes(own) ? [[own], gameTeams] : [gameTeams];
    for (const teamIds of order) {
      const pool = (await Promise.all(teamIds.map(teamPlayers))).flat();
      const matches = pool.filter((p) => p.norm === norm);
      if (matches.length === 1) {
        const internalId = matches[0]!.id;
        await db
          .insert(providerAliases)
          .values({
            provider,
            kind: 'player',
            externalId: offer.providerPlayerId,
            internalId,
            name: offer.playerName,
          })
          .onConflictDoNothing();
        known.set(offer.providerPlayerId, internalId);
        return internalId;
      }
    }
    return null;
  };
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Consensus (median across books) spread and total onto each game. */
async function applyGameLines(
  db: Db,
  lines: NormGameLine[],
  games: GameRow[],
  teamsById: Map<string, TeamRow>,
): Promise<number> {
  let updated = 0;
  for (const g of games) {
    const home = teamsById.get(g.homeTeamId)?.abbr;
    const away = teamsById.get(g.awayTeamId)?.abbr;
    const mine = lines.filter(
      (l) => l.homeTeam === home && l.awayTeam === away && nyDate(l.tipAt) === g.date,
    );
    const spread = median(mine.flatMap((l) => (l.spread === null ? [] : [l.spread])));
    const total = median(mine.flatMap((l) => (l.total === null ? [] : [l.total])));
    if (spread === null && total === null) continue;
    await db
      .update(gamesTable)
      .set({ spread: spread ?? g.spread, total: total ?? g.total })
      .where(eq(gamesTable.id, g.id));
    updated++;
  }
  return updated;
}

async function selectGames(ctx: JobContext, date: string, closing: boolean): Promise<GameRow[]> {
  const scheduled = eq(gamesTable.status, 'scheduled');
  const where = closing
    ? and(
        scheduled,
        gt(gamesTable.tipAt, ctx.now),
        lte(gamesTable.tipAt, new Date(ctx.now.getTime() + CLOSING_WINDOW_MS)),
      )
    : and(scheduled, eq(gamesTable.date, date));
  return ctx.db.select().from(gamesTable).where(where).orderBy(gamesTable.tipAt);
}

/**
 * ingest:odds [--date YYYY-MM-DD] [--closing]
 * Pulls player props for the day's scheduled games (or, with --closing, games
 * tipping within 45 minutes), within the monthly unit budget. Offers are
 * append-only: a row is inserted only when line or price changed. With
 * --closing, the latest row per (game, player, market, book) is flagged
 * is_closing (inserted if it changed, else flagged in place).
 */
export const ingestOdds: Job = async (ctx, opts) => {
  const date = opts.date ? parseYmd(opts.date) : nyDate(ctx.now);
  const closing = opts.closing === true;
  const provider = ctx.odds.name;
  const games = await selectGames(ctx, date, closing);
  if (games.length === 0) return { units: 0, meta: { date, closing, games: 0 } };

  const month = monthOf(ctx.now);
  const used = await getUsage(ctx.db, provider, month);
  const budget = ctx.oddsMonthlyBudget ?? DEFAULT_ODDS_MONTHLY_BUDGET;
  const plan = planMarkets({
    used,
    budget,
    games: games.length,
    wanted: MARKETS,
    estimate: (g, m) => ctx.odds.estimateUnits(g, m),
  });
  if (plan.skipped) {
    ctx.log(`ingest:odds: skipped, ${used} + ${plan.estimate} units exceeds the ${budget} budget`);
    return {
      units: 0,
      meta: {
        date,
        closing,
        games: games.length,
        skipped: 'budget',
        used,
        budget,
        estimate: plan.estimate,
      },
    };
  }

  const teamRows = await ctx.db.select().from(teams);
  const teamsById = new Map(teamRows.map((t) => [t.id, t]));
  const teamIdByAbbr = new Map(teamRows.map((t) => [t.abbr.toLowerCase(), t.id]));
  const resolve = createPlayerResolver(ctx.db, provider);

  let units = 0;
  let offersSeen = 0;
  let inserted = 0;
  let unchanged = 0;
  let closingMarked = 0;
  const unmatched = new Set<string>();

  for (const game of games) {
    const res = await ctx.odds.getPlayerProps(toNormGame(game, teamsById), plan.markets);
    units += res.units;
    await addUsage(ctx.db, provider, month, res.units);
    offersSeen += res.offers.length;
    if (res.offers.length === 0) continue;

    await ctx.db
      .insert(providerAliases)
      .values({
        provider,
        kind: 'game',
        externalId: res.offers[0]!.providerGameId,
        internalId: game.id,
      })
      .onConflictDoNothing();

    const latest = new Map(
      (await ctx.db.select().from(propCurrent).where(eq(propCurrent.gameId, game.id))).map((r) => [
        `${r.playerId}|${r.market}|${r.book}`,
        r,
      ]),
    );

    const fresh = new Map<string, typeof propOffers.$inferInsert>();
    const markIds = new Set<number>();
    for (const o of res.offers) {
      const playerId = await resolve(o, game, teamIdByAbbr);
      if (!playerId) {
        const home = teamsById.get(game.homeTeamId)?.abbr;
        const away = teamsById.get(game.awayTeamId)?.abbr;
        unmatched.add(`${o.playerName} (${o.teamAbbr ?? `${away}@${home}`})`);
        continue;
      }
      const key = `${playerId}|${o.market}|${o.book}`;
      const prev = latest.get(key);
      const same =
        prev &&
        prev.line === o.line &&
        prev.overPrice === o.overPrice &&
        prev.underPrice === o.underPrice;
      if (same) {
        unchanged++;
        if (closing && !prev.isClosing) markIds.add(prev.id);
        continue;
      }
      fresh.set(key, {
        gameId: game.id,
        playerId,
        market: o.market,
        line: o.line,
        overPrice: o.overPrice,
        underPrice: o.underPrice,
        book: o.book,
        capturedAt: ctx.now,
        isClosing: closing,
      });
    }
    for (const part of chunk([...fresh.values()], 500)) {
      await ctx.db.insert(propOffers).values(part);
    }
    for (const part of chunk([...markIds], 500)) {
      await ctx.db.update(propOffers).set({ isClosing: true }).where(inArray(propOffers.id, part));
    }
    inserted += fresh.size;
    closingMarked += markIds.size + (closing ? fresh.size : 0);
  }

  let gameLines = 0;
  for (const day of [...new Set(games.map((g) => g.date))]) {
    const res = await ctx.odds.getGameLines(day);
    units += res.units;
    await addUsage(ctx.db, provider, month, res.units);
    gameLines += await applyGameLines(
      ctx.db,
      res.lines,
      games.filter((g) => g.date === day),
      teamsById,
    );
  }

  return {
    units,
    meta: {
      date,
      closing,
      provider,
      games: games.length,
      markets: plan.markets,
      trimmed: plan.trimmed,
      estimate: plan.estimate,
      offers: offersSeen,
      inserted,
      unchanged,
      closingMarked,
      gameLines,
      unmatched: [...unmatched].sort(),
    },
  };
};
