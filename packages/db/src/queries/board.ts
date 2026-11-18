// Board query (spec §6a): server-side SQL over `prop_metrics`, one table scan plus a join to `games`.
import {
  QUESTIONABLE_OR_WORSE,
  type BoardFilter,
  type BoardResponse,
  type BoardSort,
  type PropRow,
  type Window,
  type WindowRate,
} from '@blueline/contracts';
import type { Db } from '../client';
import {
  and,
  count,
  eq,
  games,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  max,
  or,
  propCurrent,
  propMetrics,
  sql,
  type SQL,
} from '../index';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/**
 * R10: filter percentages (minHitRate, minValue, minUsage) are 0..100 but the
 * `rate_*`, `value` and `usage_l10` columns are 0..1. This is the ONE place that converts.
 */
export function pct(percent: number): number {
  return percent / 100;
}

/** Floating point slack so `70` matches a stored 0.7 computed as hits / n. */
const EPS = 1e-9;

const WINDOW_COLS = {
  l5: { rate: propMetrics.rateL5, n: propMetrics.nL5, hits: propMetrics.hitsL5 },
  l10: { rate: propMetrics.rateL10, n: propMetrics.nL10, hits: propMetrics.hitsL10 },
  l20: { rate: propMetrics.rateL20, n: propMetrics.nL20, hits: propMetrics.hitsL20 },
  season: { rate: propMetrics.rateSeason, n: propMetrics.nSeason, hits: propMetrics.hitsSeason },
  h2h: { rate: propMetrics.rateH2h, n: propMetrics.nH2h, hits: propMetrics.hitsH2h },
  lastSeason: {
    rate: propMetrics.rateLastSeason,
    n: propMetrics.nLastSeason,
    hits: propMetrics.hitsLastSeason,
  },
} satisfies Record<Window, object>;

/** Today's slate date in America/New_York as YYYY-MM-DD. */
export function slateDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Highest American price among current offers at the main line, restricted to `books`. */
function bestPriceFromBooks(books: readonly string[]): SQL<number | null> {
  return sql<number | null>`(
    select max(case when ${propMetrics.side} = 'over' then ${propCurrent.overPrice} else ${propCurrent.underPrice} end)
    from ${propCurrent}
    where ${propCurrent.gameId} = ${propMetrics.gameId}
      and ${propCurrent.playerId} = ${propMetrics.playerId}
      and ${propCurrent.market} = ${propMetrics.market}
      and ${propCurrent.line} = ${propMetrics.line}
      and ${inArray(propCurrent.book, [...books] as (typeof propCurrent.book._.data)[])}
  )`;
}

function bestBookFromBooks(books: readonly string[]): SQL<string | null> {
  return sql<string | null>`(
    select ${propCurrent.book}
    from ${propCurrent}
    where ${propCurrent.gameId} = ${propMetrics.gameId}
      and ${propCurrent.playerId} = ${propMetrics.playerId}
      and ${propCurrent.market} = ${propMetrics.market}
      and ${propCurrent.line} = ${propMetrics.line}
      and ${inArray(propCurrent.book, [...books] as (typeof propCurrent.book._.data)[])}
      and (case when ${propMetrics.side} = 'over' then ${propCurrent.overPrice} else ${propCurrent.underPrice} end) is not null
    order by (case when ${propMetrics.side} = 'over' then ${propCurrent.overPrice} else ${propCurrent.underPrice} end) desc,
      ${propCurrent.book} asc
    limit 1
  )`;
}

export interface QueryBoardOptions {
  /** Default 50, clamped to 1..200. */
  pageSize?: number;
  /** Clock for "today's slate" when `filter.date` is undefined. Tests only. */
  now?: Date;
}

