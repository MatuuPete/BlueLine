// Prop detail split filters (spec §6b): pure, browser-safe, applied client-side over the logs.
import {
  DetailSplitSchema,
  type Book,
  type DetailSplit,
  type GameLogEntry,
  type PropDetail,
  type ShopRow,
  type Side,
} from '@blueline/contracts';
import { isPlayed, median, statValue } from '@blueline/analytics';

export interface SplitContext {
  /** Tonight's opponent. */
  oppTeamId: string;
  /** Tonight's season. */
  season: number;
  teammates: ReadonlyArray<{ playerId: string; playedGameIds: readonly string[] }>;
}

/** The detail page opens on the last 10 games with no other split. */
export const DEFAULT_SPLIT: DetailSplit = DetailSplitSchema.parse({ window: 'l10' });

const WINDOW_SIZE = { l5: 5, l10: 10, l20: 20 } as const;

/**
 * Played games matching every active split, oldest first. The window (L5/L10/L20)
 * is applied last, so "home, L5" means the last five home games.
 */
export function applySplits(
  logs: readonly GameLogEntry[],
  s: DetailSplit,
  ctx: SplitContext,
): GameLogEntry[] {
  const mate = s.teammateId ? ctx.teammates.find((t) => t.playerId === s.teammateId) : undefined;
  const mateGames = mate ? new Set(mate.playedGameIds) : null;

  const out = logs.filter((l) => {
    if (!isPlayed(l)) return false;
    if (s.homeAway === 'home' && !l.isHome) return false;
    if (s.homeAway === 'away' && l.isHome) return false;
    if (s.rest !== 'all') {
      if (l.restDays === null) return false;
      if (s.rest === 'b2b' && l.restDays !== 0) return false;
      if (s.rest === 'one' && l.restDays !== 1) return false;
      if (s.rest === 'twoPlus' && l.restDays < 2) return false;
    }
    if (s.vsOpponent && l.oppTeamId !== ctx.oppTeamId) return false;
    if (mateGames) {
      const together = mateGames.has(l.gameId);
      if (s.teammateMode === 'with' ? !together : together) return false;
    }
    if (s.minMinutes !== undefined && l.minutes < s.minMinutes) return false;
    if (s.oppTiers.length > 0 && (l.oppTier === null || !s.oppTiers.includes(l.oppTier))) {
      return false;
    }
    if (s.role === 'starter' && !l.started) return false;
    if (s.role === 'bench' && l.started) return false;
    if (s.season === 'current' && l.season !== ctx.season) return false;
    if (s.season === 'last' && l.season !== ctx.season - 1) return false;
    if (s.result === 'win' && l.won !== true) return false;
    if (s.result === 'loss' && l.won !== false) return false;
    return true;
  });

  return s.window === 'all' ? out : out.slice(-WINDOW_SIZE[s.window]);
}

/** Highest price for `side` at exactly `line` among `books` (empty = all books). */
export function bestPriceAt(
  shop: readonly ShopRow[],
  line: number,
  side: Side,
  books: readonly Book[] = [],
): { book: Book; price: number } | null {
  let best: { book: Book; price: number } | null = null;
  for (const r of shop) {
    if (r.line !== line) continue;
    if (books.length > 0 && !books.includes(r.book)) continue;
    const price = side === 'over' ? r.overPrice : r.underPrice;
    if (price === null) continue;
    if (!best || price > best.price) best = { book: r.book, price };
  }
  return best;
}

/** The x.5 line at or just under `v` (22 → 21.5, 22.7 → 22.5), at least 0.5. */
function halfPoint(v: number): number {
  return Math.max(0.5, Math.ceil(v) - 0.5);
}

/**
 * The line the detail page opens on: the board line for this side, else the most
 * common sportsbook line, else the recent median on a half point.
 */
export function defaultLine(d: PropDetail, side: Side): number {
  const board = d.metrics.find((m) => m.side === side) ?? d.metrics[0];
  if (board) return board.line;

  if (d.shop.length > 0) {
    const counts = new Map<number, number>();
    for (const r of d.shop) counts.set(r.line, (counts.get(r.line) ?? 0) + 1);
    let line = d.shop[0]!.line;
    let most = 0;
    for (const [l, c] of counts) {
      if (c > most) {
        line = l;
        most = c;
      }
    }
    return line;
  }

  const recent = d.logs
    .filter(isPlayed)
    .slice(-10)
    .map((l) => statValue(l, d.market));
  const mid = median(recent);
  return mid === null ? 0.5 : halfPoint(mid);
}

/** The alt-line stepper: ±0.5, never below 0.5. */
export function stepLine(line: number, dir: 1 | -1): number {
  return Math.max(0.5, Math.round((line + dir * 0.5) * 2) / 2);
}
