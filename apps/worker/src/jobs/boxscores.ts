import { addDays, nyDate } from '@blueline/adapters';
import { parsePositiveInt, parseYmd } from '../ids';
import type { Job, JobOpts } from '../run-job';
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

/**
 * ingest:boxscores [--date YYYY-MM-DD] [--days N]
 * For each day (default: yesterday), refresh the games, then upsert a log line
 * per player for every final game.
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
  return {
    meta: { from: dates[0], to: dates.at(-1), days: dates.length, games: gameCount, finals, logs },
  };
};
