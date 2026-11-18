// The working slip (client state) and its math. Pure; the React context lives in app/(app)/_shell.
import type { CreateSlipInput, GameLogEntry, Market, Side } from '@blueline/contracts';
import { isPlayed, jointHitRate, parlay, statValue } from '@blueline/analytics';

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
