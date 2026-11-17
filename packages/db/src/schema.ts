// BlueLine Postgres schema (spec §4). Column names are explicit snake_case.
// Only `import type` from contracts here: drizzle-kit loads this file directly.
import type {
  BoardFilter,
  Book,
  DvpTier,
  GameStatus,
  InjuryStatus,
  LegResult,
  Market,
  Position,
  Side,
  TeammateOut,
} from '@blueline/contracts';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => tstz('created_at').notNull().defaultNow();

// ---------------------------------------------------------------------------
// Reference data (written by worker jobs)
// ---------------------------------------------------------------------------

export const teams = pgTable('teams', {
  id: text('id').primaryKey(),
  abbr: text('abbr').notNull().unique(),
  name: text('name').notNull(),
  espnId: text('espn_id').unique(),
});

export const players = pgTable(
  'players',
  {
    id: text('id').primaryKey(),
    espnId: text('espn_id').unique(),
    name: text('name').notNull(),
    teamId: text('team_id').references(() => teams.id),
    position: text('position').$type<Position>().notNull(),
    active: boolean('active').notNull().default(true),
  },
  (t) => [index('players_team_idx').on(t.teamId)],
);

export const games = pgTable(
  'games',
  {
    id: text('id').primaryKey(),
    espnId: text('espn_id').unique(),
    /** Season start year: 2026-27 → 2026. */
    season: integer('season').notNull(),
    /** Slate date (America/New_York), 'YYYY-MM-DD'. */
    date: date('date', { mode: 'string' }).notNull(),
    tipAt: tstz('tip_at').notNull(),
    homeTeamId: text('home_team_id')
      .notNull()
      .references(() => teams.id),
    awayTeamId: text('away_team_id')
      .notNull()
      .references(() => teams.id),
    status: text('status').$type<GameStatus>().notNull().default('scheduled'),
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    /** Home team spread (consensus), e.g. -6.5. */
    spread: doublePrecision('spread'),
    total: doublePrecision('total'),
  },
  (t) => [
    index('games_date_idx').on(t.date),
    index('games_tip_at_idx').on(t.tipAt),
    index('games_home_team_idx').on(t.homeTeamId),
    index('games_away_team_idx').on(t.awayTeamId),
  ],
);

export const playerGameLogs = pgTable(
  'player_game_logs',
  {
    playerId: text('player_id')
      .notNull()
      .references(() => players.id),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id),
    oppTeamId: text('opp_team_id')
      .notNull()
      .references(() => teams.id),
    isHome: boolean('is_home').notNull(),
    started: boolean('started').notNull().default(false),
    minutes: doublePrecision('minutes').notNull().default(0),
    pts: integer('pts').notNull().default(0),
    reb: integer('reb').notNull().default(0),
    ast: integer('ast').notNull().default(0),
    fg3m: integer('fg3m').notNull().default(0),
    stl: integer('stl').notNull().default(0),
    blk: integer('blk').notNull().default(0),
    tov: integer('tov').notNull().default(0),
    fga: integer('fga').notNull().default(0),
    fta: integer('fta').notNull().default(0),
    usageProxy: doublePrecision('usage_proxy'),
    dnp: boolean('dnp').notNull().default(false),
  },
  (t) => [
    primaryKey({ name: 'player_game_logs_pk', columns: [t.playerId, t.gameId] }),
    index('pgl_game_idx').on(t.gameId),
    index('pgl_team_game_idx').on(t.teamId, t.gameId),
    index('pgl_opp_team_idx').on(t.oppTeamId),
  ],
);

/** Injury report snapshots; the latest per player wins. */
export const injuries = pgTable(
  'injuries',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id),
    teamId: text('team_id').references(() => teams.id),
    status: text('status').$type<InjuryStatus>().notNull(),
    detail: text('detail'),
    capturedAt: tstz('captured_at').notNull().defaultNow(),
  },
  (t) => [index('injuries_player_captured_idx').on(t.playerId, t.capturedAt.desc())],
);

/** Maps an external provider id (odds/stats) to our internal id. */
export const providerAliases = pgTable(
  'provider_aliases',
  {
    provider: text('provider').notNull(),
    kind: text('kind').$type<'player' | 'game' | 'team'>().notNull(),
    externalId: text('external_id').notNull(),
    internalId: text('internal_id').notNull(),
    /** Provider's display name at match time (for debugging mismatches). */
    name: text('name'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'provider_aliases_pk', columns: [t.provider, t.kind, t.externalId] }),
    index('provider_aliases_internal_idx').on(t.kind, t.internalId),
  ],
);

// ---------------------------------------------------------------------------
// Odds and metrics
// ---------------------------------------------------------------------------

/** Append-only: a row is inserted only when line or price changed. */
export const propOffers = pgTable(
  'prop_offers',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id),
    market: text('market').$type<Market>().notNull(),
    line: doublePrecision('line').notNull(),
    overPrice: integer('over_price'),
    underPrice: integer('under_price'),
    book: text('book').$type<Book>().notNull(),
    capturedAt: tstz('captured_at').notNull().defaultNow(),
    isClosing: boolean('is_closing').notNull().default(false),
  },
  (t) => [
    index('prop_offers_lookup_idx').on(t.gameId, t.playerId, t.market, t.book, t.capturedAt.desc()),
    index('prop_offers_captured_idx').on(t.capturedAt),
  ],
);

