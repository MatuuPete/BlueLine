import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  and,
  closeDb,
  createDb,
  eq,
  games,
  gte,
  playerGameLogs,
  players,
  propCurrent,
  propMetrics,
  propOffers,
  sql,
  teams,
  type Db,
} from '../src/index';
import { createTestDb } from '../src/testing';

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(teams).values([
    { id: 'bos', abbr: 'BOS', name: 'Boston Celtics', espnId: '2' },
    { id: 'nyk', abbr: 'NYK', name: 'New York Knicks', espnId: '18' },
  ]);
  await db.insert(players).values({
    id: 'p1',
    espnId: '4065648',
    name: 'Jayson Tatum',
    teamId: 'bos',
    position: 'F',
  });
  await db.insert(games).values({
    id: 'g1',
    espnId: '401810001',
    season: 2026,
    date: '2026-11-18',
    tipAt: new Date('2026-11-19T00:30:00Z'),
    homeTeamId: 'bos',
    awayTeamId: 'nyk',
  });
});

afterAll(async () => {
  await closeDb(db);
});

describe('createTestDb', () => {
  it('stores a team, a player and a game', async () => {
    const [g] = await db.select().from(games).where(eq(games.id, 'g1'));
    expect(g).toMatchObject({
      homeTeamId: 'bos',
      awayTeamId: 'nyk',
      status: 'scheduled',
      date: '2026-11-18',
    });
    expect(g!.tipAt.toISOString()).toBe('2026-11-19T00:30:00.000Z');
    const [p] = await db.select().from(players).where(eq(players.id, 'p1'));
    expect(p).toMatchObject({ name: 'Jayson Tatum', position: 'F', active: true });
  });

  it('inserts a prop offer and reads it back with numeric types', async () => {
    const [inserted] = await db
      .insert(propOffers)
      .values({
        gameId: 'g1',
        playerId: 'p1',
        market: 'PTS',
        line: 26.5,
        overPrice: -115,
        underPrice: -105,
        book: 'draftkings',
      })
      .returning();
    const [row] = await db.select().from(propOffers).where(eq(propOffers.id, inserted!.id));
    expect(row).toMatchObject({
      gameId: 'g1',
      playerId: 'p1',
      market: 'PTS',
      line: 26.5,
      overPrice: -115,
      underPrice: -105,
      book: 'draftkings',
      isClosing: false,
    });
    expect(row!.capturedAt).toBeInstanceOf(Date);
  });

  it('prop_current returns only the latest offer per (game, player, market, book)', async () => {
    await db.insert(propOffers).values([
      {
        gameId: 'g1',
        playerId: 'p1',
        market: 'REB',
        line: 8.5,
        overPrice: -110,
        underPrice: -110,
        book: 'fanduel',
        capturedAt: new Date('2026-11-18T15:00:00Z'),
      },
      {
        gameId: 'g1',
        playerId: 'p1',
        market: 'REB',
        line: 9.5,
        overPrice: +105,
        underPrice: -125,
        book: 'fanduel',
        capturedAt: new Date('2026-11-18T18:00:00Z'),
      },
    ]);
    const rows = await db
      .select()
      .from(propCurrent)
      .where(and(eq(propCurrent.market, 'REB'), eq(propCurrent.book, 'fanduel')));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ line: 9.5, overPrice: 105 });
  });

  it('selects prop metrics by the explicit rate_l10 column', async () => {
    const base = {
      gameId: 'g1',
      playerId: 'p1',
      playerName: 'Jayson Tatum',
      position: 'F' as const,
      teamId: 'bos',
      teamAbbr: 'BOS',
      oppTeamId: 'nyk',
      oppAbbr: 'NYK',
      isHome: true,
      tipAt: new Date('2026-11-19T00:30:00Z'),
    };
    await db.insert(propMetrics).values([
      {
        ...base,
        propKey: 'g1:p1:PTS:over',
        market: 'PTS',
        side: 'over',
        line: 26.5,
        hitsL10: 8,
        nL10: 10,
        rateL10: 0.8,
        teammatesOut: [{ playerId: 'p9', name: 'Jaylen Brown', status: 'out', minutes: 34.1 }],
        teammateOut: true,
        recent: [27, 22, 31, 26, 29, 19, 28, 33, 25, 30],
      },
      {
        ...base,
        propKey: 'g1:p1:REB:over',
        market: 'REB',
        side: 'over',
        line: 9.5,
        hitsL10: 5,
        nL10: 10,
        rateL10: 0.5,
      },
    ]);
    const rows = await db.select().from(propMetrics).where(gte(propMetrics.rateL10, 0.7));
    expect(rows.map((r) => r.propKey)).toEqual(['g1:p1:PTS:over']);
    expect(rows[0]).toMatchObject({
      hitsL10: 8,
      nL10: 10,
      nL5: 0,
      rateL5: null,
      teammateOut: true,
      isB2b: false,
      streak: 0,
    });
    expect(rows[0]!.teammatesOut[0]!.name).toBe('Jaylen Brown');
    expect(rows[0]!.recent).toHaveLength(10);
    expect(rows[0]!.computedAt).toBeInstanceOf(Date);
  });

  it('enforces one game log per (player, game)', async () => {
    const log = {
      playerId: 'p1',
      gameId: 'g1',
      teamId: 'bos',
      oppTeamId: 'nyk',
      isHome: true,
      started: true,
      minutes: 36,
      pts: 30,
    };
    await db.insert(playerGameLogs).values(log);
    await expect(db.insert(playerGameLogs).values(log)).rejects.toThrow();
  });
});

describe('createTestDb isolation', () => {
  it('gives each caller its own database', async () => {
    const other = await createTestDb();
    expect(await other.select().from(teams)).toEqual([]);
    expect((await db.select().from(teams)).length).toBe(2);
    await closeDb(other);
  });
});

describe('createDb', () => {
  it("opens an in-memory PGlite for 'pglite:'", async () => {
    const mem = createDb('pglite:');
    const res = await mem.execute(sql`select 1 + 1 as two`);
    expect(res.rows[0]).toEqual({ two: 2 });
    await closeDb(mem);
  });
});
