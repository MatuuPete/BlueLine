import { z } from 'zod';
import {
  AmericanOddsSchema,
  BookSchema,
  MarketSchema,
  SideSchema,
  type Book,
  type DvpTier,
  type GameStatus,
  type InjuryStatus,
  type LegResult,
  type Market,
  type Position,
  type Side,
  type Window,
} from './enums';
import { BoardFilterPatchSchema, type BoardFilter } from './filters';

// JSON DTOs returned by apps/web API routes and server components.
// Dates are ISO 8601 strings; prices are American odds; rates are 0..1.

/** Stable id of a board row: `${gameId}:${playerId}:${market}:${side}`. */
export function propKey(p: {
  gameId: string;
  playerId: string;
  market: Market;
  side: Side;
}): string {
  return `${p.gameId}:${p.playerId}:${p.market}:${p.side}`;
}

export interface WindowRate {
  hits: number;
  /** Sample size (pushes, DNPs and 0-minute games excluded). */
  n: number;
  /** hits / n, or null when n is 0. */
  rate: number | null;
}

export interface TeammateOut {
  playerId: string;
  name: string;
  status: InjuryStatus;
  /** Season minutes per game, used to rank "key" teammates. */
  minutes: number | null;
}

/** One board row (a `prop_metrics` row). */
export interface PropRow {
  propKey: string;
  gameId: string;
  playerId: string;
  playerName: string;
  position: Position;
  teamId: string;
  teamAbbr: string;
  oppTeamId: string;
  oppAbbr: string;
  isHome: boolean;
  tipAt: string;
  market: Market;
  side: Side;
  /** Main line: the modal line across books. */
  line: number;
  rates: Record<Window, WindowRate>;
  /** Last 10 played games' stat values for this market, oldest → newest (HitStrip). */
  recent: number[];
  avg: number | null;
  median: number | null;
  edgeAvg: number | null;
  edgeMedian: number | null;
  /** +k consecutive latest hits, −k misses. */
  streak: number;
  bestPrice: number | null;
  bestBook: Book | null;
  impliedProbNoVig: number | null;
  /** rate_l10 − impliedProbNoVig. */
  value: number | null;
  dvpRank: number | null;
  dvpTier: DvpTier | null;
  restDays: number | null;
  isB2b: boolean;
  minutesL5: number | null;
  usageL10: number | null;
  isStarter: boolean;
  injuryStatus: InjuryStatus | null;
  teammateOut: boolean;
  teammatesOut: TeammateOut[];
  lineOpen: number | null;
  lineMove: number | null;
  gameTotal: number | null;
  gameSpread: number | null;
  computedAt: string;
}

export interface BoardResponse {
  rows: PropRow[];
  total: number;
  page: number;
  pageSize: number;
  filter: BoardFilter;
  /** Latest computed_at across the slate, or null when nothing is computed. */
  computedAt: string | null;
}

/** One game in a player's log. Superset of the analytics `LogLine`. */
export interface GameLogEntry {
  gameId: string;
  date: string;
  season: number;
  teamId: string;
  oppTeamId: string;
  oppAbbr: string;
  isHome: boolean;
  started: boolean;
  dnp: boolean;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  fg3m: number;
  stl: number;
  blk: number;
  tov: number;
  /** Team won the game; null if not final. */
  won: boolean | null;
  restDays: number | null;
  /** Opponent's DvP tier vs this player's position at game time. */
  oppTier: DvpTier | null;
}

export interface ShopRow {
  book: Book;
  line: number;
  overPrice: number | null;
  underPrice: number | null;
  noVigOver: number | null;
  noVigUnder: number | null;
  isBestOver: boolean;
  isBestUnder: boolean;
  capturedAt: string;
}

export interface LineMove {
  book: Book;
  line: number;
  overPrice: number | null;
  underPrice: number | null;
  capturedAt: string;
}

export interface TeamRef {
  id: string;
  abbr: string;
  name: string;
}

