import { z } from 'zod';

/** Box-score stat keys. Same names as the `player_game_logs` columns and analytics `LogLine`. */
export const STAT_KEYS = ['pts', 'reb', 'ast', 'fg3m', 'stl', 'blk', 'tov'] as const;
export const StatKeySchema = z.enum(STAT_KEYS);
export type StatKey = z.infer<typeof StatKeySchema>;

/** Prop markets (spec §5). Single stats first, then combos. */
export const MARKETS = [
  'PTS',
  'REB',
  'AST',
  '3PM',
  'STL',
  'BLK',
  'TOV',
  'PRA',
  'PR',
  'PA',
  'RA',
  'STOCKS',
] as const;
export const MarketSchema = z.enum(MARKETS);
export type Market = z.infer<typeof MarketSchema>;

/** The box-score stats summed to grade each market. */
export const MARKET_COMPONENTS: Readonly<Record<Market, readonly StatKey[]>> = {
  PTS: ['pts'],
  REB: ['reb'],
  AST: ['ast'],
  '3PM': ['fg3m'],
  STL: ['stl'],
  BLK: ['blk'],
  TOV: ['tov'],
  PRA: ['pts', 'reb', 'ast'],
  PR: ['pts', 'reb'],
  PA: ['pts', 'ast'],
  RA: ['reb', 'ast'],
  STOCKS: ['stl', 'blk'],
};

export const MARKET_LABELS: Readonly<Record<Market, string>> = {
  PTS: 'Points',
  REB: 'Rebounds',
  AST: 'Assists',
  '3PM': '3-Pointers Made',
  STL: 'Steals',
  BLK: 'Blocks',
  TOV: 'Turnovers',
  PRA: 'Pts + Reb + Ast',
  PR: 'Pts + Reb',
  PA: 'Pts + Ast',
  RA: 'Reb + Ast',
  STOCKS: 'Stocks (Stl + Blk)',
};

/**
 * Most valuable first. When the odds budget is tight, `ingest:odds` drops markets
 * from the end of this list until the pull fits.
 */
export const MARKET_PRIORITY: readonly Market[] = [
  'PTS',
  'REB',
  'AST',
  'PRA',
  '3PM',
  'PR',
  'PA',
  'RA',
  'STOCKS',
  'BLK',
  'STL',
  'TOV',
];

export const SideSchema = z.enum(['over', 'under']);
export type Side = z.infer<typeof SideSchema>;

/** Hit-rate windows (spec §5). `lastSeason` maps to the `*_last_season` DB columns. */
export const WINDOWS = ['l5', 'l10', 'l20', 'season', 'h2h', 'lastSeason'] as const;
export const WindowSchema = z.enum(WINDOWS);
export type Window = z.infer<typeof WindowSchema>;

export const POSITIONS = ['G', 'F', 'C'] as const;
export const PositionSchema = z.enum(POSITIONS);
export type Position = z.infer<typeof PositionSchema>;

/** DvP tiers. Rank 1 = toughest. best 1–6, good 7–15, bad 16–24, worst 25–30. */
export const DVP_TIERS = ['best', 'good', 'bad', 'worst'] as const;
export const DvpTierSchema = z.enum(DVP_TIERS);
export type DvpTier = z.infer<typeof DvpTierSchema>;

/** Sportsbooks we keep. Adapters map vendor book ids to these and drop the rest. */
export const BOOKS = [
  'draftkings',
  'fanduel',
  'betmgm',
  'caesars',
  'espnbet',
  'fanatics',
  'betrivers',
  'bet365',
  'hardrock',
] as const;
export const BookSchema = z.enum(BOOKS);
export type Book = z.infer<typeof BookSchema>;

/** Text badges only, never logos (spec §8). */
export const BOOK_LABELS: Readonly<Record<Book, string>> = {
  draftkings: 'DraftKings',
  fanduel: 'FanDuel',
  betmgm: 'BetMGM',
  caesars: 'Caesars',
  espnbet: 'ESPN BET',
  fanatics: 'Fanatics',
  betrivers: 'BetRivers',
  bet365: 'bet365',
  hardrock: 'Hard Rock',
};

/** Injury report statuses, lowercased from ESPN ("Day-To-Day" → 'day-to-day'). */
export const INJURY_STATUSES = [
  'out',
  'doubtful',
  'questionable',
  'day-to-day',
  'probable',
] as const;
export const InjuryStatusSchema = z.enum(INJURY_STATUSES);
export type InjuryStatus = z.infer<typeof InjuryStatusSchema>;

/** Statuses removed by the board's "exclude Questionable or worse" filter. */
export const QUESTIONABLE_OR_WORSE: readonly InjuryStatus[] = [
  'out',
  'doubtful',
  'questionable',
  'day-to-day',
];

/** Statuses that count a teammate as "out" for `teammates_out` (spec §5). */
export const TEAMMATE_OUT_STATUSES: readonly InjuryStatus[] = ['out', 'doubtful'];

export const GAME_STATUSES = [
  'scheduled',
  'in_progress',
  'final',
  'postponed',
  'canceled',
] as const;
export const GameStatusSchema = z.enum(GAME_STATUSES);
export type GameStatus = z.infer<typeof GameStatusSchema>;

export const LEG_RESULTS = ['pending', 'hit', 'miss', 'push', 'void'] as const;
export const LegResultSchema = z.enum(LEG_RESULTS);
export type LegResult = z.infer<typeof LegResultSchema>;

/** Valid American odds: an integer with 100 ≤ |x| ≤ 10000. */
export const AmericanOddsSchema = z
  .number()
  .int()
  .refine((x) => Math.abs(x) >= 100 && Math.abs(x) <= 10000, {
    message: 'American odds must satisfy 100 <= |x| <= 10000',
  });
export type AmericanOdds = z.infer<typeof AmericanOddsSchema>;
