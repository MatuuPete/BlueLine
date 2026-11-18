import { addDays, nyDate } from '@blueline/adapters';
import { lt, rawPayloads } from '@blueline/db';
import { parsePositiveInt, parseYmd } from '../ids';
import type { Job, JobContext, JobOpts } from '../run-job';
import { ensureTeams, upsertBoxScore, upsertGames } from '../store';

/** The slate dates a boxscores run covers. */
export function boxscoreDates(now: Date, opts: JobOpts): string[] {
  if (typeof opts.dates === 'string' && opts.dates) {
    return opts.dates.split(',').map((d) => parseYmd(d.trim(), '--dates'));
  }
  const end = opts.date ? parseYmd(opts.date) : addDays(nyDate(now), -1);
  const days = opts.days ? parsePositiveInt(opts.days, '--days') : 1;
  return Array.from({ length: days }, (_, i) => addDays(end, i - days + 1));
}

export const DEFAULT_RAW_PAYLOAD_RETENTION_DAYS = 21;

/** Delete raw_payloads older than the retention window; returns the number deleted. */
export async function pruneRawPayloads(ctx: JobContext): Promise<number> {
  const days = ctx.rawPayloadRetentionDays ?? DEFAULT_RAW_PAYLOAD_RETENTION_DAYS;
  const cutoff = new Date(ctx.now.getTime() - days * 86_400_000);
  const gone = await ctx.db
    .delete(rawPayloads)
    .where(lt(rawPayloads.fetchedAt, cutoff))
    .returning({ id: rawPayloads.id });
  return gone.length;
}

/**
 * ingest:boxscores [--date YYYY-MM-DD] [--days N]
 * For each day (default: yesterday), refresh the games, then upsert a log line
 * per player for every final game. Then prunes raw_payloads past the retention window
 * (RAW_PAYLOAD_RETENTION_DAYS, default 21), since this is the daily job.
 */
export const ingestBoxscores: Job = async (ctx, opts) => {
  const dates = boxscoreDates(ctx.now, opts);
  let gameCount = 0;
  let finals = 0;
  let logs = 0;
  for (const date of dates) {
    const games = await ctx.stats.getSchedule(date);
    const map = await ensureTeams(
      ctx,
      games.flatMap((g) => [g.homeTeamExternalId, g.awayTeamExternalId]),
    );
    gameCount += await upsertGames(ctx.db, games, map);
    for (const g of games.filter((x) => x.status === 'final')) {
      const box = await ctx.stats.getBoxScore(g.externalId);
      logs += await upsertBoxScore(ctx.db, box, map);
      finals++;
    }
  }
  const prunedRaw = await pruneRawPayloads(ctx);
  return {
    meta: {
      from: dates[0],
      to: dates.at(-1),
      days: dates.length,
      games: gameCount,
      finals,
      logs,
      prunedRaw,
    },
  };
};
