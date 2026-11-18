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

/** Last run per job, this month's API usage, and row counts of the data tables. */
export async function getStatus(db: Db, opts: StatusOptions): Promise<StatusResponse> {
  const month = (opts.now ?? new Date()).toISOString().slice(0, 7);

  // Latest run per job (job_runs is small; dedupe in JS keeps this portable).
  const runs = await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt), desc(jobRuns.id));
  const latest = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!latest.has(r.job)) latest.set(r.job, r);
  const jobs = [...latest.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([job, r]) => ({
      job,
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
