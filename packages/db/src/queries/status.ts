import type { StatusResponse } from '@blueline/contracts';
import {
  apiUsage,
  count,
  desc,
  eq,
  games,
  jobRuns,
  playerGameLogs,
  players,
  propMetrics,
  propOffers,
  teams,
  and,
  type Db,
} from '../index';

export interface StatusOptions {
  /** Odds provider whose monthly unit usage is reported. */
  provider: string;
  /** Monthly unit budget for that provider. */
  limit: number;
  now?: Date;
}

/** Budget month, 'YYYY-MM' in America/New_York (matches the worker's monthOf). */
export function nyMonth(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}`;
}

/** Last run per job, this month's API usage, and row counts of the data tables. */
export async function getStatus(db: Db, opts: StatusOptions): Promise<StatusResponse> {
  const month = nyMonth(opts.now ?? new Date());

  // Latest run per job: DISTINCT ON reads one row per job, not the whole table.
  const runs = await db
    .selectDistinctOn([jobRuns.job])
    .from(jobRuns)
    .orderBy(jobRuns.job, desc(jobRuns.startedAt), desc(jobRuns.id));
  const jobs = runs
    .sort((a, b) => a.job.localeCompare(b.job))
    .map((r) => ({
      job: r.job,
      lastRun: {
        status: r.status,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        units: r.units,
        error: r.error,
      },
    }));

  const [usage] = await db
    .select({ units: apiUsage.units })
    .from(apiUsage)
    .where(and(eq(apiUsage.provider, opts.provider), eq(apiUsage.month, month)));

  const tables = {
    teams,
    players,
    games,
    player_game_logs: playerGameLogs,
    prop_offers: propOffers,
    prop_metrics: propMetrics,
  };
  const rowCounts: Record<string, number> = {};
  for (const [name, table] of Object.entries(tables)) {
    const [c] = await db.select({ n: count() }).from(table);
    rowCounts[name] = Number(c?.n ?? 0);
  }

  return {
    jobs,
    budget: { provider: opts.provider, month, used: usage?.units ?? 0, limit: opts.limit },
    rowCounts,
  };
}
