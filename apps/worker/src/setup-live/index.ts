// `corepack pnpm setup:live`: one command from a fresh Neon project to deployable credentials.
import { closeDb, connectAdminPg, createDb } from '@blueline/db';
import { Command, CommanderError } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createContext, REPO_ROOT } from '../context';
import { parseEnvText } from './envfiles';
import {
  inputsFromEnv,
  inputsFromExisting,
  mergeInputs,
  resolveInputs,
  type Ask,
  type RawInputs,
} from './inputs';
import { deployPaths, nextSteps, runSetup, type SetupDeps } from './run';

export const SETUP_USAGE = `Usage: corepack pnpm setup:live [options]

Interactive by default. Non-interactive when every required input is given by flag or env
(or found in deploy/ from a previous run) or when --non-interactive is passed.

Options (env var in brackets):
  --owner-url <url>        Neon OWNER connection string, direct host [SETUP_OWNER_URL]
  --pooled-url <url>       Neon pooled connection string; default: derived [SETUP_POOLED_URL]
  --sgo-key <key>          SportsGameOdds API key [SETUP_SGO_API_KEY]
  --allowed-emails <list>  comma list of who may sign in [SETUP_ALLOWED_EMAILS]
  --github-id/--github-secret   GitHub OAuth app [SETUP_GITHUB_ID / SETUP_GITHUB_SECRET]
  --google-id/--google-secret   Google OAuth client [SETUP_GOOGLE_ID / SETUP_GOOGLE_SECRET]
  --rotate                 generate a new AUTH_SECRET and BACKUP_PASSPHRASE
  --skip-pull              skip the first data pull
  --non-interactive        never prompt; fail if an input is missing
`;

export function createAsk(): { ask: Ask; close: () => void } {
  let muted = false;
  const out = new Writable({
    write(chunk, enc, cb) {
      if (!muted) process.stdout.write(chunk, enc);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: process.stdin.isTTY });
  const ask: Ask = async (question, o = {}) => {
    process.stdout.write(`${question}${o.secret ? ' (input hidden)' : ''}: `);
    muted = o.secret === true;
    try {
      return (await rl.question('')).trim();
    } finally {
      muted = false;
      if (o.secret) process.stdout.write('\n');
    }
  };
  return { ask, close: () => rl.close() };
}

function realDeps(log: (m: string) => void): SetupDeps {
  return {
    log,
    rootDir: REPO_ROOT,
    connectOwner: async (url) => {
      const admin = await connectAdminPg(url);
      const db = createDb(url);
      return {
        db,
        admin,
        close: async () => {
          await closeDb(db);
          await admin.close();
        },
      };
    },
    openWorker: async (url, { sgoApiKey, budget }) => {
      const { ctx, close } = await createContext(
        {
          databaseUrl: url,
          statsProvider: 'espn',
          oddsProvider: 'sgo',
          sgoApiKey,
          oddsMonthlyBudget: budget,
          rawPayloadRetentionDays: 21,
        },
        { log },
      );
      return { ctx, close };
    },
  };
}

function readEnvFile(file: string): Record<string, string> {
  return existsSync(file) ? parseEnvText(readFileSync(file, 'utf8')) : {};
}

export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const program = new Command('setup:live')
    .option('--owner-url <url>')
    .option('--pooled-url <url>')
    .option('--sgo-key <key>')
    .option('--allowed-emails <list>')
    .option('--github-id <id>')
    .option('--github-secret <secret>')
    .option('--google-id <id>')
    .option('--google-secret <secret>')
    .option('--rotate')
    .option('--skip-pull')
    .option('--non-interactive')
    .helpOption('-h, --help')
    .addHelpText('after', `\n${SETUP_USAGE}`)
    .exitOverride()
    .configureOutput({ writeErr: (s) => process.stderr.write(s) });
  try {
    program.parse(argv, { from: 'user' });
  } catch (err) {
    if (err instanceof CommanderError) return err.exitCode;
    throw err;
  }
  const o = program.opts<Record<string, string | boolean | undefined>>();
  const str = (v: string | boolean | undefined) => (typeof v === 'string' ? v : undefined);
  const flags: RawInputs = {
    ownerUrl: str(o.ownerUrl),
    pooledUrl: str(o.pooledUrl),
    sgoApiKey: str(o.sgoKey),
    allowedEmails: str(o.allowedEmails),
    githubId: str(o.githubId),
    githubSecret: str(o.githubSecret),
    googleId: str(o.googleId),
    googleSecret: str(o.googleSecret),
  };
  const log = (m: string) => console.log(m);
  const paths = deployPaths(REPO_ROOT);
  const existing = inputsFromExisting(
    readEnvFile(paths.vercelEnv),
    readEnvFile(paths.githubSecrets),
  );
  const raw = mergeInputs(flags, inputsFromEnv(env), existing);

  const interactive = o.nonInteractive !== true && Boolean(process.stdin.isTTY);
  const prompts = interactive ? createAsk() : undefined;
  try {
    log('BlueLine live setup');
    const inputs = await resolveInputs(raw, prompts?.ask);
    const outcome = await runSetup(
      inputs,
      { rotate: o.rotate === true, skipPull: o.skipPull === true },
      realDeps(log),
    );
    for (const line of nextSteps(outcome)) log(line);
    return outcome.exitCode;
  } catch (err) {
    console.error(`setup:live: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    prompts?.close();
  }
}
