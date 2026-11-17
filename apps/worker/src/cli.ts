// BlueLine worker CLI. Placeholder until Task 6 wires the jobs.
// Usage: corepack pnpm worker <job> [--date YYYY-MM-DD] [--closing] [--incremental]

export const JOBS = [
  'ingest:schedule',
  'ingest:boxscores',
  'ingest:injuries',
  'ingest:odds',
  'precompute',
  'grade-slips',
  'seed',
] as const;

export const USAGE = `Usage: corepack pnpm worker <job> [options]

Jobs:
  ${JOBS.join('\n  ')}

Options:
  --date YYYY-MM-DD   target slate date (America/New_York)
  --closing           mark odds for games tipping within 45 minutes as closing
  --incremental       recompute only games tipping today
`;

const job = process.argv[2];
if (!job || job === '--help' || job === '-h') {
  console.log(USAGE);
} else {
  console.error(`Job "${job}" is not implemented yet.\n\n${USAGE}`);
  process.exitCode = 1;
}
