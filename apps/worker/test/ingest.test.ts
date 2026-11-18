import type { NormInjury } from '@blueline/contracts';
import {
  and,
  closeDb,
  eq,
  games,
  injuries,
  playerGameLogs,
  players,
  teams,
  type Db,
} from '@blueline/db';
import { createTestDb } from '@blueline/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boxscoreDates, ingestBoxscores } from '../src/jobs/boxscores';
import { ingestInjuries } from '../src/jobs/injuries';
import { ingestSchedule } from '../src/jobs/schedule';
import { usageProxy } from '../src/store';
import type { JobContext } from '../src/run-job';
import { ANCHOR, counts, makeCtx, NOON } from './helpers';

let db: Db;
let ctx: JobContext;
beforeEach(async () => {
  db = await createTestDb();
  ctx = await makeCtx({ db });
});
afterEach(async () => {
  await closeDb(db);
});

describe('ingest:schedule', () => {
  it('upserts teams, 7 days of games and the playing teams’ rosters', async () => {
    const res = await ingestSchedule(ctx, {});
    expect(res.meta).toMatchObject({ from: ANCHOR, days: 7, teams: 30, games: 17 });
    const c = await counts(db);
    expect(c.teams).toBe(30);
    expect(c.games).toBe(17);
    expect(c.players).toBeGreaterThan(300);
    const [g] = await db.select().from(games).where(eq(games.id, 'g401910002'));
    expect(g).toMatchObject({
      espnId: '401910002',
      date: ANCHOR,
      homeTeamId: 'tor',
      awayTeamId: 'ny',
      status: 'scheduled',
      season: 2026,
    });
    const [tatum] = await db.select().from(players).where(eq(players.name, 'Jayson Tatum'));
    expect(tatum).toMatchObject({ id: 'p4065648', teamId: 'bos', position: 'F', active: true });
  });

  it('is idempotent', async () => {
    await ingestSchedule(ctx, {});
    const first = await counts(db);
    await ingestSchedule(ctx, {});
    expect(await counts(db)).toEqual(first);
  });
});

