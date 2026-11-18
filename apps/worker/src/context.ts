import {
  createOddsProvider,
  createStatsProvider,
  nyDate,
  ODDS_PROVIDERS,
  STATS_PROVIDERS,
  type HttpDeps,
  type OddsProviderName,
  type RawRecorder,
  type StatsProviderName,
} from '@blueline/adapters';
import { closeDb, createDb, rawPayloads, runMigrations, type Db } from '@blueline/db';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { DEFAULT_ODDS_MONTHLY_BUDGET } from './jobs/budget';
import type { JobContext } from './run-job';

/** The monorepo root (apps/worker/src → ../../..). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const DEFAULT_DATABASE_URL = 'pglite:.data/pglite';

export interface WorkerConfig {
  databaseUrl: string;
  statsProvider: StatsProviderName;
  oddsProvider: OddsProviderName;
  sgoApiKey?: string;
  theOddsApiKey?: string;
  oddsMonthlyBudget: number;
}

function oneOf<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${name} must be one of ${allowed.join('|')} (got "${value}")`);
  }
  return value as T;
}

/** Read and validate the worker's environment. Providers default to fixtures. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const budgetRaw = env.ODDS_MONTHLY_BUDGET?.trim();
  const budget = budgetRaw ? Number(budgetRaw) : DEFAULT_ODDS_MONTHLY_BUDGET;
  if (!Number.isInteger(budget) || budget < 0) {
    throw new Error(`ODDS_MONTHLY_BUDGET must be a non-negative integer (got "${budgetRaw}")`);
  }
  return {
    databaseUrl: env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL,
    statsProvider: oneOf(
      'STATS_PROVIDER',
      env.STATS_PROVIDER?.trim() || 'fixtures',
      STATS_PROVIDERS,
    ),
    oddsProvider: oneOf('ODDS_PROVIDER', env.ODDS_PROVIDER?.trim() || 'fixtures', ODDS_PROVIDERS),
    sgoApiKey: env.SGO_API_KEY?.trim() || undefined,
    theOddsApiKey: env.THE_ODDS_API_KEY?.trim() || undefined,
    oddsMonthlyBudget: budget,
  };
}

/** Load `<repo>/.env` into process.env without overriding variables already set. */
export function loadDotEnv(file = resolve(REPO_ROOT, '.env')): void {
  if (!existsSync(file)) return;
  for (const [k, v] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

/**
 * Relative on-disk PGlite paths resolve against the repo root, so
 * `pglite:.data/pglite` is the same database whichever directory runs the worker.
 */
export function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith('pglite:')) return url;
  const dir = url.slice('pglite:'.length);
  if (!dir || dir.startsWith('memory:') || isAbsolute(dir)) return url;
  return `pglite:${resolve(REPO_ROOT, dir)}`;
}

/** Open the database; PGlite databases are migrated on open. */
export async function openDb(url: string): Promise<Db> {
  const resolved = resolveDatabaseUrl(url);
  const dir = resolved.slice('pglite:'.length);
  if (resolved.startsWith('pglite:') && dir) mkdirSync(dirname(dir), { recursive: true });
  const db = createDb(resolved);
  if (resolved.startsWith('pglite:')) await runMigrations(db);
  return db;
}

/** Raw payloads first: each provider response becomes a `raw_payloads` row. */
export function createRecorder(db: Db): RawRecorder {
  return async ({ provider, endpoint, params, body }) => {
    await db.insert(rawPayloads).values({ provider, endpoint, params, body });
  };
}

export interface ContextOptions {
  now?: Date;
  log?: (msg: string) => void;
  /** Use the fixture providers regardless of config (seed). */
  forceFixtures?: boolean;
  fetch?: typeof fetch;
}

export async function createContext(
  config: WorkerConfig,
  opts: ContextOptions = {},
): Promise<{ ctx: JobContext; close: () => Promise<void> }> {
  const db = await openDb(config.databaseUrl);
  const now = opts.now ?? new Date();
  const base: HttpDeps = {
    fetch: opts.fetch ?? globalThis.fetch,
    record: createRecorder(db),
    fixtureDate: nyDate(now),
  };
  const statsName = opts.forceFixtures ? 'fixtures' : config.statsProvider;
  const oddsName = opts.forceFixtures ? 'fixtures' : config.oddsProvider;
  const apiKey =
    oddsName === 'sgo'
      ? config.sgoApiKey
      : oddsName === 'theoddsapi'
        ? config.theOddsApiKey
        : undefined;
  const ctx: JobContext = {
    db,
    stats: createStatsProvider(statsName, base),
    odds: createOddsProvider(oddsName, { ...base, apiKey }),
    now,
    log: opts.log ?? ((msg) => console.log(msg)),
    oddsMonthlyBudget: config.oddsMonthlyBudget,
  };
  return { ctx, close: () => closeDb(db) };
}
