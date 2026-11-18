import {
  allWindows,
  bestPrice,
  consensusNoVig,
  dvpRank,
  dvpTier,
  edge,
  gradeLeg,
  hitRate,
  isPlayed,
  selectWindow,
  statValue,
  streak,
  type LogLine,
} from '@blueline/analytics';
import { propKey, type Book, type Market, type Side } from '@blueline/contracts';
import {
  and,
  asc,
  closeDb,
  count,
  eq,
  games,
  injuries,
  playerGameLogs,
  players,
  propMetrics,
  propOffers,
  slipLegs,
  slips,
  teamDvp,
  teams,
  users,
  type Db,
  type InferSelectModel,
} from '@blueline/db';
import { createTestDb } from '@blueline/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../src/cli';
import { computeDvp, dvp } from '../src/jobs/dvp';
import { gradeSlips } from '../src/jobs/grade-slips';
import { precompute } from '../src/jobs/precompute';
import { JOB_REGISTRY } from '../src/jobs';
import type { JobContext } from '../src/run-job';
import { makeCtx, NOON } from './helpers';

// ---------------------------------------------------------------------------
// A small hand-built league.
//   aaa (home) vs bbb (away) tonight, 2026-11-17 (game g0, 19:30 ET).
//   ccc vs ddd tomorrow (g1), used to check --incremental.
//   aaa played 20 games: 4 last season (2025) and 16 this season (2026), the
//   last one on 2026-11-16, so tonight is a back-to-back.
// ---------------------------------------------------------------------------

const TODAY = '2026-11-17';
const TOMORROW = '2026-11-18';
const T0 = new Date('2026-11-17T14:00:00Z');
const T1 = new Date('2026-11-17T16:00:00Z');

type Pos = 'G' | 'F' | 'C';
interface HistGame {
  id: string;
  date: string;
  season: number;
  opp: string;
}

