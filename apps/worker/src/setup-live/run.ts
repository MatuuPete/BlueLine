// The setup:live orchestrator. All I/O is injected (SetupDeps) so tests drive it with PGlite
// and fixture providers; index.ts wires the real Neon connection and the ESPN/SGO providers.
import type { AdminSql, Db } from '@blueline/db';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JobContext } from '../run-job';
import { setupDatabase } from './db-steps';
import {
  DEFAULT_BUDGET,
  parseEnvText,
  renderGithubSecrets,
  renderVercelEnv,
  resolveSecrets,
  type DeployValues,
} from './envfiles';
import type { SetupInputs } from './inputs';
import { pullInitialData, type PullReport } from './pull';
import { maskPassword, randomPassword, WEB_ROLE, WORKER_ROLE } from './sql';
import { withCredentials } from './urls';

export interface SetupDeps {
  connectOwner: (url: string) => Promise<{ db: Db; admin: AdminSql; close: () => Promise<void> }>;
  openWorker: (
    url: string,
    input: { sgoApiKey: string; budget: number },
  ) => Promise<{ ctx: JobContext; close: () => Promise<void> }>;
  log: (msg: string) => void;
  /** Repo root: deploy/ is written under it. */
  rootDir: string;
}

export interface SetupOptions {
  rotate?: boolean;
  skipPull?: boolean;
}

export interface SetupOutcome {
  /** 0 = everything done; 1 = hard failure; 2 = finished with something to do by hand. */
  exitCode: 0 | 1 | 2;
  files: { vercelEnv: string; githubSecrets: string };
  pull?: PullReport;
  manualRoles: boolean;
  reused: { authSecret: boolean; backupPassphrase: boolean };
}

export const DEPLOY_DIR = 'deploy';

function readEnvFile(file: string): Record<string, string> {
  return existsSync(file) ? parseEnvText(readFileSync(file, 'utf8')) : {};
}

export function deployPaths(rootDir: string) {
  const dir = join(rootDir, DEPLOY_DIR);
  return {
    dir,
    vercelEnv: join(dir, 'vercel.env'),
    githubSecrets: join(dir, 'github-secrets.txt'),
    manualRoles: join(dir, 'manual-roles.sql'),
  };
}

