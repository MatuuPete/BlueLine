import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeDb,
  games,
  injuries,
  playerGameLogs,
  players,
  propMetrics,
  propOffers,
  teamDvp,
  teams,
  type Db,
} from '../src/index';
import { getPropDetail } from '../src/queries/detail';
import { listGames } from '../src/queries/games';
import { createTestDb } from '../src/testing';

let db: Db;

const log = (
  gameId: string,
  pts: number,
  extra: Partial<typeof playerGameLogs.$inferInsert> = {},
): typeof playerGameLogs.$inferInsert => ({
  playerId: 'p1',
  gameId,
  teamId: 'bos',
  oppTeamId: 'nyk',
  isHome: true,
  started: true,
  minutes: 34,
  pts,
  ...extra,
});

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(teams).values([
    { id: 'bos', abbr: 'BOS', name: 'Boston Celtics' },
    { id: 'nyk', abbr: 'NYK', name: 'New York Knicks' },
    { id: 'mia', abbr: 'MIA', name: 'Miami Heat' },
  ]);
  await db.insert(players).values([
    { id: 'p1', name: 'Jayson Tatum', teamId: 'bos', position: 'F' },
    { id: 'p2', name: 'Jaylen Brown', teamId: 'bos', position: 'G' },
    { id: 'p3', name: 'Jalen Brunson', teamId: 'nyk', position: 'G' },
    { id: 'p4', name: 'Old Injury', teamId: 'bos', position: 'C' },
  ]);
  const t = (d: string) => new Date(`${d}T23:30:00Z`);
  await db.insert(games).values([
    { id: 'g0', season: 2025, date: '2026-04-01', tipAt: t('2026-04-01'), homeTeamId: 'bos', awayTeamId: 'nyk', status: 'final', homeScore: 100, awayScore: 90 },
    { id: 'g1', season: 2026, date: '2026-11-10', tipAt: t('2026-11-10'), homeTeamId: 'bos', awayTeamId: 'nyk', status: 'final', homeScore: 100, awayScore: 110 },
    { id: 'g2', season: 2026, date: '2026-11-12', tipAt: t('2026-11-12'), homeTeamId: 'bos', awayTeamId: 'nyk', status: 'final', homeScore: 120, awayScore: 110 },
    { id: 'gx', season: 2026, date: '2026-11-20', tipAt: t('2026-11-20'), homeTeamId: 'nyk', awayTeamId: 'mia' },
    { id: 'g3', season: 2026, date: '2026-11-18', tipAt: t('2026-11-18'), homeTeamId: 'bos', awayTeamId: 'nyk', spread: -6.5, total: 220 },
  ]);
  await db.insert(playerGameLogs).values([
    log('g0', 30),
    log('g1', 20),
    log('g2', 28),
    log('g2', 0, { playerId: 'p2', minutes: 30 }),
    log('g1', 0, { playerId: 'p2', minutes: 0, dnp: true }),
  ]);
  await db.insert(teamDvp).values([
    { teamId: 'nyk', position: 'F', market: 'PTS', window: 'season', allowedPerGame: 24, rank: 3, tier: 'best' },
    { teamId: 'nyk', position: 'F', market: 'PTS', window: 'l15', allowedPerGame: 26, rank: 28, tier: 'worst' },
    { teamId: 'nyk', position: 'F', market: 'REB', window: 'season', allowedPerGame: 9, rank: 10, tier: 'good' },
  ]);
  await db.insert(propOffers).values([
    { gameId: 'g3', playerId: 'p1', market: 'PTS', line: 26.5, overPrice: -120, underPrice: 100, book: 'draftkings', capturedAt: new Date('2026-11-18T10:00:00Z') },
    { gameId: 'g3', playerId: 'p1', market: 'PTS', line: 27.5, overPrice: -110, underPrice: -110, book: 'draftkings', capturedAt: new Date('2026-11-18T12:00:00Z') },
    { gameId: 'g3', playerId: 'p1', market: 'PTS', line: 27.5, overPrice: 105, underPrice: -125, book: 'fanduel', capturedAt: new Date('2026-11-18T12:00:00Z') },
    { gameId: 'g3', playerId: 'p1', market: 'PTS', line: 27.5, overPrice: -105, underPrice: null, book: 'betmgm', capturedAt: new Date('2026-11-18T12:00:00Z') },
  ]);
  await db.insert(injuries).values([
    { playerId: 'p2', teamId: 'bos', status: 'questionable', capturedAt: new Date('2026-11-17T10:00:00Z') },
    { playerId: 'p2', teamId: 'bos', status: 'out', detail: 'knee', capturedAt: new Date('2026-11-18T10:00:00Z') },
    { playerId: 'p4', teamId: 'bos', status: 'out', capturedAt: new Date('2026-11-17T10:00:00Z') },
    { playerId: 'p3', teamId: 'nyk', status: 'probable', capturedAt: new Date('2026-11-18T10:00:00Z') },
  ]);
  await db.insert(propMetrics).values({
    propKey: 'g3:p1:PTS:over',
    gameId: 'g3',
    playerId: 'p1',
    market: 'PTS',
    side: 'over',
    line: 27.5,
    playerName: 'Jayson Tatum',
    position: 'F',
    teamId: 'bos',
    teamAbbr: 'BOS',
    oppTeamId: 'nyk',
    oppAbbr: 'NYK',
    isHome: true,
    tipAt: new Date('2026-11-18T23:30:00Z'),
    rateL10: 0.6,
    nL10: 10,
    hitsL10: 6,
  });
});