function addDays(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

const OPPS = ['bbb', 'ccc', 'ddd'];
const HIST: HistGame[] = [
  ...['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07'].map((date, i) => ({
    id: `h${i}`,
    date,
    season: 2025,
    opp: ['bbb', 'ccc', 'bbb', 'ddd'][i]!,
  })),
  ...Array.from({ length: 16 }, (_, k) => ({
    id: `h${k + 4}`,
    date: addDays('2026-10-17', 2 * k),
    season: 2026,
    opp: OPPS[k % 3]!,
  })),
];
const tipOf = (date: string) => new Date(`${date}T23:30:00Z`);

// p1 (G) and p2 (F) have 20 logs each; p1 sat out h10 (DNP).
const p1Pts = (i: number) => 18 + ((i * 7) % 13);
const p2Pts = (i: number) => 10 + ((i * 5) % 11);
const p2Reb = (i: number) => 4 + ((i * 3) % 6);

interface LogSpec {
  playerId: string;
  teamId: string;
  pos: Pos;
  g: HistGame;
  i: number;
}

function logRow(s: LogSpec) {
  const dnp = s.playerId === 'p1' && s.g.id === 'h10';
  const base = {
    playerId: s.playerId,
    gameId: s.g.id,
    teamId: s.teamId,
    oppTeamId: s.g.opp,
    isHome: s.i % 2 === 0,
    started: !dnp && (s.playerId !== 'p2' || s.i % 3 !== 0),
    dnp,
    minutes: dnp ? 0 : 30 + (s.i % 5),
    usageProxy: dnp ? null : 0.2 + (s.i % 4) / 100,
    fga: 10,
    fta: 4,
  };
  const stats =
    s.playerId === 'p1'
      ? {
          pts: p1Pts(s.i),
          reb: 3 + (s.i % 3),
          ast: 5 + (s.i % 4),
          fg3m: s.i % 5,
          stl: 1,
          blk: 0,
          tov: 2,
        }
      : s.playerId === 'p2'
        ? { pts: p2Pts(s.i), reb: p2Reb(s.i), ast: 2, fg3m: 1, stl: 0, blk: 1, tov: 1 }
        : { pts: 12, reb: 9, ast: 1, fg3m: 0, stl: 0, blk: 2, tov: 1 };
  if (dnp) Object.assign(stats, { pts: 0, reb: 0, ast: 0, fg3m: 0, stl: 0, blk: 0, tov: 0 });
  return { ...base, ...stats };
}

async function seedLeague(db: Db): Promise<void> {
  await db.insert(teams).values(
    ['aaa', 'bbb', 'ccc', 'ddd'].map((id) => ({
      id,
      abbr: id.toUpperCase(),
      name: `Team ${id}`,
    })),
  );
  await db.insert(players).values([
    { id: 'p1', name: 'Pat Guard', teamId: 'aaa', position: 'G' },
    { id: 'p2', name: 'Fred Forward', teamId: 'aaa', position: 'F' },
    { id: 'p3', name: 'Cal Center', teamId: 'aaa', position: 'C' },
    { id: 'p4', name: 'Ben Bench', teamId: 'aaa', position: 'G' },
    { id: 'p5', name: 'Quinn Q', teamId: 'aaa', position: 'F' },
    { id: 'p6', name: 'Carl Ccc', teamId: 'ccc', position: 'G' },
    { id: 'b1', name: 'Bob Bbb', teamId: 'bbb', position: 'G' },
  ]);
  await db.insert(games).values([
    ...HIST.map((g, i) => ({
      id: g.id,
      season: g.season,
      date: g.date,
      tipAt: tipOf(g.date),
      homeTeamId: i % 2 === 0 ? 'aaa' : g.opp,
      awayTeamId: i % 2 === 0 ? g.opp : 'aaa',
      status: 'final' as const,
      homeScore: 110,
      awayScore: 100,
    })),
    {
      id: 'g0',
      season: 2026,
      date: TODAY,
      tipAt: new Date('2026-11-18T00:30:00Z'),
      homeTeamId: 'aaa',
      awayTeamId: 'bbb',
      status: 'scheduled' as const,
      spread: -4.5,
      total: 228.5,
    },
    {
      id: 'g1',
      season: 2026,
      date: TOMORROW,
      tipAt: new Date('2026-11-19T00:00:00Z'),
      homeTeamId: 'ccc',
      awayTeamId: 'ddd',
      status: 'scheduled' as const,
    },
  ]);
  const logs = HIST.flatMap((g, i) => [
    logRow({ playerId: 'p1', teamId: 'aaa', pos: 'G', g, i }),
    logRow({ playerId: 'p2', teamId: 'aaa', pos: 'F', g, i }),
    logRow({ playerId: 'p3', teamId: 'aaa', pos: 'C', g, i }),
  ]);
  // p4 played a few bench minutes this season; p6 (ccc) has logs vs aaa.
  for (const g of HIST.slice(-4)) {
    logs.push({ ...logRow({ playerId: 'p4', teamId: 'aaa', pos: 'G', g, i: 0 }), minutes: 12 });
  }
  await db.insert(playerGameLogs).values(logs);
  await db.insert(playerGameLogs).values(
    HIST.filter((g) => g.opp === 'ccc').map((g, i) => ({
      ...logRow({ playerId: 'p6', teamId: 'ccc', pos: 'G', g, i }),
      oppTeamId: 'aaa',
      isHome: false,
    })),
  );

  // Injuries: an old batch (p2 questionable) and the current batch.
  const old = new Date('2026-11-17T12:00:00Z');
  const cur = new Date('2026-11-17T15:00:00Z');
  await db.insert(injuries).values([
    { playerId: 'p2', teamId: 'aaa', status: 'questionable', capturedAt: old },
    { playerId: 'p3', teamId: 'aaa', status: 'out', capturedAt: old },
    { playerId: 'p1', teamId: 'aaa', status: 'probable', capturedAt: cur },
    { playerId: 'p3', teamId: 'aaa', status: 'out', capturedAt: cur },
    { playerId: 'p4', teamId: 'aaa', status: 'doubtful', capturedAt: cur },
    { playerId: 'p5', teamId: 'aaa', status: 'questionable', capturedAt: cur },
  ]);

  // Offers. p1 PTS: opens at 24.5 (2 of 3 books), moves to 25.5.
  const offer = (
    gameId: string,
    playerId: string,
    market: Market,
    book: Book,
    line: number,
    overPrice: number | null,
    underPrice: number | null,
    capturedAt: Date,
  ) => ({ gameId, playerId, market, book, line, overPrice, underPrice, capturedAt });
  await db.insert(propOffers).values([
    offer('g0', 'p1', 'PTS', 'draftkings', 24.5, -110, -110, T0),
    offer('g0', 'p1', 'PTS', 'fanduel', 24.5, -115, -105, T0),
    offer('g0', 'p1', 'PTS', 'betmgm', 23.5, -120, 100, T0),
    offer('g0', 'p1', 'PTS', 'draftkings', 25.5, -110, -110, T1),
    offer('g0', 'p1', 'PTS', 'fanduel', 25.5, 100, -120, T1),
    offer('g0', 'p1', 'PTS', 'betmgm', 24.5, -105, -115, T1),
    // p2 PTS: no movement.
    offer('g0', 'p2', 'PTS', 'draftkings', 15.5, -110, -110, T0),
    offer('g0', 'p2', 'PTS', 'fanduel', 15.5, -112, -108, T0),
    offer('g0', 'p2', 'PTS', 'betmgm', 15.5, 105, -125, T0),
    // p2 REB: three different lines → the lower line wins the tie; dk has no under.
    offer('g0', 'p2', 'REB', 'draftkings', 6.5, -130, null, T0),
    offer('g0', 'p2', 'REB', 'fanduel', 7.5, -110, -110, T0),
    offer('g0', 'p2', 'REB', 'betmgm', 8.5, 120, -150, T0),
    // tomorrow's game
    offer('g1', 'p6', 'PTS', 'draftkings', 20.5, -110, -110, T0),
    offer('g1', 'p6', 'PTS', 'fanduel', 20.5, -105, -115, T0),
  ]);
}

/** The test's own LogLine view of a player's history (oldest → newest). */
async function historyOf(db: Db, playerId: string): Promise<LogLine[]> {
  const rows = await db
    .select()
    .from(playerGameLogs)
    .innerJoin(games, eq(games.id, playerGameLogs.gameId))
    .where(eq(playerGameLogs.playerId, playerId))
    .orderBy(asc(games.tipAt));
  return rows.map(({ player_game_logs: l, games: g }) => ({
    gameId: l.gameId,
    date: g.date,
    season: g.season,
    oppTeamId: l.oppTeamId,
    isHome: l.isHome,
    started: l.started,
    dnp: l.dnp,
    minutes: l.minutes,
    pts: l.pts,
    reb: l.reb,
    ast: l.ast,
    fg3m: l.fg3m,
    stl: l.stl,
    blk: l.blk,
    tov: l.tov,
  }));
}

type MetricRow = InferSelectModel<typeof propMetrics>;

async function metric(db: Db, playerId: string, market: Market, side: Side): Promise<MetricRow> {
  const [row] = await db
    .select()
    .from(propMetrics)
    .where(eq(propMetrics.propKey, propKey({ gameId: 'g0', playerId, market, side })));
  expect(row, `${playerId} ${market} ${side}`).toBeDefined();
  return row!;
}

let db: Db;
let ctx: JobContext;

beforeEach(async () => {
  db = await createTestDb();
  ctx = await makeCtx({ db, now: NOON });
  await seedLeague(db);
});

afterEach(async () => {
  await closeDb(db);
});

describe('precompute', () => {
  it('writes one row per (game, player, market, side) at the main line', async () => {
    await precompute(ctx, {});
    const rows = await db.select().from(propMetrics).orderBy(asc(propMetrics.propKey));
    expect(rows.map((r) => r.propKey)).toEqual([
      'g0:p1:PTS:over',
      'g0:p1:PTS:under',
      'g0:p2:PTS:over',
      'g0:p2:PTS:under',
      'g0:p2:REB:over',
      'g0:p2:REB:under',
      'g1:p6:PTS:over',
      'g1:p6:PTS:under',
    ]);
    const line = (k: string) => rows.find((r) => r.propKey === k)!.line;
    expect(line('g0:p1:PTS:over')).toBe(25.5); // modal current line (dk + fd)
    expect(line('g0:p1:PTS:under')).toBe(25.5);
    expect(line('g0:p2:PTS:over')).toBe(15.5);
    expect(line('g0:p2:REB:over')).toBe(6.5); // three-way tie → lower line
  });

  it('matches the analytics hit rates, edge, streak and recent values', async () => {
    await precompute(ctx, {});
    const logs = await historyOf(db, 'p1');
    expect(logs).toHaveLength(20);
    for (const side of ['over', 'under'] as const) {
      const row = await metric(db, 'p1', 'PTS', side);
      const w = allWindows(logs, 'PTS', 25.5, side, { oppTeamId: 'bbb', season: 2026 });
      expect([row.hitsL10, row.nL10, row.rateL10]).toEqual([w.l10.hits, w.l10.n, w.l10.rate]);
      expect(row.rateL10).toBe(
        hitRate(selectWindow(logs, 'l10', { oppTeamId: 'bbb', season: 2026 }), 'PTS', 25.5, side)
          .rate,
      );
      expect([row.hitsL5, row.nL5, row.rateL5]).toEqual([w.l5.hits, w.l5.n, w.l5.rate]);
      expect([row.hitsL20, row.nL20, row.rateL20]).toEqual([w.l20.hits, w.l20.n, w.l20.rate]);
      expect([row.hitsSeason, row.nSeason, row.rateSeason]).toEqual([
        w.season.hits,
        w.season.n,
        w.season.rate,
      ]);
      expect([row.hitsH2h, row.nH2h, row.rateH2h]).toEqual([w.h2h.hits, w.h2h.n, w.h2h.rate]);
      expect([row.hitsLastSeason, row.nLastSeason, row.rateLastSeason]).toEqual([
        w.lastSeason.hits,
        w.lastSeason.n,
        w.lastSeason.rate,
      ]);
      // DNP excluded: 19 played games, 4 last season, h2h = games vs bbb.
      expect(row.nL20).toBe(19);
      expect(row.nLastSeason).toBe(4);
      expect(row.nH2h).toBe(logs.filter((l) => isPlayed(l) && l.oppTeamId === 'bbb').length);

      const e = edge(logs, 'PTS', 25.5, side);
      expect(row.avg).toBeCloseTo(e.avg!, 10);
      expect(row.median).toBe(e.median);
      expect(row.edgeAvg).toBeCloseTo(e.edgeAvg!, 10);
      expect(row.edgeMedian).toBe(e.edgeMedian);
      expect(row.streak).toBe(streak(logs, 'PTS', 25.5, side));
      const played = logs.filter(isPlayed);
      expect(row.recent).toEqual(played.slice(-10).map((l) => statValue(l, 'PTS')));
      expect(row.minutesL5).toBeCloseTo(
        played.slice(-5).reduce((a, l) => a + l.minutes, 0) / 5,
        10,
      );
    }
  });

  it('prices the main line: best price/book, consensus no-vig and value', async () => {
    await precompute(ctx, {});
    const over = await metric(db, 'p1', 'PTS', 'over');
    const under = await metric(db, 'p1', 'PTS', 'under');
    // books at 25.5: draftkings -110/-110, fanduel +100/-120 (betmgm is at 24.5)
    expect([over.bestPrice, over.bestBook]).toEqual([100, 'fanduel']);
    expect([under.bestPrice, under.bestBook]).toEqual([-110, 'draftkings']);
    const cons = consensusNoVig([
      { over: -110, under: -110 },
      { over: 100, under: -120 },
    ])!;
    expect(over.impliedProbNovig).toBeCloseTo(cons.over, 12);
    expect(under.impliedProbNovig).toBeCloseTo(cons.under, 12);
    expect(over.value).toBeCloseTo(over.rateL10! - cons.over, 12);
    expect(under.value).toBeCloseTo(under.rateL10! - cons.under, 12);
    expect(
      bestPrice([
        { price: -110, book: 'draftkings' },
        { price: 100, book: 'fanduel' },
      ])!.book,
    ).toBe('fanduel');

    // p2 REB main line 6.5: only draftkings, which has no under price.
    const rebOver = await metric(db, 'p2', 'REB', 'over');
    const rebUnder = await metric(db, 'p2', 'REB', 'under');
    expect([rebOver.bestPrice, rebOver.bestBook]).toEqual([-130, 'draftkings']);
    expect([rebUnder.bestPrice, rebUnder.bestBook]).toEqual([null, null]);
    expect(rebOver.impliedProbNovig).toBeNull();
    expect(rebOver.value).toBeNull();
  });

  it('sets line open/move, game context, injuries and teammates out', async () => {
    await precompute(ctx, {});
    const p1 = await metric(db, 'p1', 'PTS', 'over');
    expect(p1.lineOpen).toBe(24.5);
    expect(p1.lineMove).toBe(1);
    const p2 = await metric(db, 'p2', 'PTS', 'under');
    expect([p2.lineOpen, p2.lineMove]).toEqual([15.5, 0]);

    expect(p1).toMatchObject({
      playerName: 'Pat Guard',
      position: 'G',
      teamId: 'aaa',
      teamAbbr: 'AAA',
      oppTeamId: 'bbb',
      oppAbbr: 'BBB',
      isHome: true,
      restDays: 0,
      isB2b: true,
      gameTotal: 228.5,
      gameSpread: -4.5,
      injuryStatus: 'probable',
      teammateOut: true,
      isStarter: true,
    });
    expect(p1.tipAt.toISOString()).toBe('2026-11-18T00:30:00.000Z');
    expect(p1.computedAt.toISOString()).toBe(NOON.toISOString());
    // Out/Doubtful only (p5 is questionable), ranked by season minutes; p1 excluded.
    expect(p1.teammatesOut.map((t) => [t.playerId, t.status])).toEqual([
      ['p3', 'out'],
      ['p4', 'doubtful'],
    ]);
    expect(p1.teammatesOut[1]!.minutes).toBe(12);
    expect(p1.teammatesOut[0]).toMatchObject({ name: 'Cal Center' });
    // p2 was questionable only in an older report: healthy now.
    expect(p2.injuryStatus).toBeNull();
    expect(p2.teammatesOut.map((t) => t.playerId)).toEqual(['p3', 'p4']);
    // usage: mean of the last 10 played games' usage proxies
    const usage = (
      await db
        .select({ u: playerGameLogs.usageProxy, g: games.tipAt, dnp: playerGameLogs.dnp })
        .from(playerGameLogs)
        .innerJoin(games, eq(games.id, playerGameLogs.gameId))
        .where(eq(playerGameLogs.playerId, 'p1'))
        .orderBy(asc(games.tipAt))
    )
      .filter((r) => !r.dnp)
      .slice(-10)
      .map((r) => r.u!);
    expect(p1.usageL10).toBeCloseTo(usage.reduce((a, b) => a + b, 0) / usage.length, 10);
  });

  it("sets dvp rank/tier from the opponent's l15 rank for the position and market", async () => {
    await precompute(ctx, {});
    const [dv] = await db
      .select()
      .from(teamDvp)
      .where(
        and(
          eq(teamDvp.teamId, 'bbb'),
          eq(teamDvp.position, 'G'),
          eq(teamDvp.market, 'PTS'),
          eq(teamDvp.window, 'l15'),
        ),
      );
    expect(dv).toBeDefined();
    const p1 = await metric(db, 'p1', 'PTS', 'over');
    expect(p1.dvpRank).toBe(dv!.rank);
    expect(p1.dvpTier).toBe(dvpTier(dv!.rank));
    expect(p1.dvpTier).not.toBeNull();
  });

  it('is idempotent', async () => {
    await precompute(ctx, {});
    const first = await db.select().from(propMetrics).orderBy(asc(propMetrics.propKey));
    const dv1 = await db.select().from(teamDvp);
    await precompute(ctx, {});
    const second = await db.select().from(propMetrics).orderBy(asc(propMetrics.propKey));
    const dv2 = await db.select().from(teamDvp);
    expect(second).toEqual(first);
    expect(dv2.length).toBe(dv1.length);
    expect(new Set(dv2.map((r) => JSON.stringify(r)))).toEqual(
      new Set(dv1.map((r) => JSON.stringify(r))),
    );
  });

  it('--incremental recomputes only games tipping today', async () => {
    await precompute(ctx, {});
    const later = new Date(NOON.getTime() + 3_600_000);
    // A new capture for both games.
    await db.insert(propOffers).values([
      {
        gameId: 'g0',
        playerId: 'p2',
        market: 'PTS',
        book: 'draftkings',
        line: 16.5,
        overPrice: -110,
        underPrice: -110,
        capturedAt: later,
      },
      {
        gameId: 'g0',
        playerId: 'p2',
        market: 'PTS',
        book: 'fanduel',
        line: 16.5,
        overPrice: -110,
        underPrice: -110,
        capturedAt: later,
      },
      {
        gameId: 'g1',
        playerId: 'p6',
        market: 'PTS',
        book: 'draftkings',
        line: 22.5,
        overPrice: -110,
        underPrice: -110,
        capturedAt: later,
      },
      {
        gameId: 'g1',
        playerId: 'p6',
        market: 'PTS',
        book: 'fanduel',
        line: 22.5,
        overPrice: -110,
        underPrice: -110,
        capturedAt: later,
      },
    ]);
    const before = await db.select().from(propMetrics).orderBy(asc(propMetrics.propKey));
    const res = await precompute({ ...ctx, now: later }, { incremental: true });
    const after = await db.select().from(propMetrics).orderBy(asc(propMetrics.propKey));

    expect(after.map((r) => r.propKey)).toEqual(before.map((r) => r.propKey));
    for (const row of after) {
      const prev = before.find((b) => b.propKey === row.propKey)!;
      if (row.gameId === 'g0') {
        expect(row.computedAt.toISOString(), row.propKey).toBe(later.toISOString());
      } else {
        expect(row, row.propKey).toEqual(prev);
      }
    }
    expect(after.find((r) => r.propKey === 'g0:p2:PTS:over')!.line).toBe(16.5);
    expect(after.find((r) => r.propKey === 'g0:p2:PTS:over')!.lineMove).toBe(1);
    expect(after.find((r) => r.propKey === 'g1:p6:PTS:over')!.line).toBe(20.5);
    expect(res.meta).toMatchObject({ incremental: true, games: 1, rows: 6 });
  });

  it('--incremental always rebuilds team_dvp, picking up a game that went final', async () => {
    // A matinee is in progress during the full run (so it is not in team_dvp yet).
    await db.insert(games).values({
      id: 'af',
      season: 2026,
      date: TODAY,
      tipAt: new Date('2026-11-17T16:00:00Z'),
      homeTeamId: 'ccc',
      awayTeamId: 'bbb',
      status: 'in_progress',
    });
    await precompute(ctx, {});
    const bbbGPts = async () => {
      const [r] = await db
        .select()
        .from(teamDvp)
        .where(
          and(
            eq(teamDvp.teamId, 'bbb'),
            eq(teamDvp.position, 'G'),
            eq(teamDvp.market, 'PTS'),
            eq(teamDvp.window, 'l15'),
          ),
        );
      return r!;
    };
    const old = await bbbGPts();
    expect(old.computedAt.toISOString()).toBe(NOON.toISOString());

    // It goes final (it tipped before the last DvP build): bbb gave up 200 to a guard.
    await db.update(games).set({ status: 'final' }).where(eq(games.id, 'af'));
    await db.insert(playerGameLogs).values({
      ...logRow({ playerId: 'p6', teamId: 'ccc', pos: 'G', g: HIST[0]!, i: 0 }),
      gameId: 'af',
      oppTeamId: 'bbb',
      pts: 200,
    });
    const later = new Date('2026-11-17T21:00:00Z');
    const res = await precompute({ ...ctx, now: later }, { incremental: true });
    const [dvpCount] = await db.select({ n: count() }).from(teamDvp);
    expect(res.meta).toMatchObject({ incremental: true, dvpRows: dvpCount!.n });

    const fresh = await bbbGPts();
    expect(fresh.computedAt.toISOString()).toBe(later.toISOString());
    expect(fresh.allowedPerGame).toBeGreaterThan(old.allowedPerGame);
    expect(fresh.rank).not.toBe(old.rank);
    const p1 = await metric(db, 'p1', 'PTS', 'over');
    expect([p1.dvpRank, p1.dvpTier]).toEqual([fresh.rank, dvpTier(fresh.rank)]);
  });

  it('a full run deletes the rows of finished games', async () => {
    await precompute(ctx, {});
    await db.update(games).set({ status: 'final' }).where(eq(games.id, 'g0'));
    const res = await precompute(ctx, {});
    const rows = await db.select().from(propMetrics);
    expect(rows.filter((r) => r.gameId === 'g0')).toEqual([]);
    expect(rows.filter((r) => r.gameId === 'g1')).toHaveLength(2);
    expect(res.meta).toMatchObject({ finishedDeleted: 6 });

    // postponed and canceled games leave the board too
    await db.update(games).set({ status: 'postponed' }).where(eq(games.id, 'g1'));
    await precompute(ctx, {});
    expect(await db.select().from(propMetrics)).toEqual([]);
  });

  it("--incremental deletes the rows of today's finished games only", async () => {
    await precompute(ctx, {});
    await db.update(games).set({ status: 'final' }).where(eq(games.id, 'g0'));
    await db.update(games).set({ status: 'postponed' }).where(eq(games.id, 'g1')); // tomorrow
    const later = new Date('2026-11-17T23:00:00Z');
    const res = await precompute({ ...ctx, now: later }, { incremental: true });
    const rows = await db.select().from(propMetrics);
    expect(rows.filter((r) => r.gameId === 'g0')).toEqual([]);
    expect(rows.filter((r) => r.gameId === 'g1')).toHaveLength(2);
    expect(res.meta).toMatchObject({ incremental: true, finishedDeleted: 6, games: 0 });
  });

  it("falls back to last season's minutes for a teammate with none this season", async () => {
    await db.insert(players).values({ id: 'p7', name: 'Star Seven', teamId: 'aaa', position: 'G' });
    await db.insert(playerGameLogs).values(
      HIST.filter((g) => g.season === 2025).map((g, i) => ({
        ...logRow({ playerId: 'p7', teamId: 'aaa', pos: 'G', g, i }),
        minutes: 34,
      })),
    );
    // A newer report: only p7 is out.
    await db.insert(injuries).values({
      playerId: 'p7',
      teamId: 'aaa',
      status: 'out',
      capturedAt: new Date('2026-11-17T16:00:00Z'),
    });
    await precompute(ctx, {});
    const p1 = await metric(db, 'p1', 'PTS', 'over');
    expect(p1.teammatesOut).toEqual([
      { playerId: 'p7', name: 'Star Seven', status: 'out', minutes: 34 },
    ]);
    expect(p1.teammateOut).toBe(true);
    expect(p1.injuryStatus).toBeNull();
  });
});

describe('dvp', () => {
  it('ranks allowed-per-game by team, position and market over l15 and season', async () => {
    // xxx and yyy each defend 17 games vs zzz guards this season.
    const db2 = await createTestDb();
    try {
      await db2
        .insert(teams)
        .values(['xxx', 'yyy', 'zzz'].map((id) => ({ id, abbr: id.toUpperCase(), name: id })));
      await db2.insert(players).values([
        { id: 'zg', name: 'Z Guard', teamId: 'zzz', position: 'G' },
        { id: 'zc', name: 'Z Center', teamId: 'zzz', position: 'C' },
        { id: 'zb', name: 'Z Bench', teamId: 'zzz', position: 'G' },
      ]);
      const gs = Array.from({ length: 34 }, (_, i) => ({
        id: `d${i}`,
        season: 2026,
        date: addDays('2026-10-01', i),
        tipAt: tipOf(addDays('2026-10-01', i)),
        homeTeamId: 'zzz',
        awayTeamId: i % 2 === 0 ? 'xxx' : 'yyy',
        status: 'final' as const,
      }));
      await db2.insert(games).values(gs);
      const base = { isHome: true, started: true, minutes: 30, fga: 0, fta: 0 };
      await db2.insert(playerGameLogs).values(
        gs.flatMap((g, i) => {
          const opp = g.awayTeamId;
          const k = Math.floor(i / 2); // 0..16 per defending team
          const ptsG = opp === 'xxx' ? 10 + k : 20 + k;
          const rows = [
            {
              ...base,
              playerId: 'zg',
              gameId: g.id,
              teamId: 'zzz',
              oppTeamId: opp,
              pts: ptsG,
              reb: 2,
            },
            // a DNP guard must not count
            {
              ...base,
              playerId: 'zb',
              gameId: g.id,
              teamId: 'zzz',
              oppTeamId: opp,
              pts: 99,
              dnp: true,
              minutes: 0,
            },
          ];
          // the center only plays in odd-k games (0 allowed to C otherwise)
          if (k % 2 === 1) {
            rows.push({
              ...base,
              playerId: 'zc',
              gameId: g.id,
              teamId: 'zzz',
              oppTeamId: opp,
              pts: 8,
              reb: 10,
            });
          }
          return rows;
        }),
      );
      const c2 = await makeCtx({ db: db2, now: NOON });
      const res = await computeDvp(c2);
      expect(res.rows).toBeGreaterThan(0);

      const get = async (
        teamId: string,
        position: Pos,
        market: Market,
        window: 'l15' | 'season',
      ) => {
        const [r] = await db2
          .select()
          .from(teamDvp)
          .where(
            and(
              eq(teamDvp.teamId, teamId),
              eq(teamDvp.position, position),
              eq(teamDvp.market, market),
              eq(teamDvp.window, window),
            ),
          );
        return r!;
      };
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      const ks = Array.from({ length: 17 }, (_, k) => k);
      const xSeason = await get('xxx', 'G', 'PTS', 'season');
      expect(xSeason.allowedPerGame).toBeCloseTo(mean(ks.map((k) => 10 + k)), 10);
      const xL15 = await get('xxx', 'G', 'PTS', 'l15');
      expect(xL15.allowedPerGame).toBeCloseTo(mean(ks.slice(-15).map((k) => 10 + k)), 10);
      const yL15 = await get('yyy', 'G', 'PTS', 'l15');
      expect(yL15.allowedPerGame).toBeCloseTo(mean(ks.slice(-15).map((k) => 20 + k)), 10);
      // fewer allowed = tougher = rank 1
      const ranks = dvpRank([
        { teamId: 'xxx', allowedPerGame: xL15.allowedPerGame },
        { teamId: 'yyy', allowedPerGame: yL15.allowedPerGame },
      ]);
      expect([xL15.rank, yL15.rank]).toEqual([ranks.get('xxx'), ranks.get('yyy')]);
      expect([xL15.rank, xL15.tier]).toEqual([1, 'best']);
      // combos and games where the position did not play (0 allowed)
      const xC = await get('xxx', 'C', 'PRA', 'season');
      expect(xC.allowedPerGame).toBeCloseTo((8 * 18) / 17, 10);
      const xGPr = await get('xxx', 'G', 'PR', 'season');
      expect(xGPr.allowedPerGame).toBeCloseTo(mean(ks.map((k) => 10 + k + 2)), 10);
      // zzz never defended: no rows
      expect((await db2.select().from(teamDvp).where(eq(teamDvp.teamId, 'zzz'))).length).toBe(0);
      // the dvp job wraps computeDvp
      expect((await dvp(c2, {})).meta).toMatchObject({ rows: res.rows });
    } finally {
      await closeDb(db2);
    }
  });
});

describe('grade-slips', () => {
  it('grades pending legs on final games: hit, miss, push and void', async () => {
    await db.insert(users).values({ id: 'u1', email: 'u@example.com' });
    const [slip] = await db.insert(slips).values({ userId: 'u1', name: 'test' }).returning();
    // h19: p1 scored p1Pts(19); h10: p1 DNP.
    const pts19 = p1Pts(19);
    await db.insert(games).values({
      id: 'pp',
      season: 2026,
      date: '2026-11-15',
      tipAt: tipOf('2026-11-15'),
      homeTeamId: 'aaa',
      awayTeamId: 'ccc',
      status: 'postponed',
    });
    await db.insert(games).values({
      id: 'nobox',
      season: 2026,
      date: '2026-11-16',
      tipAt: tipOf('2026-11-16'),
      homeTeamId: 'ccc',
      awayTeamId: 'ddd',
      status: 'final',
    });
    const leg = (gameId: string, side: Side, line: number, playerId = 'p1') => ({
      slipId: slip!.id,
      gameId,
      playerId,
      market: 'PTS' as const,
      side,
      line,
      price: -110,
    });
    const legs = await db
      .insert(slipLegs)
      .values([
        leg('h19', 'over', pts19 - 0.5), // hit
        leg('h19', 'under', pts19 - 0.5), // miss
        leg('h19', 'over', pts19), // push
        leg('h10', 'over', 10.5), // DNP → void
        leg('pp', 'over', 10.5), // postponed → void
        leg('g0', 'over', 10.5), // not final → pending
        leg('nobox', 'over', 10.5, 'p6'), // final but no box score yet → pending
      ])
      .returning();
    // an already-graded leg is left alone
    await db.update(slipLegs).set({ result: 'miss' }).where(eq(slipLegs.id, legs[0]!.id));
    await db.insert(slipLegs).values({ ...leg('h19', 'over', pts19 - 0.5), result: 'pending' });

    const res = await gradeSlips(ctx, {});
    const rows = await db.select().from(slipLegs);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(legs.slice(1).map((l) => byId.get(l.id)!.result)).toEqual([
      'miss',
      'push',
      'void',
      'void',
      'pending',
      'pending',
    ]);
    expect(byId.get(legs[0]!.id)!.result).toBe('miss'); // untouched
    const fresh = rows.find((r) => !legs.some((l) => l.id === r.id))!;
    expect(fresh.result).toBe('hit');
    expect(fresh.gradedAt?.toISOString()).toBe(NOON.toISOString());
    expect(byId.get(legs[5]!.id)!.gradedAt).toBeNull();
    expect(res.meta).toMatchObject({ graded: 5, pending: 2 });

    // cross-check with analytics gradeLeg
    const box = (await historyOf(db, 'p1')).find((l) => l.gameId === 'h19')!;
    expect(gradeLeg({ market: 'PTS', line: pts19 - 0.5, side: 'over' }, box, 'final')).toBe('hit');

    // idempotent: nothing left to grade
    expect((await gradeSlips(ctx, {})).meta).toMatchObject({ graded: 0 });
  });
});

describe('cli registration', () => {
  it('registers dvp, precompute and grade-slips', () => {
    expect(parseArgs(['dvp']).job).toBe('dvp');
    expect(parseArgs(['grade-slips']).job).toBe('grade-slips');
    expect(parseArgs(['precompute', '--incremental']).opts).toEqual({ incremental: true });
    expect(typeof JOB_REGISTRY.dvp).toBe('function');
  });
});