export async function runSetup(
  inputs: SetupInputs,
  opts: SetupOptions,
  deps: SetupDeps,
): Promise<SetupOutcome> {
  const { log } = deps;
  const paths = deployPaths(deps.rootDir);
  for (const n of inputs.notes) log(`note: ${n}`);

  log('Connecting to Neon as the owner...');
  const owner = await deps.connectOwner(inputs.ownerUrl);
  const passwords = { web: randomPassword(), worker: randomPassword() };
  let roles;
  try {
    log('  connected');
    roles = await setupDatabase({ db: owner.db, admin: owner.admin, passwords, log });
  } finally {
    await owner.close();
  }
  const manualRoles = roles.web.status === 'manual' || roles.worker.status === 'manual';

  // Connection strings: web -> pooled host, worker -> direct host (long-running jobs, no pooler).
  const webUrl = withCredentials(inputs.pooledUrl, WEB_ROLE.name, passwords.web);
  const workerUrl = withCredentials(inputs.directUrl, WORKER_ROLE.name, passwords.worker);

  const existingVercel = readEnvFile(paths.vercelEnv);
  const existingGithub = readEnvFile(paths.githubSecrets);
  const secrets = resolveSecrets(existingVercel, existingGithub, opts.rotate === true, {
    authSecret: () => randomBytes(32).toString('base64'),
    backupPassphrase: () => randomBytes(32).toString('base64url'),
  });
  log(
    `Secrets: AUTH_SECRET ${secrets.reused.authSecret ? 'reused' : 'generated'}, ` +
      `BACKUP_PASSPHRASE ${secrets.reused.backupPassphrase ? 'reused' : 'generated'}` +
      (opts.rotate ? ' (--rotate)' : ''),
  );

  const values: DeployValues = {
    webUrl,
    workerUrl,
    ownerUrl: inputs.ownerUrl,
    directUrl: inputs.directUrl,
    sgoApiKey: inputs.sgoApiKey,
    allowedEmails: inputs.allowedEmails,
    github: inputs.github,
    google: inputs.google,
    budget: DEFAULT_BUDGET,
  };
  // Files first: a failure in the data pull below must not lose the generated credentials.
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.vercelEnv, renderVercelEnv(values, secrets), { mode: 0o600 });
  writeFileSync(paths.githubSecrets, renderGithubSecrets(values, secrets), { mode: 0o600 });
  log(
    `Wrote ${DEPLOY_DIR}/vercel.env and ${DEPLOY_DIR}/github-secrets.txt (contain secrets; gitignored).`,
  );

  const outcome: SetupOutcome = {
    exitCode: 0,
    files: { vercelEnv: paths.vercelEnv, githubSecrets: paths.githubSecrets },
    manualRoles,
    reused: secrets.reused,
  };

  if (manualRoles) {
    const sql = [roles.web, roles.worker]
      .flatMap((r) => (r.status === 'manual' ? [r.sql] : []))
      .join('\n');
    writeFileSync(paths.manualRoles, `${sql}\n`, { mode: 0o600 });
    log('');
    log('Your connection is not allowed to create roles. Run this SQL as the project owner');
    log('(Neon console > SQL Editor), then run setup:live again:');
    let shown = sql;
    for (const pw of [passwords.web, passwords.worker]) shown = maskPassword(shown, pw);
    log(shown);
    log(`The full statements (with passwords) are in ${DEPLOY_DIR}/manual-roles.sql.`);
    log('Skipping the data pull: it needs the worker login role.');
    outcome.exitCode = 2;
    return outcome;
  }

  if (opts.skipPull) {
    log('Skipping the data pull (--skip-pull).');
    return outcome;
  }

  log(`Pulling first data as ${WORKER_ROLE.name} (ESPN stats + SportsGameOdds)...`);
  try {
    const worker = await deps.openWorker(workerUrl, {
      sgoApiKey: inputs.sgoApiKey,
      budget: Number(DEFAULT_BUDGET),
    });
    try {
      outcome.pull = await pullInitialData(worker.ctx);
    } finally {
      await worker.close();
    }
  } catch (err) {
    log(`Data pull could not start: ${err instanceof Error ? err.message : String(err)}`);
    outcome.exitCode = 2;
    return outcome;
  }
  log('Row counts:');
  for (const [table, n] of Object.entries(outcome.pull.counts)) log(`  ${table}: ${n}`);
  for (const s of outcome.pull.steps.filter((x) => !x.ok)) {
    log(`  FAILED ${s.label}: ${s.error}`);
  }
  if (!outcome.pull.ok) {
    log(
      'Some pull steps failed. Your credentials are saved; re-run setup:live or run the Ingest workflow later.',
    );
    outcome.exitCode = 2;
  }
  return outcome;
}

export function nextSteps(outcome: SetupOutcome): string[] {
  return [
    '',
    'Next steps (full guide: docs/DEPLOY.md)',
    `  1. Vercel: import the repo, Root Directory = apps/web, paste ${DEPLOY_DIR}/vercel.env into Environment Variables, Deploy.`,
    '  2. Create the OAuth apps with these callback URLs (use your Vercel domain):',
    '       https://<your-vercel-domain>/api/auth/callback/github',
    '       https://<your-vercel-domain>/api/auth/callback/google',
    '     Then add AUTH_GITHUB_ID/SECRET and AUTH_GOOGLE_ID/SECRET in Vercel (or re-run setup:live with them) and redeploy.',
    `  3. GitHub repo > Settings > Secrets and variables > Actions: add each line of ${DEPLOY_DIR}/github-secrets.txt.`,
    '  4. Actions > Ingest > Run workflow > daily, then open the site and check /status.',
    outcome.manualRoles ? '  (First: run the SQL printed above, then re-run setup:live.)' : '',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '');
}
