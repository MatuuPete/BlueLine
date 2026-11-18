import { z } from 'zod';
import {
  AmericanOddsSchema,
  BookSchema,
  DvpTierSchema,
  MarketSchema,
  PositionSchema,
  SideSchema,
  WindowSchema,
} from './enums';

// ---------------------------------------------------------------------------
// Field helpers. Each field accepts its typed value (JSON bodies, saved presets)
// and its URL string form ("PTS,PRA", "80", "1"/"true"/"0"/"false").
// ---------------------------------------------------------------------------

const NUMERIC = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/** "80" → 80, "+100" → 100, "abc" → NaN (rejected by z.number()). Numbers pass through. */
function toNumber(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  return NUMERIC.test(t) ? Number(t) : Number.NaN;
}

/** "1"/"true" → true, "0"/"false" → false. Not z.coerce.boolean(), which maps "false" to true. */
function toBoolean(v: unknown): unknown {
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return v;
}

/** "PTS,PRA" → ['PTS','PRA']. Arrays pass through. */
function toList(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const list = <T extends z.ZodType>(item: T) => z.preprocess(toList, z.array(item)).default([]);
const optNumber = (schema: z.ZodType<number>) => z.preprocess(toNumber, schema).optional();
const flag = () => z.preprocess(toBoolean, z.boolean()).default(false);

/** YYYY-MM-DD that names a real day (rejects 2026-13-01, 2026-02-30). */
export function isCalendarDate(ymd: string): boolean {
  const d = new Date(`${ymd}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd;
}

const percent = z.number().min(0).max(100);
const nonNegInt = z.number().int().min(0);
const dvpRank = z.number().int().min(1).max(30);

// ---------------------------------------------------------------------------
// Board filter (spec §6a). Server-side SQL over `prop_metrics`; round-trips the URL.
// Numeric filters are optional: undefined = not applied. Empty arrays = no restriction.
// ---------------------------------------------------------------------------

/** Sort allowlist. 'hitRate' sorts by the selected `window`'s rate. Ties break on prop key. */
export const BOARD_SORTS = [
  'hitRate',
  'edge',
  'value',
  'odds',
  'lineMove',
  'streak',
  'tipAt',
] as const;
export const BoardSortSchema = z.enum(BOARD_SORTS);
export type BoardSort = z.infer<typeof BoardSortSchema>;

/**
 * Board filter state (spec §6a).
 *
 * Units: `minHitRate`, `minValue` and `minUsage` are percentages (0..100, e.g. 70 = 70%),
 * but the `prop_metrics` columns `rate_*`, `value` and `usage_l10` are fractions (0..1).
 * Query code must divide these filter values by 100 before comparing.
 */
export const BoardFilterSchema = z.strictObject({
  // Scope
  /** Slate date YYYY-MM-DD (America/New_York). Undefined = today's slate. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isCalendarDate, 'Not a real calendar date')
    .optional(),
  /** Internal game ids. */
  games: list(z.string().min(1).max(64)),
  /** Player's team abbreviation, e.g. 'BOS'. */
  teams: list(z.string().regex(/^[A-Z]{2,4}$/)),
  positions: list(PositionSchema),
  /** Player name search (case-insensitive substring). */
  q: z.string().min(1).max(64).optional(),

  // Market
  markets: list(MarketSchema),
  side: z.enum(['both', 'over', 'under']).default('both'),

  // Performance. `window` drives minHitRate, minGames and the 'hitRate' sort.
  window: WindowSchema.default('l10'),
  /** Hit-rate floor in percent (0–100) for `window`. */
  minHitRate: optNumber(percent),
  /** Minimum sample size n for `window`. */
  minGames: optNumber(nonNegInt.max(200)),
  /** streak ≥ N (consecutive latest hits). */
  minStreak: optNumber(z.number().int().min(-100).max(100)),
  /** edge_avg (avg − line, sign flipped for unders) ≥ X. */
  minEdge: optNumber(z.number().min(-100).max(100)),

  // Price
  /** best_price ≥ oddsMin (American). */
  oddsMin: optNumber(AmericanOddsSchema),
  /** best_price ≤ oddsMax (American). */
  oddsMax: optNumber(AmericanOddsSchema),
  /** Books included when picking the best price. Empty = all books. */
  books: list(BookSchema),
  bestPriceOnly: flag(),
  /** value (rate_l10 − no-vig implied prob) ≥ X percentage points. */
  minValue: optNumber(z.number().min(-100).max(100)),

  // Matchup
  dvpTiers: list(DvpTierSchema),
  dvpRankMin: optNumber(dvpRank),
  dvpRankMax: optNumber(dvpRank),

  // Situation
  homeAway: z.enum(['both', 'home', 'away']).default('both'),
  b2bOnly: flag(),
  restDaysMin: optNumber(nonNegInt.max(30)),
  restDaysMax: optNumber(nonNegInt.max(30)),
  totalMin: optNumber(z.number().min(0).max(400)),
  totalMax: optNumber(z.number().min(0).max(400)),
  /** Blowout risk: |game spread| ≤ X. */
  absSpreadMax: optNumber(z.number().min(0).max(50)),

  // Role
  /** minutes_l5 ≥ X. */
  minMinutes: optNumber(z.number().min(0).max(60)),
  /** usage_l10 ≥ X (usage proxy, percent). */
  minUsage: optNumber(percent),
  starterOnly: flag(),

  // Health
  /** Drop players whose status is in QUESTIONABLE_OR_WORSE. */
  excludeQuestionable: flag(),
  /** Only props where a key teammate is Out/Doubtful (prop_metrics.teammate_out). */
  teammateOutOnly: flag(),

  // Market moves
  /** |line_move| ≥ X since open, in `lineMoveDir`. */
  minLineMove: optNumber(z.number().min(0).max(50)),
  lineMoveDir: z.enum(['any', 'up', 'down']).default('any'),

  // Sort and paging
  sort: BoardSortSchema.default('hitRate'),
  dir: z.enum(['desc', 'asc']).default('desc'),
  page: z.preprocess(toNumber, z.number().int().min(1).max(10000)).default(1),
});

export type BoardFilter = z.infer<typeof BoardFilterSchema>;
type BoardFilterKey = keyof BoardFilter;

/**
 * A partial board filter (saved presets, preset patches): same validation and
 * strictness as BoardFilterSchema, but defaults are NOT filled in, so only the
 * given keys come back. (`BoardFilterSchema.partial()` would fill every default.)
 */
export const BoardFilterPatchSchema: z.ZodType<Partial<BoardFilter>> = z.strictObject(
  Object.fromEntries(
    Object.entries(BoardFilterSchema.shape).map(([key, schema]) => [
      key,
      (schema instanceof z.ZodDefault ? schema.unwrap() : schema).optional(),
    ]),
  ),
) as z.ZodType<Partial<BoardFilter>>;

function deepFreeze<T extends object>(o: T): Readonly<T> {
  for (const v of Object.values(o)) if (v && typeof v === 'object') Object.freeze(v);
  return Object.freeze(o);
}

/** The filter an empty query string parses to. Frozen: spread it, don't mutate it. */
export const DEFAULT_BOARD_FILTER: BoardFilter = deepFreeze(BoardFilterSchema.parse({}));

type RawInput = URLSearchParams | Record<string, string | string[] | undefined>;

/**
 * Parse URL search params (or a Next `searchParams` record) into a BoardFilter.
 * Repeated keys and string[] values are comma-joined; empty values count as absent.
 * Unknown keys and invalid values throw a ZodError.
 */
export function parseBoardFilter(input: RawInput): BoardFilter {
  const grouped = new Map<string, string[]>();
  const push = (k: string, v: string) => {
    const arr = grouped.get(k);
    if (arr) arr.push(v);
    else grouped.set(k, [v]);
  };
  if (input instanceof URLSearchParams) {
    input.forEach((v, k) => push(k, v));
  } else {
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined) continue;
      for (const s of Array.isArray(v) ? v : [v]) push(k, s);
    }
  }
  const raw: Record<string, string> = {};
  for (const [k, vs] of grouped) {
    const joined = vs.filter((s) => s !== '').join(',');
    if (joined !== '') raw[k] = joined;
  }
  return BoardFilterSchema.parse(raw);
}

function encodeValue(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => encodeURIComponent(String(x))).join(',');
  if (typeof v === 'boolean') return v ? '1' : '0';
  return encodeURIComponent(String(v));
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  return a === b;
}

/** Serialize to a query string (no leading '?'). Default values are omitted; arrays are comma-joined. */
export function serializeBoardFilter(f: BoardFilter): string {
  const parts: string[] = [];
  for (const key of Object.keys(BoardFilterSchema.shape) as BoardFilterKey[]) {
    const v = f[key];
    if (v === undefined || sameValue(v, DEFAULT_BOARD_FILTER[key])) continue;
    parts.push(`${key}=${encodeValue(v)}`);
  }
  return parts.join('&');
}

// ---------------------------------------------------------------------------
// Prop detail split filters (spec §6b). Applied client-side over a player's logs.
// Defaults mean "no split".
// ---------------------------------------------------------------------------

export const DetailSplitSchema = z.strictObject({
  homeAway: z.enum(['all', 'home', 'away']).default('all'),
  /** Rest before the game: back-to-back (0 days), 1 day, 2+ days. */
  rest: z.enum(['all', 'b2b', 'one', 'twoPlus']).default('all'),
  /** Only games vs tonight's opponent. */
  vsOpponent: z.boolean().default(false),
  /** With/without teammate: player id plus mode. Undefined = no teammate split. */
  teammateId: z.string().min(1).optional(),
  teammateMode: z.enum(['with', 'without']).default('with'),
  minMinutes: z.number().min(0).max(60).optional(),
  /** Opponent DvP tier at game time. Empty = all. */
  oppTiers: z.array(DvpTierSchema).default([]),
  role: z.enum(['all', 'starter', 'bench']).default('all'),
  season: z.enum(['all', 'current', 'last']).default('all'),
  window: z.enum(['all', 'l5', 'l10', 'l20']).default('all'),
  result: z.enum(['all', 'win', 'loss']).default('all'),
  side: SideSchema.default('over'),
  /** Adjusted line (slider / alt line). Undefined = the main line. */
  line: z.number().min(0).max(200).optional(),
});

export type DetailSplit = z.infer<typeof DetailSplitSchema>;