export interface GameSummary {
  id: string;
  date: string;
  tipAt: string;
  status: GameStatus;
  home: TeamRef & { score: number | null };
  away: TeamRef & { score: number | null };
  spread: number | null;
  total: number | null;
  propCount: number;
}

export interface InjuryDTO {
  playerId: string;
  name: string;
  teamId: string;
  status: InjuryStatus;
  detail: string | null;
  capturedAt: string;
}

export interface MatchupDvp {
  oppTeamId: string;
  position: Position;
  market: Market;
  window: 'l15' | 'season';
  allowedPerGame: number;
  rank: number;
  tier: DvpTier;
}

export interface PropDetail {
  player: { id: string; name: string; position: Position; teamId: string; teamAbbr: string };
  game: GameSummary;
  market: Market;
  /** Board rows for this player/market/game, one per side (may be empty). */
  metrics: PropRow[];
  /** This season and last season, oldest → newest. */
  logs: GameLogEntry[];
  teammates: { playerId: string; name: string; playedGameIds: string[] }[];
  shop: ShopRow[];
  lineMoves: LineMove[];
  /** Latest injury snapshot for both teams. */
  injuries: InjuryDTO[];
  matchup: MatchupDvp[];
}

export interface SlipLegDTO {
  id: string;
  gameId: string;
  playerId: string;
  playerName: string;
  market: Market;
  side: Side;
  line: number;
  price: number;
  result: LegResult;
}

export interface SlipDTO {
  id: string;
  name: string;
  book: Book | null;
  stake: number | null;
  createdAt: string;
  legs: SlipLegDTO[];
}

/** Favorites follow a player/market/side across games. */
export interface FavoriteDTO {
  playerId: string;
  market: Market;
  side: Side;
  createdAt: string;
}

export interface PresetDTO {
  id: string;
  name: string;
  filter: Partial<BoardFilter>;
  createdAt: string;
}

export interface JobStatus {
  job: string;
  lastRun: {
    status: 'running' | 'ok' | 'error';
    startedAt: string;
    finishedAt: string | null;
    units: number | null;
    error: string | null;
  } | null;
}

export interface StatusResponse {
  jobs: JobStatus[];
  budget: { provider: string; month: string; used: number; limit: number };
  rowCounts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Request bodies / params (parsed in API routes; 400 on failure).
// ---------------------------------------------------------------------------

const id = z.string().min(1).max(64);

export const PropDetailParamsSchema = z.strictObject({
  playerId: id,
  market: MarketSchema,
  gameId: id.optional(),
});
export type PropDetailParams = z.infer<typeof PropDetailParamsSchema>;

export const FavoriteInputSchema = z.strictObject({
  playerId: id,
  market: MarketSchema,
  side: SideSchema,
});
export type FavoriteInput = z.infer<typeof FavoriteInputSchema>;

export const SlipLegInputSchema = z.strictObject({
  gameId: id,
  playerId: id,
  market: MarketSchema,
  side: SideSchema,
  line: z.number().min(0).max(200),
  price: AmericanOddsSchema,
});
export type SlipLegInput = z.infer<typeof SlipLegInputSchema>;

export const CreateSlipInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  book: BookSchema.nullable().default(null),
  stake: z.number().positive().max(1_000_000).nullable().default(null),
  legs: z.array(SlipLegInputSchema).min(1).max(12),
});
export type CreateSlipInput = z.infer<typeof CreateSlipInputSchema>;

export const SavePresetInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
  filter: BoardFilterPatchSchema,
});
export type SavePresetInput = z.infer<typeof SavePresetInputSchema>;

export const UserSettingsSchema = z.strictObject({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  oddsFormat: z.enum(['american', 'decimal']).default('american'),
  /** Books shown in line shopping. Empty = all. */
  books: z.array(BookSchema).default([]),
  skipIntro: z.boolean().default(false),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;
