import { addDays, nyDate } from '@blueline/adapters';
import { parsePositiveInt } from '../ids';
import { runJob, type Job } from '../run-job';
import { ingestBoxscores } from './boxscores';
import { ingestInjuries } from './injuries';
import { ingestOdds } from './odds';
import { precompute } from './precompute';
import { ingestSchedule } from './schedule';

/**
 * seed [--days N]
 * Populates a dev database: schedule → box scores for the last N (default 30)
 * fixture days → injuries → odds for every upcoming fixture day → precompute.
 * Each step is its own job run. The CLI always runs seed against the fixture
 * providers.
 */
export const seed: Job = async (ctx, opts) => {
  const today = nyDate(ctx.now);
  const days = opts.days ? parsePositiveInt(opts.days, '--days') : 30;
  const listed = (await ctx.stats.listDates?.()) ?? [];
  const past = listed.length
    ? listed.filter((d) => d < today).slice(-days)
    : Array.from({ length: days }, (_, i) => addDays(today, i - days));
  const upcoming = listed.length ? listed.filter((d) => d >= today) : [today];

  await runJob('ingest:schedule', ingestSchedule, ctx, { date: today, days: '7' });
  await runJob('ingest:boxscores', ingestBoxscores, ctx, { dates: past.join(',') });
  await runJob('ingest:injuries', ingestInjuries, ctx, {});
  let units = 0;
  for (const date of upcoming) {
    units += (await runJob('ingest:odds', ingestOdds, ctx, { date })).units ?? 0;
  }
  await runJob('precompute', precompute, ctx, {});
  return { units, meta: { pastDays: past.length, from: past[0], upcoming } };
};