afterAll(async () => {
  await closeDb(db);
});

describe('getPropDetail', () => {
  it('returns null for an unknown player or game', async () => {
    expect(await getPropDetail(db, { playerId: 'nope', market: 'PTS' })).toBeNull();
    expect(await getPropDetail(db, { playerId: 'p1', market: 'PTS', gameId: 'nope' })).toBeNull();
  });

  it('returns null for a game the player team is not in', async () => {
    expect(await getPropDetail(db, { playerId: 'p1', market: 'PTS', gameId: 'gx' })).toBeNull();
  });

  it('defaults to the next unplayed game and fills the game summary', async () => {
    const d = await getPropDetail(db, { playerId: 'p1', market: 'PTS' });
    expect(d!.game).toMatchObject({ id: 'g3', spread: -6.5, total: 220, propCount: 1 });
    expect(d!.game.home).toMatchObject({ abbr: 'BOS', score: null });
    expect(d!.player).toMatchObject({ id: 'p1', teamAbbr: 'BOS', position: 'F' });
    expect(d!.metrics).toHaveLength(1);
    expect(d!.metrics[0]).toMatchObject({
      line: 27.5,
      rates: { l10: { hits: 6, n: 10, rate: 0.6 } },
    });
  });

  it('returns this and last season logs oldest to newest with oppTier and won', async () => {
    const d = await getPropDetail(db, { playerId: 'p1', market: 'PTS', gameId: 'g3' });
    expect(d!.logs.map((l) => l.gameId)).toEqual(['g0', 'g1', 'g2']);
    expect(d!.logs.map((l) => l.pts)).toEqual([30, 20, 28]);
    // season-window DvP of NYK vs F for PTS
    expect(d!.logs.every((l) => l.oppTier === 'best')).toBe(true);
    expect(d!.logs.map((l) => l.won)).toEqual([true, false, true]);
    expect(d!.logs[2]).toMatchObject({ oppAbbr: 'NYK', isHome: true, restDays: 1 });
    expect(d!.logs[0]!.restDays).toBeNull();
  });

  it('lists teammates with the games they played', async () => {
    const d = await getPropDetail(db, { playerId: 'p1', market: 'PTS', gameId: 'g3' });
    const brown = d!.teammates.find((t) => t.playerId === 'p2');
    expect(brown).toEqual({ playerId: 'p2', name: 'Jaylen Brown', playedGameIds: ['g2'] });
    expect(d!.teammates.some((t) => t.playerId === 'p1' || t.playerId === 'p3')).toBe(false);
  });

  it('builds the shop: latest per book, no-vig, best price per side', async () => {
    const d = await getPropDetail(db, { playerId: 'p1', market: 'PTS', gameId: 'g3' });
    expect(d!.shop.map((s) => s.book).sort()).toEqual(['betmgm', 'draftkings', 'fanduel']);
    const dk = d!.shop.find((s) => s.book === 'draftkings')!;
    expect(dk.line).toBe(27.5);
    expect(dk.noVigOver).toBeCloseTo(0.5, 6);
    const mgm = d!.shop.find((s) => s.book === 'betmgm')!;
    expect(mgm.noVigOver).toBeNull();
    expect(d!.shop.find((s) => s.book === 'fanduel')!.isBestOver).toBe(true);
    expect(dk.isBestOver).toBe(false);
    expect(dk.isBestUnder).toBe(true);
  });

  it('returns every line move oldest to newest', async () => {
    const d = await getPropDetail(db, { playerId: 'p1', market: 'PTS', gameId: 'g3' });
    expect(d!.lineMoves).toHaveLength(4);
    expect(d!.lineMoves[0]).toMatchObject({ book: 'draftkings', line: 26.5 });
  });

  it('reports only the newest injury batch (recovered players are not listed)', async () => {
    const d = await getPropDetail(db, { playerId: 'p1', market: 'PTS', gameId: 'g3' });
    expect(d!.injuries.map((i) => [i.playerId, i.status]).sort()).toEqual([
      ['p2', 'out'],
      ['p3', 'probable'],
    ]);
  });

  it('returns matchup DvP for the opponent, position and market', async () => {
    const d = await getPropDetail(db, { playerId: 'p1', market: 'PTS', gameId: 'g3' });
    expect(d!.matchup).toHaveLength(2);
    expect(d!.matchup.find((m) => m.window === 'season')).toMatchObject({
      oppTeamId: 'nyk',
      position: 'F',
      market: 'PTS',
      rank: 3,
      tier: 'best',
      allowedPerGame: 24,
    });
  });
});

describe('listGames', () => {
  it('lists the slate with teams, lines and prop counts', async () => {
    const g = await listGames(db, '2026-11-18');
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({
      id: 'g3',
      date: '2026-11-18',
      status: 'scheduled',
      home: { id: 'bos', abbr: 'BOS', score: null },
      away: { id: 'nyk', abbr: 'NYK' },
      propCount: 1,
    });
    expect(g[0]!.tipAt).toBe('2026-11-18T23:30:00.000Z');
  });

  it('returns an empty list for a date without games', async () => {
    expect(await listGames(db, '2020-01-01')).toEqual([]);
  });
});