export async function queryBoard(
  db: Db,
  f: BoardFilter,
  opts: QueryBoardOptions = {},
): Promise<BoardResponse> {
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(opts.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const page = Math.max(1, f.page);
  const win = WINDOW_COLS[f.window];

  // The price the board compares and sorts on: stored best price, or recomputed
  // from the latest offers when a books filter is active.
  const useBooks = f.books.length > 0;
  const priceExpr: SQL<number | null> = useBooks
    ? bestPriceFromBooks(f.books)
    : sql<number | null>`${propMetrics.bestPrice}`;

  const slate = eq(games.date, f.date ?? slateDate(opts.now ?? new Date()));

  const conds: (SQL | undefined)[] = [
    slate,
    // Scope
    f.games.length ? inArray(propMetrics.gameId, f.games) : undefined,
    f.teams.length ? inArray(propMetrics.teamAbbr, f.teams) : undefined,
    f.positions.length ? inArray(propMetrics.position, f.positions) : undefined,
    f.q ? ilike(propMetrics.playerName, `%${escapeLike(f.q)}%`) : undefined,
    // Market
    f.markets.length ? inArray(propMetrics.market, f.markets) : undefined,
    f.side !== 'both' ? eq(propMetrics.side, f.side) : undefined,
    // Performance
    f.minHitRate !== undefined ? gte(win.rate, pct(f.minHitRate) - EPS) : undefined,
    f.minGames !== undefined ? gte(win.n, f.minGames) : undefined,
    f.minStreak !== undefined ? gte(propMetrics.streak, f.minStreak) : undefined,
    f.minEdge !== undefined ? gte(propMetrics.edgeAvg, f.minEdge) : undefined,
    // Price (all against the effective price)
    useBooks || f.bestPriceOnly ? sql`${priceExpr} is not null` : undefined,
    f.oddsMin !== undefined ? sql`${priceExpr} >= ${f.oddsMin}` : undefined,
    f.oddsMax !== undefined ? sql`${priceExpr} <= ${f.oddsMax}` : undefined,
    f.minValue !== undefined ? gte(propMetrics.value, pct(f.minValue) - EPS) : undefined,
    // Matchup
    f.dvpTiers.length ? inArray(propMetrics.dvpTier, f.dvpTiers) : undefined,
    f.dvpRankMin !== undefined ? gte(propMetrics.dvpRank, f.dvpRankMin) : undefined,
    f.dvpRankMax !== undefined ? lte(propMetrics.dvpRank, f.dvpRankMax) : undefined,
    // Situation
    f.homeAway !== 'both' ? eq(propMetrics.isHome, f.homeAway === 'home') : undefined,
    f.b2bOnly ? eq(propMetrics.isB2b, true) : undefined,
    f.restDaysMin !== undefined ? gte(propMetrics.restDays, f.restDaysMin) : undefined,
    f.restDaysMax !== undefined ? lte(propMetrics.restDays, f.restDaysMax) : undefined,
    f.totalMin !== undefined ? gte(propMetrics.gameTotal, f.totalMin) : undefined,
    f.totalMax !== undefined ? lte(propMetrics.gameTotal, f.totalMax) : undefined,
    f.absSpreadMax !== undefined
      ? sql`abs(${propMetrics.gameSpread}) <= ${f.absSpreadMax}`
      : undefined,
    // Role
    f.minMinutes !== undefined ? gte(propMetrics.minutesL5, f.minMinutes) : undefined,
    f.minUsage !== undefined ? gte(propMetrics.usageL10, pct(f.minUsage) - EPS) : undefined,
    f.starterOnly ? eq(propMetrics.isStarter, true) : undefined,
    // Health
    f.excludeQuestionable
      ? or(
          isNull(propMetrics.injuryStatus),
          sql`${propMetrics.injuryStatus} not in (${sql.join(
            QUESTIONABLE_OR_WORSE.map((s) => sql`${s}`),
            sql`, `,
          )})`,
        )
      : undefined,
    f.teammateOutOnly ? eq(propMetrics.teammateOut, true) : undefined,
    // Market moves
    f.minLineMove !== undefined
      ? f.lineMoveDir === 'up'
        ? gte(propMetrics.lineMove, f.minLineMove)
        : f.lineMoveDir === 'down'
          ? lte(propMetrics.lineMove, -f.minLineMove)
          : sql`abs(${propMetrics.lineMove}) >= ${f.minLineMove}`
      : undefined,
  ];
  const where = and(...conds);

  // Typed allowlist: every BoardSort maps to exactly one expression.
  const sortExprs: Record<BoardSort, SQL> = {
    hitRate: sql`${win.rate}`,
    edge: sql`${propMetrics.edgeAvg}`,
    value: sql`${propMetrics.value}`,
    odds: priceExpr,
    lineMove: sql`${propMetrics.lineMove}`,
    streak: sql`${propMetrics.streak}`,
    tipAt: sql`${propMetrics.tipAt}`,
  };
  const dirSql = f.dir === 'asc' ? sql`asc` : sql`desc`;
  const orderBy = [sql`${sortExprs[f.sort]} ${dirSql} nulls last`, sql`${propMetrics.propKey} asc`];

  const [rows, totals, computed] = await Promise.all([
    db
      .select({
        m: propMetrics,
        price: priceExpr,
        book: useBooks ? bestBookFromBooks(f.books) : sql<string | null>`${propMetrics.bestBook}`,
      })
      .from(propMetrics)
      .innerJoin(games, eq(games.id, propMetrics.gameId))
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(propMetrics)
      .innerJoin(games, eq(games.id, propMetrics.gameId))
      .where(where),
    db
      .select({ at: max(propMetrics.computedAt) })
      .from(propMetrics)
      .innerJoin(games, eq(games.id, propMetrics.gameId))
      .where(slate),
  ]);

  return {
    rows: rows.map(({ m, price, book }) => toPropRow(m, price, book as PropRow['bestBook'])),
    total: Number(totals[0]?.total ?? 0),
    page,
    pageSize,
    filter: f,
    computedAt: computed[0]?.at ? new Date(computed[0].at).toISOString() : null,
  };
}

function toPropRow(
  m: typeof propMetrics.$inferSelect,
  bestPrice: number | null,
  bestBook: PropRow['bestBook'],
): PropRow {
  const rate = (hits: number, n: number, r: number | null): WindowRate => ({ hits, n, rate: r });
  const rates: Record<Window, WindowRate> = {
    l5: rate(m.hitsL5, m.nL5, m.rateL5),
    l10: rate(m.hitsL10, m.nL10, m.rateL10),
    l20: rate(m.hitsL20, m.nL20, m.rateL20),
    season: rate(m.hitsSeason, m.nSeason, m.rateSeason),
    h2h: rate(m.hitsH2h, m.nH2h, m.rateH2h),
    lastSeason: rate(m.hitsLastSeason, m.nLastSeason, m.rateLastSeason),
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
    bestPrice,
    bestBook,
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
