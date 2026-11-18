import {
  and,
  closeDb,
  eq,
  games,
  propCurrent,
  propOffers,
  providerAliases,
  type Db,
} from '@blueline/db';
import { createTestDb } from '@blueline/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ingestOdds } from '../src/jobs/odds';
import { ingestSchedule } from '../src/jobs/schedule';
import type { JobContext } from '../src/run-job';
import { counts, makeCtx, mapOffers } from './helpers';

let db: Db;
let ctx: JobContext;
beforeEach(async () => {
  db = await createTestDb();
  ctx = await makeCtx({ db });
  await ingestSchedule(ctx, {});
});
afterEach(async () => {
  await closeDb(db);
});

describe('ingest:odds', () => {
  it('stores offers from ≥ 3 books for every scheduled game of the day', async () => {
    const res = await ingestOdds(ctx, {});
    expect(res.units).toBe(0);
    expect(res.meta).toMatchObject({ games: 5, closing: false, unmatched: [] });
    expect((res.meta!.inserted as number) > 500).toBe(true);
    const rows = await db.select().from(propOffers);
    const byGame = new Map<string, Set<string>>();
    for (const r of rows) byGame.set(r.gameId, (byGame.get(r.gameId) ?? new Set()).add(r.book));
    expect(byGame.size).toBe(5);
    for (const books of byGame.values()) expect(books.size).toBeGreaterThanOrEqual(3);
    expect(rows.every((r) => r.capturedAt.getTime() === ctx.now.getTime())).toBe(true);
  });

  it('maps provider players through provider_aliases, matching name + team on a miss', async () => {
    await ingestOdds(ctx, {});
    const aliases = await db
      .select()
      .from(providerAliases)
      .where(and(eq(providerAliases.provider, 'fixtures'), eq(providerAliases.kind, 'player')));
    expect(aliases.length).toBeGreaterThan(50);
    // SGO drops the period in "Jr." — still matched by normalized name.
    const jr = aliases.find((a) => a.externalId.includes('_JR_'));
    if (jr) expect(jr.internalId).toMatch(/^p\d+$/);
    const gameAliases = await db
      .select()
      .from(providerAliases)
      .where(eq(providerAliases.kind, 'game'));
    expect(gameAliases).toHaveLength(5);

    // A second run resolves from the stored aliases (no new alias rows).
    const before = await counts(db);
    await ingestOdds({ ...ctx, now: new Date(ctx.now.getTime() + 60_000) }, {});
    expect((await counts(db)).aliases).toBe(before.aliases);
  });

  it('lists players it cannot match in meta.unmatched', async () => {
    const odds = mapOffers(ctx.odds, (offers) =>
      offers.length
        ? [
            ...offers,
            { ...offers[0]!, providerPlayerId: 'NOBODY_1_NBA', playerName: 'Nobody Special' },
          ]
        : offers,
    );
    const res = await ingestOdds({ ...ctx, odds }, {});
    expect((res.meta!.unmatched as string[]).some((s) => s.startsWith('Nobody Special'))).toBe(
      true,
    );
  });

  it('is append-only: unchanged prices insert 0 rows, a changed price inserts 1', async () => {
    await ingestOdds(ctx, {});
    const first = (await counts(db)).offers;

    const later = { ...ctx, now: new Date(ctx.now.getTime() + 2 * 3_600_000) };
    const again = await ingestOdds(later, {});
    expect(again.meta).toMatchObject({ inserted: 0 });
    expect((await counts(db)).offers).toBe(first);

    let changed = false;
    const moved = mapOffers(ctx.odds, (offers) =>
      offers.map((o) => {
        if (changed || o.market !== 'PTS' || o.book !== 'draftkings') return o;
        changed = true;
        return { ...o, overPrice: (o.overPrice ?? -110) - 10 };
      }),
    );
    const third = await ingestOdds({ ...later, odds: moved }, {});
    expect(third.meta).toMatchObject({ inserted: 1 });
    expect((await counts(db)).offers).toBe(first + 1);
  });

  it('writes consensus game lines onto games', async () => {
    const res = await ingestOdds(ctx, {});
    expect(res.meta!.gameLines).toBe(5);
    const g = await db.select().from(games).where(eq(games.date, '2026-11-17'));
    for (const row of g) {
      expect(typeof row.spread).toBe('number');
      expect(row.total).toBeGreaterThan(180);
    }
  });

  it('--closing pulls only games tipping within 45 minutes and flags their offers', async () => {
    await ingestOdds(ctx, {});
    // TOR–NY tips 2026-11-18T00:30Z; 30 minutes before.
    const closingCtx = { ...ctx, now: new Date('2026-11-18T00:00:00Z') };
    const res = await ingestOdds(closingCtx, { closing: true });
    expect(res.meta).toMatchObject({ games: 1, closing: true, inserted: 0 });
    const current = await db.select().from(propCurrent).where(eq(propCurrent.gameId, 'g401910002'));
    expect(current.length).toBeGreaterThan(0);
    expect(current.every((r) => r.isClosing)).toBe(true);
    expect(res.meta!.closingMarked).toBe(current.length);
    const other = await db.select().from(propCurrent).where(eq(propCurrent.gameId, 'g401910003'));
    expect(other.every((r) => !r.isClosing)).toBe(true);

    // A changed closing price is inserted with is_closing already set.
    let changed = false;
    const moved = mapOffers(ctx.odds, (offers) =>
      offers.map((o) => {
        if (changed) return o;
        changed = true;
        return { ...o, line: o.line + 1 };
      }),
    );
    const res2 = await ingestOdds(
      { ...closingCtx, now: new Date('2026-11-18T00:10:00Z'), odds: moved },
      { closing: true },
    );
    expect(res2.meta).toMatchObject({ inserted: 1 });
    const newest = await db
      .select()
      .from(propOffers)
      .where(eq(propOffers.capturedAt, new Date('2026-11-18T00:10:00Z')));
    expect(newest).toHaveLength(1);
    expect(newest[0]!.isClosing).toBe(true);
  });

  it('does nothing when no games are scheduled', async () => {
    const res = await ingestOdds(ctx, { date: '2026-12-25' });
    expect(res).toEqual({ units: 0, meta: { date: '2026-12-25', closing: false, games: 0 } });
  });
});
