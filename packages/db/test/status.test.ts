import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiUsage, closeDb, jobRuns, teams, type Db } from '../src/index';
import { getStatus, nyMonth } from '../src/queries/status';
import { createTestDb } from '../src/testing';

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(teams).values({ id: 'bos', abbr: 'BOS', name: 'Boston Celtics' });
  await db.insert(jobRuns).values([
    {
      job: 'ingest:odds',
      startedAt: new Date('2026-11-18T10:00:00Z'),
      status: 'error',
      error: 'boom',
    },
    {
      job: 'ingest:odds',
      startedAt: new Date('2026-11-18T12:00:00Z'),
      finishedAt: new Date('2026-11-18T12:01:00Z'),
      status: 'ok',
      units: 4,
    },
    { job: 'compute:metrics', startedAt: new Date('2026-11-18T12:05:00Z'), status: 'running' },
  ]);
  await db.insert(apiUsage).values([
    { provider: 'sgo', month: '2026-11', units: 120 },
    { provider: 'sgo', month: '2026-10', units: 400 },
  ]);
});

afterAll(async () => {
  await closeDb(db);
});

describe('getStatus', () => {
  it('reports the latest run per job, the month budget and row counts', async () => {
    const s = await getStatus(db, {
      provider: 'sgo',
      limit: 500,
      now: new Date('2026-11-18T15:00:00Z'),
    });
    expect(s.jobs.map((j) => [j.job, j.lastRun?.status])).toEqual([
      ['compute:metrics', 'running'],
      ['ingest:odds', 'ok'],
    ]);
    expect(s.jobs[1]!.lastRun).toMatchObject({ units: 4, finishedAt: '2026-11-18T12:01:00.000Z' });
    expect(s.budget).toEqual({ provider: 'sgo', month: '2026-11', used: 120, limit: 500 });
    expect(s.rowCounts).toMatchObject({ teams: 1, players: 0, prop_metrics: 0 });
  });

  it('reports zero usage for a provider with no rows', async () => {
    const s = await getStatus(db, {
      provider: 'fixtures',
      limit: 500,
      now: new Date('2026-11-18T15:00:00Z'),
    });
    expect(s.budget.used).toBe(0);
  });

  it('computes the budget month in America/New_York, not UTC', async () => {
    // 2026-12-01T03:00Z is still 22:00 on Nov 30 in New York.
    expect(nyMonth(new Date('2026-12-01T03:00:00Z'))).toBe('2026-11');
    expect(nyMonth(new Date('2026-12-01T06:00:00Z'))).toBe('2026-12');
    const s = await getStatus(db, {
      provider: 'sgo',
      limit: 500,
      now: new Date('2026-12-01T03:00:00Z'),
    });
    expect(s.budget).toMatchObject({ month: '2026-11', used: 120 });
  });
});