/** Latest offer per (game, player, market, book). */
export const propCurrent = pgView('prop_current', {
  id: bigint('id', { mode: 'number' }).notNull(),
  gameId: text('game_id').notNull(),
  playerId: text('player_id').notNull(),
  market: text('market').$type<Market>().notNull(),
  line: doublePrecision('line').notNull(),
  overPrice: integer('over_price'),
  underPrice: integer('under_price'),
  book: text('book').$type<Book>().notNull(),
  capturedAt: tstz('captured_at').notNull(),
  isClosing: boolean('is_closing').notNull(),
}).as(
  sql`select distinct on (game_id, player_id, market, book) id, game_id, player_id, market, line, over_price, under_price, book, captured_at, is_closing from prop_offers order by game_id, player_id, market, book, captured_at desc, id desc`,
);

/** hits_/n_/rate_ columns for one window. n excludes pushes, DNPs and 0-minute games. */
const windowCols = <W extends string>(w: W) => ({
  hits: integer(`hits_${w}`).notNull().default(0),
  n: integer(`n_${w}`).notNull().default(0),
  rate: doublePrecision(`rate_${w}`),
});
const l5 = windowCols('l5');
const l10 = windowCols('l10');
const l20 = windowCols('l20');
const season = windowCols('season');
const h2h = windowCols('h2h');
const lastSeason = windowCols('last_season');

/**
 * One row per (game, player, market, side) at the main line (modal line across
 * books). Every board filter has an explicit column; queries never parse JSON.
 */
export const propMetrics = pgTable(
  'prop_metrics',
  {
    /** `${gameId}:${playerId}:${market}:${side}` (contracts `propKey`). Sort tiebreak. */
    propKey: text('prop_key').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id),
    market: text('market').$type<Market>().notNull(),
    side: text('side').$type<Side>().notNull(),
    line: doublePrecision('line').notNull(),

    // Display fields (denormalized so the board is one table scan)
    playerName: text('player_name').notNull(),
    position: text('position').$type<Position>().notNull(),
    teamId: text('team_id').notNull(),
    teamAbbr: text('team_abbr').notNull(),
    oppTeamId: text('opp_team_id').notNull(),
    oppAbbr: text('opp_abbr').notNull(),
    isHome: boolean('is_home').notNull(),
    tipAt: tstz('tip_at').notNull(),
    /** Last 10 played games' stat values, oldest → newest. */
    recent: jsonb('recent').$type<number[]>().notNull().default([]),

    // Hit rates per window
    hitsL5: l5.hits,
    nL5: l5.n,
    rateL5: l5.rate,
    hitsL10: l10.hits,
    nL10: l10.n,
    rateL10: l10.rate,
    hitsL20: l20.hits,
    nL20: l20.n,
    rateL20: l20.rate,
    hitsSeason: season.hits,
    nSeason: season.n,
    rateSeason: season.rate,
    hitsH2h: h2h.hits,
    nH2h: h2h.n,
    rateH2h: h2h.rate,
    hitsLastSeason: lastSeason.hits,
    nLastSeason: lastSeason.n,
    rateLastSeason: lastSeason.rate,

    // Distribution and edge (L10)
    avg: doublePrecision('avg'),
    median: doublePrecision('median'),
    edgeAvg: doublePrecision('edge_avg'),
    edgeMedian: doublePrecision('edge_median'),
    streak: integer('streak').notNull().default(0),

    // Price
    bestPrice: integer('best_price'),
    bestBook: text('best_book').$type<Book>(),
    impliedProbNovig: doublePrecision('implied_prob_novig'),
    /** rate_l10 − implied_prob_novig (0..1 scale). */
    value: doublePrecision('value'),

    // Matchup and situation
    dvpRank: integer('dvp_rank'),
    dvpTier: text('dvp_tier').$type<DvpTier>(),
    restDays: integer('rest_days'),
    isB2b: boolean('is_b2b').notNull().default(false),

    // Role
    minutesL5: doublePrecision('minutes_l5'),
    usageL10: doublePrecision('usage_l10'),
    isStarter: boolean('is_starter').notNull().default(false),

    // Health
    injuryStatus: text('injury_status').$type<InjuryStatus>(),
    teammateOut: boolean('teammate_out').notNull().default(false),
    teammatesOut: jsonb('teammates_out').$type<TeammateOut[]>().notNull().default([]),

    // Market moves and game lines
    lineOpen: doublePrecision('line_open'),
    /** current line − first captured line. */
    lineMove: doublePrecision('line_move'),
    gameTotal: doublePrecision('game_total'),
    gameSpread: doublePrecision('game_spread'),

    computedAt: tstz('computed_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('prop_metrics_natural_uq').on(t.gameId, t.playerId, t.market, t.side),
    index('prop_metrics_game_idx').on(t.gameId),
    index('prop_metrics_player_idx').on(t.playerId),
    index('prop_metrics_market_idx').on(t.market),
    index('prop_metrics_tip_at_idx').on(t.tipAt),
    index('prop_metrics_team_abbr_idx').on(t.teamAbbr),
    index('prop_metrics_rate_l5_idx').on(t.rateL5),
    index('prop_metrics_rate_l10_idx').on(t.rateL10),
    index('prop_metrics_rate_l20_idx').on(t.rateL20),
    index('prop_metrics_rate_season_idx').on(t.rateSeason),
    index('prop_metrics_rate_h2h_idx').on(t.rateH2h),
    index('prop_metrics_rate_last_season_idx').on(t.rateLastSeason),
    index('prop_metrics_edge_avg_idx').on(t.edgeAvg),
    index('prop_metrics_value_idx').on(t.value),
    index('prop_metrics_best_price_idx').on(t.bestPrice),
    index('prop_metrics_line_move_idx').on(t.lineMove),
    index('prop_metrics_streak_idx').on(t.streak),
    index('prop_metrics_dvp_rank_idx').on(t.dvpRank),
  ],
);

