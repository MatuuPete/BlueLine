import {
  closeDb,
  count,
  countDistinct,
  desc,
  eq,
  games,
  injuries,
  jobRuns,
  playerGameLogs,
  propMetrics,
  propOffers,
  teamDvp,
  type Db,
} from '@blueline/db';
import { createTestDb } from '@blueline/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runJob } from '../src/run-job';
import { seed } from '../src/jobs/seed';
import { ANCHOR, counts, makeCtx } from './helpers';

let db: Db;
const logs: string[] = [];

beforeAll(async () => {
  db = await createTestDb();
  const ctx = await makeCtx({ db, log: (m) => logs.push(m) });
  await runJob('seed', seed, ctx, {});
}, 180_000);

afterAll(async () => {
  await closeDb(db);
});

describe('seed', () => {
  it('leaves ≥ 4 upcoming games for today', async () => {
    const today = await db.select().from(games).where(eq(games.date, ANCHOR));
    expect(today.length).toBeGreaterThanOrEqual(4);
    expect(today.every((g) => g.status === 'scheduled')).toBe(true);
  });

  it('loads ≥ 30 days of box scores', async () => {
    const [row] = await db
      .select({ days: countDistinct(games.date) })
      .from(playerGameLogs)
      .innerJoin(games, eq(games.id, playerGameLogs.gameId));
    expect(row!.days).toBeGreaterThanOrEqual(30);
    expect((await counts(db)).logs).toBeGreaterThan(5000);
  });

  it('precomputes prop metrics for every upcoming game with offers', async () => {
    const upcoming = await db.select().from(games).where(eq(games.status, 'scheduled'));
    const rows = await db.select().from(propMetrics);
    for (const g of upcoming) {
      const mine = rows.filter((r) => r.gameId === g.id);
      expect(mine.length, g.id).toBeGreaterThan(0);
      expect(mine.filter((r) => r.side === 'over').length).toBe(
        mine.filter((r) => r.side === 'under').length,
      );
    }
    expect(rows.some((r) => r.rateL10 !== null && r.dvpTier !== null && r.bestPrice !== null)).toBe(
      true,
    );
  });

  it('loads injuries and prop offers from ≥ 3 books for every upcoming game', async () => {
    expect((await db.select().from(injuries)).length).toBeGreaterThan(50);
    const offers = await db.select().from(propOffers);
    const upcoming = await db.select().from(games).where(eq(games.status, 'scheduled'));
    for (const g of upcoming) {
      const books = new Set(offers.filter((o) => o.gameId === g.id).map((o) => o.book));
      expect(books.size, g.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('records each step as its own job run and calls precompute', async () => {
    const runs = await db.select().from(jobRuns).orderBy(desc(jobRuns.id));
    expect(runs.map((r) => r.job).reverse()).toEqual([
      'seed',
      'ingest:schedule',
      'ingest:boxscores',
      'ingest:injuries',
      'ingest:odds',
      'ingest:odds',
      'precompute',
    ]);
    expect(runs.every((r) => r.status === 'ok')).toBe(true);
    const [pm] = await db.select({ n: count() }).from(propMetrics);
    const [dv] = await db.select({ n: count() }).from(teamDvp);
    expect(pm!.n).toBeGreaterThan(0);
    expect(dv!.n).toBeGreaterThan(0);
    expect((await counts(db)).raw).toBe(0); // fixtures are not external responses
  });
});
