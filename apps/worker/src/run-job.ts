import type { OddsProvider, StatsProvider } from '@blueline/adapters';
import { eq, jobRuns, type Db } from '@blueline/db';

export interface JobContext {
  db: Db;
  stats: StatsProvider;
  odds: OddsProvider;
  /** The job's clock. Tests pin it; the CLI uses the wall clock. */
  now: Date;
  log: (msg: string) => void;
  /** Monthly odds-provider unit budget (ODDS_MONTHLY_BUDGET). Default 2500. */
  oddsMonthlyBudget?: number;
  /** raw_payloads older than this many days are deleted by the daily job. Default 21. */
  rawPayloadRetentionDays?: number;
}

export type JobOpts = Record<string, string | boolean>;

export interface JobResult {
  units?: number;
  meta?: Record<string, unknown>;
}

export type Job = (ctx: JobContext, opts: JobOpts) => Promise<JobResult>;

/**
 * Run a job with bookkeeping: a `job_runs` row is written as `running`, then
 * updated to `ok` (with units and meta) or `error` (with the message). Errors
 * are rethrown so the CLI exits 1.
 */
export async function runJob(
  name: string,
  job: Job,
  ctx: JobContext,
  opts: JobOpts = {},
): Promise<JobResult> {
  const [run] = await ctx.db
    .insert(jobRuns)
    .values({ job: name, status: 'running', startedAt: new Date() })
    .returning({ id: jobRuns.id });
  const started = Date.now();
  try {
    const result = await job(ctx, opts);
    await ctx.db
      .update(jobRuns)
      .set({
        status: 'ok',
        finishedAt: new Date(),
        units: result.units ?? 0,
        meta: result.meta ?? null,
      })
      .where(eq(jobRuns.id, run!.id));
    ctx.log(`${name}: ok in ${Date.now() - started}ms ${summarize(result)}`);
    return result;
  } catch (err) {
    // Only the message goes to the database; the stack stays in the (private) runner log.
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    await ctx.db
      .update(jobRuns)
      .set({ status: 'error', finishedAt: new Date(), error: message.slice(0, 500) })
      .where(eq(jobRuns.id, run!.id));
    ctx.log(`${name}: error ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

function summarize(r: JobResult): string {
  const parts: string[] = [];
  if (r.units) parts.push(`units=${r.units}`);
  for (const [k, v] of Object.entries(r.meta ?? {})) {
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
      parts.push(`${k}=${v}`);
    } else if (Array.isArray(v)) {
      parts.push(`${k}=[${v.length}]`);
    }
  }
  return parts.join(' ');
}