describe('ingest:boxscores', () => {
  it('defaults to yesterday and accepts --days or a date list', () => {
    expect(boxscoreDates(NOON, {})).toEqual(['2026-11-16']);
    expect(boxscoreDates(NOON, { date: '2026-11-16', days: '3' })).toEqual([
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
    ]);
    expect(boxscoreDates(NOON, { dates: '2026-11-01,2026-11-02' })).toEqual([
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(() => boxscoreDates(NOON, { date: '11/16/2026' })).toThrow(/YYYY-MM-DD/);
  });

  it('writes one log per player for every final game', async () => {
    const res = await ingestBoxscores(ctx, {});
    expect(res.meta).toMatchObject({ days: 1, games: 8, finals: 8 });
    const logs = await db
      .select()
      .from(playerGameLogs)
      .where(eq(playerGameLogs.gameId, 'g401909994'));
    expect(logs.length).toBeGreaterThan(20);
    const wagner = logs.find((l) => l.playerId === 'p4566434')!;
    expect(wagner).toMatchObject({
      teamId: 'orl',
      oppTeamId: 'bos',
      isHome: false,
      started: true,
      minutes: 38,
      pts: 21,
      reb: 8,
      ast: 9,
      dnp: false,
    });
    expect(wagner.usageProxy).toBeGreaterThan(0.15);
    expect(wagner.usageProxy).toBeLessThan(0.4);
    const dnp = logs.filter((l) => l.dnp);
    expect(dnp.length).toBeGreaterThan(0);
    for (const l of dnp) expect(l).toMatchObject({ minutes: 0, usageProxy: null });
    const [g] = await db.select().from(games).where(eq(games.id, 'g401909994'));
    expect(g).toMatchObject({ status: 'final', homeScore: 105, awayScore: 115 });
  });

  it('is idempotent', async () => {
    await ingestBoxscores(ctx, { date: '2026-11-16', days: '2' });
    const first = await counts(db);
    expect(first.logs).toBeGreaterThan(300);
    await ingestBoxscores(ctx, { date: '2026-11-16', days: '2' });
    expect(await counts(db)).toEqual(first);
  });

  it('does not move a rostered player to an old team from a past box score', async () => {
    await ingestSchedule(ctx, {});
    await db.update(players).set({ teamId: 'lal' }).where(eq(players.id, 'p4566434'));
    await ingestBoxscores(ctx, {});
    const [p] = await db.select().from(players).where(eq(players.id, 'p4566434'));
    expect(p!.teamId).toBe('lal');
  });
});

describe('usageProxy', () => {
  it('is the share of team possessions used while on the floor', () => {
    // 20 poss used in 24 of 240 team minutes, team used 100 → 20·48/(24·100) = 0.4
    expect(
      usageProxy({ minutes: 24, fga: 16, fta: 0, tov: 4, dnp: false }, { minutes: 240, poss: 100 }),
    ).toBe(0.4);
    expect(
      usageProxy({ minutes: 0, fga: 0, fta: 0, tov: 0, dnp: true }, { minutes: 240, poss: 100 }),
    ).toBeNull();
  });
});

describe('ingest:injuries', () => {
  beforeEach(async () => {
    await ingestSchedule(ctx, {});
  });

  it('snapshots the report for known players', async () => {
    const res = await ingestInjuries(ctx, {});
    const rows = await db.select().from(injuries);
    expect(rows.length).toBeGreaterThan(50);
    expect(res.meta).toMatchObject({ inserted: rows.length, unchanged: false });
    expect(rows.every((r) => r.capturedAt.getTime() === NOON.getTime())).toBe(true);
    const out = rows.filter((r) => r.status === 'out');
    expect(out.length).toBeGreaterThan(0);
    expect(rows[0]!.teamId).toMatch(/^[a-z]+$/);
  });

  it('is idempotent: an unchanged report inserts nothing', async () => {
    await ingestInjuries(ctx, {});
    const first = await counts(db);
    const res = await ingestInjuries({ ...ctx, now: new Date(NOON.getTime() + 3_600_000) }, {});
    expect(res.meta).toMatchObject({ inserted: 0, unchanged: true });
    expect(await counts(db)).toEqual(first);
  });

  it('writes a new full batch when the report changes', async () => {
    await ingestInjuries(ctx, {});
    const first = (await db.select().from(injuries)).length;
    const later = new Date(NOON.getTime() + 3_600_000);
    const report = await ctx.stats.getInjuries();
    const changed: NormInjury[] = report.slice(1); // one player came off the report
    const res = await ingestInjuries(
      { ...ctx, now: later, stats: { ...ctx.stats, getInjuries: async () => changed } },
      {},
    );
    expect(res.meta).toMatchObject({ unchanged: false });
    const batch = await db.select().from(injuries).where(eq(injuries.capturedAt, later));
    expect(batch.length).toBe(first - 1);
  });

  it('lists players it cannot match', async () => {
    const report = await ctx.stats.getInjuries();
    const res = await ingestInjuries(
      {
        ...ctx,
        stats: {
          ...ctx.stats,
          getInjuries: async () => [
            ...report,
            {
              playerExternalId: '999999999',
              playerName: 'Nobody Known',
              teamExternalId: '2',
              status: 'out',
              detail: null,
            },
          ],
        },
      },
      {},
    );
    expect(res.meta!.unmatched).toEqual(['Nobody Known']);
  });
});

describe('teams', () => {
  it('uses lowercase ESPN abbreviations as ids', async () => {
    await ingestSchedule(ctx, {});
    const [bos] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.abbr, 'BOS'), eq(teams.espnId, '2')));
    expect(bos).toMatchObject({ id: 'bos', name: 'Boston Celtics' });
  });
});
