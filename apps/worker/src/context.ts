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
import { DEFAULT_RAW_PAYLOAD_RETENTION_DAYS } from './jobs/boxscores';
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
  rawPayloadRetentionDays: number;
}

function oneOf<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${name} must be one of ${allowed.join('|')} (got "${value}")`);
  }
  return value as T;
}

/**
 * Read and validate the worker's environment. Providers default to fixtures for local
 * (PGlite) development only: fixtures against a real database fail closed, so a missing
 * secret can never ingest fixture data into production.
 */
export function readConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const budgetRaw = env.ODDS_MONTHLY_BUDGET?.trim();
  const budget = budgetRaw ? Number(budgetRaw) : DEFAULT_ODDS_MONTHLY_BUDGET;
  if (!Number.isInteger(budget) || budget < 0) {
    throw new Error(`ODDS_MONTHLY_BUDGET must be a non-negative integer (got "${budgetRaw}")`);
  }
  const retentionRaw = env.RAW_PAYLOAD_RETENTION_DAYS?.trim();
  const retention = retentionRaw ? Number(retentionRaw) : DEFAULT_RAW_PAYLOAD_RETENTION_DAYS;
  if (!Number.isInteger(retention) || retention < 1) {
    throw new Error(
      `RAW_PAYLOAD_RETENTION_DAYS must be a positive integer (got "${retentionRaw}")`,
    );
  }
  const databaseUrl = env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
  const statsProvider = oneOf(
    'STATS_PROVIDER',
    env.STATS_PROVIDER?.trim() || 'fixtures',
    STATS_PROVIDERS,
  );
  const oddsProvider = oneOf(
    'ODDS_PROVIDER',
    env.ODDS_PROVIDER?.trim() || 'fixtures',
    ODDS_PROVIDERS,
  );
  if (!databaseUrl.startsWith('pglite:')) {
    const fixtureOnes = [
      statsProvider === 'fixtures' ? 'STATS_PROVIDER' : '',
      oddsProvider === 'fixtures' ? 'ODDS_PROVIDER' : '',
    ].filter(Boolean);
    if (fixtureOnes.length > 0) {
      throw new Error(
        `${fixtureOnes.join(' and ')} resolve to "fixtures" (unset or blank) but DATABASE_URL is not a pglite: URL. ` +
          'Refusing to write fixture data to a real database. Set STATS_PROVIDER=espn and ODDS_PROVIDER=sgo|theoddsapi.',
      );
    }
  }
  return {
    databaseUrl,
    statsProvider,
    oddsProvider,
    sgoApiKey: env.SGO_API_KEY?.trim() || undefined,
    theOddsApiKey: env.THE_ODDS_API_KEY?.trim() || undefined,
    oddsMonthlyBudget: budget,
    rawPayloadRetentionDays: retention,
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
    rawPayloadRetentionDays: config.rawPayloadRetentionDays,
  };
  return { ctx, close: () => closeDb(db) };
}
