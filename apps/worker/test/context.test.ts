import { createEspnProvider, createSgoProvider } from '@blueline/adapters';
import { closeDb, rawPayloads, type Db } from '@blueline/db';
import { createTestDb } from '@blueline/db/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRecorder, readConfig, REPO_ROOT, resolveDatabaseUrl } from '../src/context';
import { assertSeedTarget, main, parseArgs } from '../src/cli';

const FIX = join(REPO_ROOT, 'packages', 'adapters', 'fixtures');
const json = (rel: string) => JSON.parse(readFileSync(join(FIX, rel), 'utf8')) as unknown;

function serve(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

let db: Db;
afterEach(async () => {
  await closeDb(db);
});

describe('raw payload recorder', () => {
  it('stores every provider response in raw_payloads', async () => {
    db = await createTestDb();
    const espn = createEspnProvider({
      fetch: serve(json('espn/scoreboard/2026-11-16.json')),
      record: createRecorder(db),
    });
    await espn.getSchedule('2026-11-16');
    const rows = await db.select().from(rawPayloads);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: 'espn',
      endpoint: '/scoreboard',
      params: { dates: '20261116' },
    });
    expect(rows[0]!.body).toEqual(json('espn/scoreboard/2026-11-16.json'));
    expect(rows[0]!.fetchedAt).toBeInstanceOf(Date);
  });

  it('never stores API keys', async () => {
    db = await createTestDb();
    const sgo = createSgoProvider({
      fetch: serve(json('sgo/events/2026-11-17.json')),
      record: createRecorder(db),
      apiKey: 'super-secret',
    });
    await sgo.getGameLines('2026-11-17');
    const rows = await db.select().from(rawPayloads);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0]!.params)).not.toContain('super-secret');
  });
});

describe('readConfig', () => {
  it('defaults to fixtures, a local PGlite and a 2500-unit budget', () => {
    expect(readConfig({})).toEqual({
      databaseUrl: 'pglite:.data/pglite',
      statsProvider: 'fixtures',
      oddsProvider: 'fixtures',
      sgoApiKey: undefined,
      theOddsApiKey: undefined,
      oddsMonthlyBudget: 2500,
      rawPayloadRetentionDays: 21,
    });
  });

  it('reads providers, keys and budget', () => {
    expect(
      readConfig({
        DATABASE_URL: 'postgres://u@h/db',
        STATS_PROVIDER: 'espn',
        ODDS_PROVIDER: 'theoddsapi',
        THE_ODDS_API_KEY: 'k',
        ODDS_MONTHLY_BUDGET: '500',
      }),
    ).toMatchObject({
      databaseUrl: 'postgres://u@h/db',
      statsProvider: 'espn',
      oddsProvider: 'theoddsapi',
      theOddsApiKey: 'k',
      oddsMonthlyBudget: 500,
    });
  });

  it('fails closed: fixture providers are refused against a real database', () => {
    const real = { DATABASE_URL: 'postgres://u@h/db' };
    expect(() => readConfig(real)).toThrow(/fixtures/);
    expect(() => readConfig({ ...real, STATS_PROVIDER: 'espn' })).toThrow(/ODDS_PROVIDER/);
    expect(() => readConfig({ ...real, ODDS_PROVIDER: 'sgo' })).toThrow(/STATS_PROVIDER/);
    expect(() => readConfig({ ...real, STATS_PROVIDER: 'espn', ODDS_PROVIDER: ' ' })).toThrow(
      /ODDS_PROVIDER/,
    );
    expect(readConfig({ ...real, STATS_PROVIDER: 'espn', ODDS_PROVIDER: 'sgo' }).oddsProvider).toBe(
      'sgo',
    );
    expect(readConfig({ DATABASE_URL: 'pglite:memory://x' }).statsProvider).toBe('fixtures');
  });

  it('reads RAW_PAYLOAD_RETENTION_DAYS', () => {
    expect(readConfig({ RAW_PAYLOAD_RETENTION_DAYS: '7' }).rawPayloadRetentionDays).toBe(7);
    expect(() => readConfig({ RAW_PAYLOAD_RETENTION_DAYS: '0' })).toThrow(/RETENTION/);
  });

  it('rejects unknown providers and bad budgets', () => {
    expect(() => readConfig({ ODDS_PROVIDER: 'pinnacle' })).toThrow(/ODDS_PROVIDER/);
    expect(() => readConfig({ STATS_PROVIDER: 'nba' })).toThrow(/STATS_PROVIDER/);
    expect(() => readConfig({ ODDS_MONTHLY_BUDGET: '-1' })).toThrow(/ODDS_MONTHLY_BUDGET/);
  });
});

describe('resolveDatabaseUrl', () => {
  it('anchors relative PGlite paths at the repo root', () => {
    expect(resolveDatabaseUrl('pglite:.data/pglite')).toBe(
      `pglite:${join(REPO_ROOT, '.data', 'pglite')}`,
    );
    expect(resolveDatabaseUrl('pglite:')).toBe('pglite:');
    expect(resolveDatabaseUrl('postgres://x')).toBe('postgres://x');
  });
});

describe('CLI arguments', () => {
  it('parses a job and its flags', () => {
    expect(parseArgs(['ingest:odds', '--date', '2026-11-17', '--closing'])).toEqual({
      job: 'ingest:odds',
      opts: { date: '2026-11-17', closing: true },
    });
    expect(parseArgs(['precompute', '--incremental']).opts).toEqual({ incremental: true });
  });

  it('rejects unknown jobs', () => {
    expect(() => parseArgs(['ingest:everything'])).toThrow(/Unknown job/);
  });
});

describe('CLI safety', () => {
  it('seed refuses non-pglite database URLs', () => {
    expect(() => assertSeedTarget('postgres://u@h/db')).toThrow(/refuses/);
    expect(() => assertSeedTarget('pglite:memory://x')).not.toThrow();
    expect(() => assertSeedTarget(undefined)).not.toThrow();
  });

  it('prints a clean one-line error and exits 1 on bad config (no stack)', async () => {
    const saved = { ...process.env };
    process.env.DATABASE_URL = 'postgres://u@h/db';
    delete process.env.STATS_PROVIDER;
    delete process.env.ODDS_PROVIDER;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await main(['ingest:odds'])).toBe(1);
      expect(await main(['seed'])).toBe(1);
      const lines = err.mock.calls.map((c) => String(c[0]));
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/^worker: .*fixtures/);
      expect(lines[1]).toMatch(/^worker: seed refuses/);
      expect(lines.every((l) => !l.includes('\n    at '))).toBe(true);
    } finally {
      err.mockRestore();
      process.env = saved;
    }
  });
});