/** Allowed stat per game to each position, ranked 1 (toughest) to 30. */
export const teamDvp = pgTable(
  'team_dvp',
  {
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id),
    position: text('position').$type<Position>().notNull(),
    market: text('market').$type<Market>().notNull(),
    window: text('window').$type<'l15' | 'season'>().notNull(),
    allowedPerGame: doublePrecision('allowed_per_game').notNull(),
    rank: integer('rank').notNull(),
    tier: text('tier').$type<DvpTier>().notNull(),
    computedAt: tstz('computed_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'team_dvp_pk', columns: [t.teamId, t.position, t.market, t.window] })],
);

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Every external response, written before it is parsed. */
export const rawPayloads = pgTable(
  'raw_payloads',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    provider: text('provider').notNull(),
    endpoint: text('endpoint').notNull(),
    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
    fetchedAt: tstz('fetched_at').notNull().defaultNow(),
    body: jsonb('body').$type<unknown>(),
  },
  (t) => [index('raw_payloads_provider_fetched_idx').on(t.provider, t.fetchedAt.desc())],
);

export const apiUsage = pgTable(
  'api_usage',
  {
    provider: text('provider').notNull(),
    /** 'YYYY-MM' */
    month: text('month').notNull(),
    units: integer('units').notNull().default(0),
  },
  (t) => [primaryKey({ name: 'api_usage_pk', columns: [t.provider, t.month] })],
);

export const jobRuns = pgTable(
  'job_runs',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    job: text('job').notNull(),
    startedAt: tstz('started_at').notNull().defaultNow(),
    finishedAt: tstz('finished_at'),
    status: text('status').$type<'running' | 'ok' | 'error'>().notNull().default('running'),
    units: integer('units'),
    error: text('error'),
    meta: jsonb('meta').$type<Record<string, unknown>>(),
  },
  (t) => [index('job_runs_job_started_idx').on(t.job, t.startedAt.desc())],
);

// ---------------------------------------------------------------------------
// Users (Auth.js uses JWT sessions; no adapter tables)
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: createdAt(),
});

export const userSettings = pgTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  theme: text('theme').$type<'light' | 'dark' | 'system'>().notNull().default('system'),
  oddsFormat: text('odds_format').$type<'american' | 'decimal'>().notNull().default('american'),
  books: jsonb('books').$type<Book[]>().notNull().default([]),
  skipIntro: boolean('skip_intro').notNull().default(false),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

/** A favorite follows a player/market/side across games. */
export const favorites = pgTable(
  'favorites',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id),
    market: text('market').$type<Market>().notNull(),
    side: text('side').$type<Side>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ name: 'favorites_pk', columns: [t.userId, t.playerId, t.market, t.side] })],
);

export const filterPresets = pgTable(
  'filter_presets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    filterState: jsonb('filter_state').$type<Partial<BoardFilter>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('filter_presets_user_name_uq').on(t.userId, t.name)],
);

export const slips = pgTable(
  'slips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    book: text('book').$type<Book>(),
    stake: doublePrecision('stake'),
    createdAt: createdAt(),
  },
  (t) => [index('slips_user_created_idx').on(t.userId, t.createdAt.desc())],
);

export const slipLegs = pgTable(
  'slip_legs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slipId: uuid('slip_id')
      .notNull()
      .references(() => slips.id, { onDelete: 'cascade' }),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id),
    market: text('market').$type<Market>().notNull(),
    side: text('side').$type<Side>().notNull(),
    line: doublePrecision('line').notNull(),
    price: integer('price').notNull(),
    result: text('result').$type<LegResult>().notNull().default('pending'),
    gradedAt: tstz('graded_at'),
  },
  (t) => [
    index('slip_legs_slip_idx').on(t.slipId),
    index('slip_legs_result_game_idx').on(t.result, t.gameId),
  ],
);
