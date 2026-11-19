import { BetInputSchema, type BetInput } from '@blueline/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, users, type Db } from '../src/index';
import {
  BetValidationError,
  betSummary,
  createBet,
  deleteBet,
  getBet,
  listBets,
  updateBet,
} from '../src/queries/bets';
import { createTestDb } from '../src/testing';

let db: Db;

const input = (o: Record<string, unknown> = {}): BetInput =>
  BetInputSchema.parse({
    placedOn: '2026-11-18',
    book: 'Stake',
    description: 'Over 61.5 · 3rd Quarter Total',
    odds: { decimal: 1.8 },
    stake: 365,
    ...o,
  });

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(users).values([
    { id: 'userA', email: 'a@example.com' },
    { id: 'userB', email: 'b@example.com' },
  ]);
});

afterAll(async () => {
  await closeDb(db);
});

describe('create and payout recomputation', () => {
  it('stores a pending bet with null payout', async () => {
    const b = await createBet(db, 'userA', input());
    expect(b).toMatchObject({
      result: 'pending',
      payout: null,
      profit: null,
      stake: 365,
      oddsDecimal: 1.8,
      currency: 'PHP',
      sport: 'NBA',
    });
  });

  it('ignores a client payout for win, loss, push and void', async () => {
    const win = await createBet(db, 'userA', input({ result: 'win', payout: 1 }));
    expect(win.payout).toBe(657);
    expect(win.profit).toBe(292);
    expect((await createBet(db, 'userA', input({ result: 'loss', payout: 999 }))).payout).toBe(0);
    expect((await createBet(db, 'userA', input({ result: 'push', payout: 5 }))).payout).toBe(365);
    expect((await createBet(db, 'userA', input({ result: 'void', payout: 5 }))).payout).toBe(365);
  });

  it('keeps a cash-out amount', async () => {
    const b = await createBet(db, 'userA', input({ result: 'cashout', payout: 400 }));
    expect(b.payout).toBe(400);
    expect(b.profit).toBe(35);
  });

  it('rejects an out-of-range cash-out at the query layer too', async () => {
    const bad = { ...input(), result: 'cashout' as const, payout: 700 };
    await expect(createBet(db, 'userA', bad)).rejects.toBeInstanceOf(BetValidationError);
  });

  it('recomputes payout when result, stake or odds change', async () => {
    const b = await createBet(db, 'userA', input());
    const won = await updateBet(db, 'userA', b.id, { result: 'win' });
    expect(won?.payout).toBe(657);
    const restaked = await updateBet(db, 'userA', b.id, { stake: 100, oddsDecimal: 2.5 });
    expect(restaked).toMatchObject({ stake: 100, oddsDecimal: 2.5, payout: 250, profit: 150 });
    const lost = await updateBet(db, 'userA', b.id, { result: 'loss' });
    expect(lost).toMatchObject({ payout: 0, profit: -100 });
    const back = await updateBet(db, 'userA', b.id, { result: 'pending' });
    expect(back).toMatchObject({ payout: null, profit: null });
    await expect(updateBet(db, 'userA', b.id, { result: 'cashout' })).rejects.toBeInstanceOf(
      BetValidationError,
    );
    const co = await updateBet(db, 'userA', b.id, { result: 'cashout', payout: 40 });
    expect(co?.payout).toBe(40);
    // Cash-out stays valid across an unrelated edit, but a smaller cap is checked.
    expect((await updateBet(db, 'userA', b.id, { notes: 'hi' }))?.payout).toBe(40);
    await expect(updateBet(db, 'userA', b.id, { stake: 10 })).rejects.toBeInstanceOf(
      BetValidationError,
    );
  });

  it('clears optional text with null', async () => {
    const b = await createBet(db, 'userA', input({ notes: 'n', event: 'Heat vs Bucks' }));
    expect(b).toMatchObject({ notes: 'n', event: 'Heat vs Bucks' });
    const u = await updateBet(db, 'userA', b.id, { notes: null, event: null });
    expect(u).toMatchObject({ notes: null, event: null });
  });
});

describe('IDOR', () => {
  it("user B cannot read, update or delete user A's bet", async () => {
    const a = await createBet(db, 'userA', input({ description: 'A private bet' }));
    expect(await getBet(db, 'userB', a.id)).toBeNull();
    expect(await updateBet(db, 'userB', a.id, { result: 'win' })).toBeNull();
    expect(await deleteBet(db, 'userB', a.id)).toBe(false);
    expect((await listBets(db, 'userB')).map((b) => b.id)).not.toContain(a.id);
    const stillA = await getBet(db, 'userA', a.id);
    expect(stillA?.result).toBe('pending');
    expect(stillA?.description).toBe('A private bet');
  });

  it('answers null/false for malformed ids', async () => {
    expect(await getBet(db, 'userA', 'nope')).toBeNull();
    expect(await updateBet(db, 'userA', 'nope', { notes: 'x' })).toBeNull();
    expect(await deleteBet(db, 'userA', 'nope')).toBe(false);
  });

  it('delete removes the owner’s bet', async () => {
    const a = await createBet(db, 'userA', input());
    expect(await deleteBet(db, 'userA', a.id)).toBe(true);
    expect(await getBet(db, 'userA', a.id)).toBeNull();
    expect(await deleteBet(db, 'userA', a.id)).toBe(false);
  });

  it('summaries only count the caller’s bets', async () => {
    const empty = await betSummary(db, 'userB');
    expect(empty).toMatchObject({ settled: 0, net: 0, currency: 'PHP', currencies: [] });
  });
});

describe('list and summary', () => {
  it('filters and orders; summary is per currency', async () => {
    const u = 'userC';
    await db.insert(users).values({ id: u, email: 'c@example.com' });
    await createBet(db, u, input({ placedOn: '2026-11-01', result: 'win' })); // +292
    await createBet(db, u, input({ placedOn: '2026-11-02', result: 'loss', book: 'FanDuel' })); // -365
    await createBet(db, u, input({ placedOn: '2026-12-01', result: 'pending' }));
    await createBet(
      db,
      u,
      input({
        placedOn: '2026-11-03',
        result: 'win',
        currency: 'USD',
        stake: 10,
        odds: { decimal: 2 },
      }),
    );

    const all = await listBets(db, u);
    expect(all.map((b) => b.placedOn)).toEqual([
      '2026-12-01',
      '2026-11-03',
      '2026-11-02',
      '2026-11-01',
    ]);
    expect(await listBets(db, u, { currency: 'USD' })).toHaveLength(1);
    expect(await listBets(db, u, { book: 'fanduel' })).toHaveLength(1);
    expect(await listBets(db, u, { result: 'pending' })).toHaveLength(1);
    expect(await listBets(db, u, { from: '2026-11-02', to: '2026-11-30' })).toHaveLength(2);

    const s = await betSummary(db, u);
    expect(s.currency).toBe('PHP'); // 3 PHP bets vs 1 USD
    expect(s.currencies).toEqual([
      { currency: 'PHP', bets: 3 },
      { currency: 'USD', bets: 1 },
    ]);
    expect(s).toMatchObject({ settled: 2, pending: 1, wins: 1, losses: 1, net: -73 });
    expect(s.staked).toBe(730);

    const usd = await betSummary(db, u, { currency: 'USD' });
    expect(usd).toMatchObject({ currency: 'USD', settled: 1, net: 10, wins: 1 });
    expect(usd.currencies).toHaveLength(2);
    expect((await betSummary(db, u, { from: '2026-11-03', to: '2026-11-03' })).currency).toBe(
      'USD',
    );
  });
});
