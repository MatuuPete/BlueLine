import { nyDate } from '@blueline/adapters';
import { MARKET_PRIORITY, type Market } from '@blueline/contracts';
import { and, apiUsage, eq, sql, type Db } from '@blueline/db';

export const DEFAULT_ODDS_MONTHLY_BUDGET = 2500;

/** Budget month, 'YYYY-MM' in America/New_York. */
export function monthOf(now: Date): string {
  return nyDate(now).slice(0, 7);
}

export async function getUsage(db: Db, provider: string, month: string): Promise<number> {
  const [row] = await db
    .select({ units: apiUsage.units })
    .from(apiUsage)
    .where(and(eq(apiUsage.provider, provider), eq(apiUsage.month, month)));
  return row?.units ?? 0;
}

/** Add units to this month's usage for a provider (no-op for 0). */
export async function addUsage(
  db: Db,
  provider: string,
  month: string,
  units: number,
): Promise<void> {
  if (units <= 0) return;
  await db
    .insert(apiUsage)
    .values({ provider, month, units })
    .onConflictDoUpdate({
      target: [apiUsage.provider, apiUsage.month],
      set: { units: sql`${apiUsage.units} + excluded.units` },
    });
}

export type MarketPlan =
  | { skipped: false; markets: Market[]; trimmed: Market[]; estimate: number }
  | { skipped: 'budget'; markets: []; trimmed: Market[]; estimate: number };

/**
 * Pick the markets to pull. Starts from `wanted` in MARKET_PRIORITY order and
 * drops the least valuable market until `used + estimate <= budget`. If not even
 * the top market fits, the pull is skipped.
 */
export function planMarkets(args: {
  used: number;
  budget: number;
  games: number;
  wanted: readonly Market[];
  estimate: (games: number, markets: number) => number;
}): MarketPlan {
  const ordered = MARKET_PRIORITY.filter((m) => args.wanted.includes(m));
  for (let k = ordered.length; k >= 1; k--) {
    const estimate = args.estimate(args.games, k);
    if (args.used + estimate <= args.budget) {
      return { skipped: false, markets: ordered.slice(0, k), trimmed: ordered.slice(k), estimate };
    }
  }
  return {
    skipped: 'budget',
    markets: [],
    trimmed: ordered,
    estimate: args.estimate(args.games, Math.min(1, ordered.length)),
  };
}
