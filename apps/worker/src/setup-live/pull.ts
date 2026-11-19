// First real data pull for setup:live. Reuses the worker jobs through runJob (same code path
// as the CLI and the ingest workflow); only the sequence and the options live here.
import { addDays, nyDate } from '@blueline/adapters';
import {
  count,
  games,
  injuries,
  playerGameLogs,
  propMetrics,
  propOffers,
  teams,
  type Db,
} from '@blueline/db';
import { JOB_REGISTRY, type JobName } from '../jobs';
import { runJob, type JobContext, type JobOpts } from '../run-job';

export interface PullStep {
  label: string;
  job: JobName;
  opts: JobOpts;
}

/** Schedule (7 days), box scores (30 days back), injuries, odds (today + tomorrow), precompute. */
export function pullSteps(now: Date): PullStep[] {
  const today = nyDate(now);
  return [
    { label: 'schedule (7 days)', job: 'ingest:schedule', opts: { days: '7' } },
    { label: 'box scores (last 30 days)', job: 'ingest:boxscores', opts: { days: '30' } },
    { label: 'injuries', job: 'ingest:injuries', opts: {} },
    { label: 'odds (today)', job: 'ingest:odds', opts: { date: today } },
    { label: 'odds (tomorrow)', job: 'ingest:odds', opts: { date: addDays(today, 1) } },
    { label: 'precompute', job: 'precompute', opts: {} },
  ];
}

export interface PullReport {
  steps: { label: string; ok: boolean; error?: string }[];
  counts: Record<string, number>;
  ok: boolean;
}

export async function countRows(db: Db): Promise<Record<string, number>> {
  const tables = {
    teams,
    games,
    player_game_logs: playerGameLogs,
    injuries,
    prop_offers: propOffers,
    prop_metrics: propMetrics,
  };
  const out: Record<string, number> = {};
  for (const [name, table] of Object.entries(tables)) {
    const [row] = await db.select({ n: count() }).from(table);
    out[name] = Number(row?.n ?? 0);
  }
  return out;
}

/**
 * Run every step, continuing past a failed one (a flaky odds call must not block precompute).
 * Never throws for a job failure: the report says what failed.
 */
export async function pullInitialData(ctx: JobContext): Promise<PullReport> {
  const steps: PullReport['steps'] = [];
  for (const step of pullSteps(ctx.now)) {
    ctx.log(`  ${step.label}...`);
    try {
      await runJob(step.job, JOB_REGISTRY[step.job], ctx, step.opts);
      steps.push({ label: step.label, ok: true });
    } catch (err) {
      steps.push({
        label: step.label,
        ok: false,
        error: (err instanceof Error ? err.message : String(err)).slice(0, 300),
      });
    }
  }
  const counts = await countRows(ctx.db);
  return { steps, counts, ok: steps.every((s) => s.ok) };
}
