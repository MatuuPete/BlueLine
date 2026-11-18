// The working slip (client state) and its math. Pure; the React context lives in app/(app)/_shell.
import {
  AmericanOddsSchema,
  MarketSchema,
  SideSchema,
  type CreateSlipInput,
  type GameLogEntry,
  type Market,
  type Side,
} from '@blueline/contracts';
import { hitRate, isPlayed, jointHitRate, parlay, statValue } from '@blueline/analytics';

/** CreateSlipInputSchema allows at most 12 legs. */
export const MAX_LEGS = 12;

export interface SlipLeg {
  /** propKey: `${gameId}:${playerId}:${market}:${side}`. */
  key: string;
  gameId: string;
  playerId: string;
  playerName: string;
  market: Market;
  side: Side;
  line: number;
  /** American odds; null when no book prices the prop. */
  price: number | null;
  /** e.g. "BOS @ NYK". */
  matchup: string;
}

const str = (v: unknown, max = 200): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;

function isSlipLeg(v: unknown): v is SlipLeg {
  if (!v || typeof v !== 'object') return false;
  const l = v as Record<string, unknown>;
  return (
    str(l.key) &&
    str(l.gameId, 64) &&
    str(l.playerId, 64) &&
    str(l.playerName) &&
    typeof l.matchup === 'string' &&
    MarketSchema.safeParse(l.market).success &&
    SideSchema.safeParse(l.side).success &&
    typeof l.line === 'number' &&
    Number.isFinite(l.line) &&
    l.line >= 0 &&
    l.line <= 200 &&
    (l.price === null || AmericanOddsSchema.safeParse(l.price).success)
  );
}

/** The slip saved in localStorage: malformed or duplicate legs are dropped, 12 at most. */
export function parseStoredLegs(raw: string | null): SlipLeg[] {
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: SlipLeg[] = [];
  for (const v of parsed) {
    if (!isSlipLeg(v) || out.some((l) => l.key === v.key)) continue;
    out.push({
      key: v.key,
      gameId: v.gameId,
      playerId: v.playerId,
      playerName: v.playerName,
      market: v.market,
      side: v.side,
      line: v.line,
      price: v.price,
      matchup: v.matchup,
    });
    if (out.length === MAX_LEGS) break;
  }
  return out;
}

const sameProp = (a: SlipLeg, b: SlipLeg) =>
  a.gameId === b.gameId && a.playerId === b.playerId && a.market === b.market;

/**
 * Add the leg, or remove it when it is already in the slip. Picking the other side
 * (or another line) of a prop already in the slip replaces it. Full slips stay full.
 */
export function toggleLeg(legs: readonly SlipLeg[], leg: SlipLeg): SlipLeg[] {
  if (legs.some((l) => l.key === leg.key && l.line === leg.line)) {
    return legs.filter((l) => l.key !== leg.key);
  }
  const i = legs.findIndex((l) => sameProp(l, leg));
  if (i >= 0) return legs.map((l, j) => (j === i ? leg : l));
  if (legs.length >= MAX_LEGS) return [...legs];
  return [...legs, leg];
}

/** Combined parlay odds, or null when the slip is empty or a leg has no price. */
export function slipOdds(legs: readonly SlipLeg[]): { decimal: number; american: number } | null {
  if (legs.length === 0 || legs.some((l) => l.price === null)) return null;
  return parlay(legs.map((l) => ({ price: l.price! })));
}

export function formatDecimalOdds(decimal: number): string {
  return decimal.toFixed(2);
}

/** Keys of legs that share a game with another leg (spec §5: flagged "correlated"). */
export function correlatedKeys(legs: readonly SlipLeg[]): Set<string> {
  const byGame = new Map<string, number>();
  for (const l of legs) byGame.set(l.gameId, (byGame.get(l.gameId) ?? 0) + 1);
  return new Set(legs.filter((l) => (byGame.get(l.gameId) ?? 0) > 1).map((l) => l.key));
}

/**
 * Joint hit rate over the games every leg's player played (analytics jointHitRate).
 * `logs` maps leg key → that player's game log. Null when any leg has no log yet.
 */
export function jointFromLogs(
  legs: readonly SlipLeg[],
  logs: ReadonlyMap<string, readonly GameLogEntry[]>,
): { hits: number; n: number; rate: number | null } | null {
  if (legs.length === 0) return null;
  const inputs = [];
  for (const leg of legs) {
    const log = logs.get(leg.key);
    if (!log) return null;
    const values = new Map<string, number>();
    for (const g of log) if (isPlayed(g)) values.set(g.gameId, statValue(g, leg.market));
    inputs.push({ values, line: leg.line, side: leg.side });
  }
  return jointHitRate(inputs);
}

/** Fewer shared games than this is too thin for a joint rate; fall back to independence. */
export const MIN_JOINT_GAMES = 5;

export type SlipHitEstimate =
  | { kind: 'joint'; hits: number; n: number; rate: number | null }
  | { kind: 'independent'; rate: number | null };

/**
 * How often the whole slip would have hit. Uses the joint hit rate over shared games
 * when there are at least 5 of them; otherwise (the usual multi-game slip, or a thin
 * overlap) falls back to treating the legs
 * as independent: the product of each leg's own L10 hit rate (spec §5).
 * Null while any leg's log is still missing.
 */
export function slipHitEstimate(
  legs: readonly SlipLeg[],
  logs: ReadonlyMap<string, readonly GameLogEntry[]>,
): SlipHitEstimate | null {
  const joint = jointFromLogs(legs, logs);
  if (!joint) return null;
  if (joint.n >= MIN_JOINT_GAMES) return { kind: 'joint', ...joint };
  let rate = 1;
  for (const leg of legs) {
    const last10 = logs.get(leg.key)!.filter(isPlayed).slice(-10);
    const own = hitRate(last10, leg.market, leg.line, leg.side);
    if (own.rate === null) return { kind: 'independent', rate: null };
    rate *= own.rate;
  }
  return { kind: 'independent', rate };
}

/** POST /api/slips body, or null when a leg has no price to save. */
export function slipBody(name: string, legs: readonly SlipLeg[]): CreateSlipInput | null {
  if (legs.length === 0 || legs.some((l) => l.price === null)) return null;
  return {
    name,
    book: null,
    stake: null,
    legs: legs.map((l) => ({
      gameId: l.gameId,
      playerId: l.playerId,
      market: l.market,
      side: l.side,
      line: l.line,
      price: l.price!,
    })),
  };
}
