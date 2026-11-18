import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, games, players, teams, users, type Db } from '../src/index';
import {
  createSlip,
  deletePreset,
  deleteSlip,
  getSettings,
  getSlip,
  listFavorites,
  listPresets,
  listSlips,
  savePreset,
  saveSettings,
  toggleFavorite,
} from '../src/queries/user';
import { createTestDb } from '../src/testing';

let db: Db;

const slipInput = {
  name: 'Tonight',
  book: 'draftkings' as const,
  stake: 10,
  legs: [
    {
      gameId: 'g1',
      playerId: 'p1',
      market: 'PTS' as const,
      side: 'over' as const,
      line: 26.5,
      price: -115,
    },
  ],
};

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(teams).values([
    { id: 'bos', abbr: 'BOS', name: 'Boston Celtics' },
    { id: 'nyk', abbr: 'NYK', name: 'New York Knicks' },
  ]);
  await db.insert(players).values({ id: 'p1', name: 'Jayson Tatum', teamId: 'bos', position: 'F' });
  await db.insert(games).values({
    id: 'g1',
    season: 2026,
    date: '2026-11-18',
    tipAt: new Date('2026-11-19T00:30:00Z'),
    homeTeamId: 'bos',
    awayTeamId: 'nyk',
  });
  await db.insert(users).values([
    { id: 'userA', email: 'a@example.com' },
    { id: 'userB', email: 'b@example.com' },
  ]);
});

afterAll(async () => {
  await closeDb(db);
});

describe('favorites', () => {
  it('toggles on and off, scoped per user', async () => {
    const fav = { playerId: 'p1', market: 'PTS' as const, side: 'over' as const };
    expect(await toggleFavorite(db, 'userA', fav)).toEqual({ favorited: true });
    expect(await listFavorites(db, 'userA')).toHaveLength(1);
    expect(await listFavorites(db, 'userB')).toHaveLength(0);
    expect(await toggleFavorite(db, 'userB', fav)).toEqual({ favorited: true });
    expect(await toggleFavorite(db, 'userA', fav)).toEqual({ favorited: false });
    expect(await listFavorites(db, 'userA')).toHaveLength(0);
    expect(await listFavorites(db, 'userB')).toHaveLength(1);
  });
});

describe('slips', () => {
  it('creates a slip with legs and lists it', async () => {
    const s = await createSlip(db, 'userA', slipInput);
    expect(s).toMatchObject({ name: 'Tonight', book: 'draftkings', stake: 10 });
    expect(s.legs[0]).toMatchObject({
      playerName: 'Jayson Tatum',
      line: 26.5,
      price: -115,
      result: 'pending',
    });
    expect((await listSlips(db, 'userA')).map((x) => x.id)).toContain(s.id);
  });

  it('IDOR: user B cannot read or delete user A slip', async () => {
    const s = await createSlip(db, 'userA', { ...slipInput, name: 'Private' });
    expect(await getSlip(db, 'userB', s.id)).toBeNull();
    expect((await listSlips(db, 'userB')).map((x) => x.id)).not.toContain(s.id);
    expect(await deleteSlip(db, 'userB', s.id)).toBe(false);
    expect(await getSlip(db, 'userA', s.id)).not.toBeNull();
    expect(await deleteSlip(db, 'userA', s.id)).toBe(true);
    expect(await getSlip(db, 'userA', s.id)).toBeNull();
    expect(await deleteSlip(db, 'userA', s.id)).toBe(false);
  });

  it('treats a malformed id as not found', async () => {
    expect(await getSlip(db, 'userA', 'not-a-uuid')).toBeNull();
    expect(await deleteSlip(db, 'userA', 'not-a-uuid')).toBe(false);
  });
});

describe('presets', () => {
  it('saves, upserts by name, lists per user', async () => {
    const p = await savePreset(db, 'userA', { name: 'Hot', filter: { minHitRate: 70 } });
    expect(p.filter).toEqual({ minHitRate: 70 });
    const p2 = await savePreset(db, 'userA', { name: 'Hot', filter: { minHitRate: 80 } });
    expect(p2.id).toBe(p.id);
    expect((await listPresets(db, 'userA'))[0]!.filter).toEqual({ minHitRate: 80 });
    expect(await listPresets(db, 'userB')).toEqual([]);
  });

  it('IDOR: user B cannot delete user A preset', async () => {
    const p = await savePreset(db, 'userA', { name: 'Mine', filter: {} });
    expect(await deletePreset(db, 'userB', p.id)).toBe(false);
    expect((await listPresets(db, 'userA')).map((x) => x.id)).toContain(p.id);
    expect(await deletePreset(db, 'userA', p.id)).toBe(true);
    expect(await deletePreset(db, 'userA', 'junk')).toBe(false);
  });
});

describe('settings', () => {
  it('returns defaults, then persists per user', async () => {
    expect(await getSettings(db, 'userA')).toEqual({
      theme: 'system',
      oddsFormat: 'american',
      books: [],
      skipIntro: false,
    });
    const next = { theme: 'dark' as const, oddsFormat: 'decimal' as const, books: ['fanduel' as const], skipIntro: true };
    expect(await saveSettings(db, 'userA', next)).toEqual(next);
    expect((await getSettings(db, 'userA')).theme).toBe('dark');
    expect((await getSettings(db, 'userB')).theme).toBe('system');
  });
});
