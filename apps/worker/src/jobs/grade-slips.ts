import { gradeLeg } from '@blueline/analytics';
import type { GameStatus, LegResult } from '@blueline/contracts';
import { and, count, eq, games, inArray, slipLegs } from '@blueline/db';
import { loadGameLogs, type LogRow } from '../logs';
import type { Job } from '../run-job';
import { chunk } from '../store';

/** Game statuses that settle a leg. */
const SETTLED: GameStatus[] = ['final', 'postponed', 'canceled'];

/**
 * grade-slips
 * Resolves pending slip legs with analytics `gradeLeg`: hit/miss/push from the
 * player's box score on final games; void for a DNP, no box line, or a
 * postponed/canceled game. A final game whose box score has not landed yet
 * (no logs at all) stays pending until a later run.
 */
export const gradeSlips: Job = async (ctx) => {
  const legs = await ctx.db
    .select({
      id: slipLegs.id,
      gameId: slipLegs.gameId,
      playerId: slipLegs.playerId,
      market: slipLegs.market,
      side: slipLegs.side,
      line: slipLegs.line,
      status: games.status,
    })
    .from(slipLegs)
    .innerJoin(games, eq(games.id, slipLegs.gameId))
    .where(and(eq(slipLegs.result, 'pending'), inArray(games.status, SETTLED)));

  const finalIds = [...new Set(legs.filter((l) => l.status === 'final').map((l) => l.gameId))];
  const boxes = new Map<string, LogRow>();
  const withBox = new Set<string>();
  for (const l of await loadGameLogs(ctx.db, finalIds)) {
    boxes.set(`${l.gameId}|${l.playerId}`, l);
    withBox.add(l.gameId);
  }

  const byResult = new Map<LegResult, string[]>();
  let waiting = 0;
  for (const leg of legs) {
    if (leg.status === 'final' && !withBox.has(leg.gameId)) {
      waiting++;
      continue;
    }
    const box = boxes.get(`${leg.gameId}|${leg.playerId}`) ?? null;
    const result = gradeLeg(leg, box, leg.status);
    if (result === 'pending') {
      waiting++;
      continue;
    }
    byResult.set(result, [...(byResult.get(result) ?? []), leg.id]);
  }

  const counts: Partial<Record<LegResult, number>> = {};
  let graded = 0;
  for (const [result, ids] of byResult) {
    counts[result] = ids.length;
    graded += ids.length;
    for (const part of chunk(ids, 500)) {
      await ctx.db
        .update(slipLegs)
        .set({ result, gradedAt: ctx.now })
        .where(and(inArray(slipLegs.id, part), eq(slipLegs.result, 'pending')));
    }
  }

  const [{ pending } = { pending: 0 }] = await ctx.db
    .select({ pending: count() })
    .from(slipLegs)
    .where(eq(slipLegs.result, 'pending'));
  return { meta: { graded, ...counts, waitingForBox: waiting, pending } };
};
