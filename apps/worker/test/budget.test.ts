import type { OddsProvider } from '@blueline/adapters';
import { MARKET_PRIORITY, MARKETS, type Market } from '@blueline/contracts';
import { apiUsage, closeDb, eq, propOffers, type Db } from '@blueline/db';
import { createTestDb } from '@blueline/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addUsage, getUsage, monthOf, planMarkets } from '../src/jobs/budget';
import { ingestOdds } from '../src/jobs/odds';
import { ingestSchedule } from '../src/jobs/schedule';
import type { JobContext } from '../src/run-job';
import { makeCtx } from './helpers';

const perMarket = (g: number, m: number) => g * m;

describe('planMarkets', () => {
  it('keeps every market when the pull fits', () => {
    const plan = planMarkets({
      used: 0,
      budget: 100,
      games: 5,
      wanted: MARKETS,
      estimate: perMarket,
    });
    expect(plan).toEqual({
      skipped: false,
      markets: [...MARKET_PRIORITY],
      trimmed: [],
      estimate: 60,
    });
  });

  it('trims from the least valuable end until it fits', () => {
    const plan = planMarkets({
      used: 80,
      budget: 100,
      games: 5,
      wanted: MARKETS,
      estimate: perMarket,
    });
    expect(plan.skipped).toBe(false);
    expect(plan.markets).toEqual(['PTS', 'REB', 'AST', 'PRA']);
    expect(plan.estimate).toBe(20);
    expect(plan.trimmed).toEqual(MARKET_PRIORITY.slice(4));
  });

  it('skips when not even the top market fits', () => {
    const plan = planMarkets({
      used: 98,
      budget: 100,
      games: 5,
      wanted: MARKETS,
      estimate: perMarket,
    });
    expect(plan).toMatchObject({ skipped: 'budget', markets: [] });
  });

  it('cannot trim a flat-cost provider (SGO bills per event)', () => {
    const flat = (g: number) => g;
    expect(
      planMarkets({ used: 0, budget: 5, games: 5, wanted: MARKETS, estimate: flat }).markets,
    ).toHaveLength(12);
    expect(
      planMarkets({ used: 1, budget: 5, games: 5, wanted: MARKETS, estimate: flat }).skipped,
    ).toBe('budget');
  });
});

describe('api_usage', () => {
  it('accumulates units per provider and month', async () => {
    const db = await createTestDb();
    await addUsage(db, 'sgo', '2026-11', 5);
    await addUsage(db, 'sgo', '2026-11', 7);
    await addUsage(db, 'sgo', '2026-11', 0);
    await addUsage(db, 'theoddsapi', '2026-11', 3);
    expect(await getUsage(db, 'sgo', '2026-11')).toBe(12);
    expect(await getUsage(db, 'sgo', '2026-12')).toBe(0);
    expect(monthOf(new Date('2026-12-01T03:00:00Z'))).toBe('2026-11'); // still Nov 30 in New York
    await closeDb(db);
  });
});

describe('ingest:odds budget guard', () => {
  let db: Db;
  let ctx: JobContext;
  let calls: Market[][];

  /** Fixture offers, billed like The Odds API: one unit per market per game. */
  function billedOdds(inner: OddsProvider): OddsProvider {
    return {
      name: 'paid',
      estimateUnits: perMarket,
      getGameLines: async (d) => ({ ...(await inner.getGameLines(d)), units: 0 }),
      async getPlayerProps(game, markets) {
        calls.push(markets);
        const res = await inner.getPlayerProps(game, markets);
        return { offers: res.offers, units: markets.length };
      },
    };
  }

  beforeEach(async () => {
    db = await createTestDb();
    ctx = await makeCtx({ db });
    await ingestSchedule(ctx, {});
    ctx = { ...ctx, odds: billedOdds(ctx.odds) };
    calls = [];
  });
  afterEach(async () => {
    await closeDb(db);
  });

  const usage = async () =>
    (await db.select().from(apiUsage).where(eq(apiUsage.provider, 'paid')))[0]?.units ?? 0;

  it('full: pulls every market and records the units spent', async () => {
    const res = await ingestOdds({ ...ctx, oddsMonthlyBudget: 1000 }, {});
    expect(res.units).toBe(60);
    expect(res.meta).toMatchObject({ trimmed: [], estimate: 60 });
    expect(calls).toHaveLength(5);
    expect(calls[0]).toEqual([...MARKET_PRIORITY]);
    expect(await usage()).toBe(60);
  });

  it('trimmed: drops low-priority markets to fit the remaining budget', async () => {
    await addUsage(db, 'paid', monthOf(ctx.now), 80);
    const res = await ingestOdds({ ...ctx, oddsMonthlyBudget: 100 }, {});
    expect(res.units).toBe(20);
    expect(calls.every((m) => m.join() === 'PTS,REB,AST,PRA')).toBe(true);
    const markets = new Set((await db.select().from(propOffers)).map((r) => r.market));
    expect(markets).toEqual(new Set(['PTS', 'REB', 'AST', 'PRA']));
    expect(await usage()).toBe(100);
  });

  it('skipped: no market fits, nothing is pulled', async () => {
    await addUsage(db, 'paid', monthOf(ctx.now), 99);
    const res = await ingestOdds({ ...ctx, oddsMonthlyBudget: 100 }, {});
    expect(res.units).toBe(0);
    expect(res.meta).toMatchObject({ skipped: 'budget', used: 99, budget: 100 });
    expect(calls).toHaveLength(0);
    expect(await db.select().from(propOffers)).toHaveLength(0);
    expect(await usage()).toBe(99);
  });
});
