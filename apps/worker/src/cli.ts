// BlueLine worker CLI.
// Usage: corepack pnpm worker <job> [--date YYYY-MM-DD] [--days N] [--closing] [--incremental]
import { Command, CommanderError } from 'commander';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createContext, loadDotEnv, readConfig } from './context';
import { JOB_REGISTRY, type JobName } from './jobs';
import { runJob, type JobOpts } from './run-job';

export const JOBS = [
  'ingest:schedule',
  'ingest:boxscores',
  'ingest:injuries',
  'ingest:odds',
  'precompute',
  'grade-slips',
  'seed',
] as const satisfies readonly JobName[];

export const USAGE = `Usage: corepack pnpm worker <job> [options]

Jobs:
  ${JOBS.join('\n  ')}

Options:
  --date YYYY-MM-DD   target slate date (America/New_York)
  --days N            number of days (schedule: ahead, boxscores: back, seed: history)
  --closing           odds: pull games tipping within 45 minutes and mark them closing
  --incremental       precompute: recompute only games tipping today

Environment:
  DATABASE_URL         pglite:<dir> (default pglite:.data/pglite) or a Postgres URL
  STATS_PROVIDER       espn | fixtures (default fixtures)
  ODDS_PROVIDER        sgo | theoddsapi | fixtures (default fixtures)
  SGO_API_KEY, THE_ODDS_API_KEY
  ODDS_MONTHLY_BUDGET  odds units per month (default 2500)
`;

function buildProgram(): Command {
  return new Command('worker')
    .argument('<job>', `one of: ${JOBS.join(', ')}`)
    .option('--date <ymd>', 'target slate date (YYYY-MM-DD, America/New_York)')
    .option('--days <n>', 'number of days')
    .option('--closing', 'odds: closing-line pull')
    .option('--incremental', 'precompute: only games tipping today')
    .helpOption('-h, --help')
    .addHelpText('after', `\n${USAGE}`)
    .exitOverride()
    .configureOutput({ writeErr: (s) => process.stderr.write(s) });
}

/** Parse argv (without node and script) into a job name and options. */
export function parseArgs(argv: string[]): { job: JobName; opts: JobOpts } {
  const program = buildProgram();
  program.parse(argv, { from: 'user' });
  const job = program.args[0] ?? '';
  if (!(JOBS as readonly string[]).includes(job)) {
    throw new Error(`Unknown job "${job}".\n\n${USAGE}`);
  }
  const opts: JobOpts = {};
  for (const [k, v] of Object.entries(program.opts())) {
    if (typeof v === 'string' || typeof v === 'boolean') opts[k] = v;
  }
  return { job: job as JobName, opts };
}

export async function main(argv: string[]): Promise<number> {
  if (argv.length === 0) {
    console.log(USAGE);
    return 0;
  }
  let parsed: { job: JobName; opts: JobOpts };
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    if (err instanceof CommanderError) return err.exitCode;
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
  loadDotEnv();
  const config = readConfig();
  const forceFixtures = parsed.job === 'seed';
  if (forceFixtures) console.log('seed: using the fixture providers');
  const { ctx, close } = await createContext(config, { forceFixtures });
  try {
    await runJob(parsed.job, JOB_REGISTRY[parsed.job], ctx, parsed.opts);
    return 0;
  } catch {
    return 1;
  } finally {
    await close();
  }
}

const invokedDirectly = (() => {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? '')).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2));
}
