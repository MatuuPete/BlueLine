import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL = 'pglite:';

let currentUser: string | null = null;
vi.mock('../lib/session', () => ({ getUserId: async () => currentUser }));

const { getDb } = await import('../lib/db');
const { users } = await import('@blueline/db');
const bets = await import('../app/api/bets/route');
const betById = await import('../app/api/bets/[id]/route');
const summary = await import('../app/api/bets/summary/route');

const send = (url: string, body: unknown, method = 'POST') =>
  new Request(`http://t${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const get = (url: string) => new Request(`http://t${url}`);
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

const body = {
  placedOn: '2026-11-18',
  book: 'Stake',
  event: 'Miami Heat vs Milwaukee Bucks',
  description: 'Over 61.5 · 3rd Quarter Total',
  odds: { decimal: 1.8 },
  stake: 365,
};

beforeAll(async () => {
  const db = await getDb();
  await db.insert(users).values([
    { id: 'userA', email: 'a@example.com' },
    { id: 'userB', email: 'b@example.com' },
  ]);
});

beforeEach(() => {
  currentUser = 'userA';
});

describe('bets API', () => {
  it('answers 401 without a session', async () => {
    currentUser = null;
    const calls = [
      bets.GET(get('/api/bets')),
      bets.POST(send('/api/bets', body)),
      summary.GET(get('/api/bets/summary')),
      betById.GET(get('/api/bets/x'), idCtx('x')),
      betById.PATCH(send('/api/bets/x', { notes: 'x' }, 'PATCH'), idCtx('x')),
      betById.DELETE(get('/api/bets/x'), idCtx('x')),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it('creates, reads, updates, lists and deletes', async () => {
    const created = await bets.POST(send('/api/bets', body));
    expect(created.status).toBe(201);
    expect(created.headers.get('content-type')).toMatch(/application\/json/);
    const bet = await created.json();
    expect(bet).toMatchObject({ result: 'pending', payout: null, stake: 365, oddsDecimal: 1.8 });

    const won = await betById.PATCH(
      send(`/api/bets/${bet.id}`, { result: 'win' }, 'PATCH'),
      idCtx(bet.id),
    );
    expect(won.status).toBe(200);
    expect(await won.json()).toMatchObject({ payout: 657, profit: 292 });

    const one = await betById.GET(get(`/api/bets/${bet.id}`), idCtx(bet.id));
    expect((await one.json()).result).toBe('win');

    const list = await (await bets.GET(get('/api/bets?result=win'))).json();
    expect(list.map((b: { id: string }) => b.id)).toContain(bet.id);

    const sum = await (await summary.GET(get('/api/bets/summary'))).json();
    expect(sum).toMatchObject({ currency: 'PHP', wins: 1, net: 292, staked: 365 });

    const del = await betById.DELETE(get(`/api/bets/${bet.id}`), idCtx(bet.id));
    expect(del.status).toBe(200);
    expect((await betById.GET(get(`/api/bets/${bet.id}`), idCtx(bet.id))).status).toBe(404);
    expect((await betById.DELETE(get(`/api/bets/${bet.id}`), idCtx(bet.id))).status).toBe(404);
  });

  it('accepts American odds and ignores a client payout on a win', async () => {
    const res = await bets.POST(
      send('/api/bets', { ...body, odds: { american: -120 }, result: 'win', payout: 1 }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ oddsDecimal: 1.833, payout: 669.05 });
  });

  it('answers 400 with field errors, 415 for a wrong content type', async () => {
    const bad = await bets.POST(send('/api/bets', { ...body, stake: 0, book: '' }));
    expect(bad.status).toBe(400);
    const j = await bad.json();
    expect(j.error).toBe('invalid_request');
    expect(Object.keys(j.fields)).toEqual(expect.arrayContaining(['stake', 'book']));
    expect((await bets.POST(send('/api/bets', { ...body, userId: 'userB' }))).status).toBe(400);
    expect(
      (await bets.POST(new Request('http://t/api/bets', { method: 'POST', body: '{}' }))).status,
    ).toBe(415);
    const cash = await bets.POST(send('/api/bets', { ...body, result: 'cashout' }));
    expect(cash.status).toBe(400);
    expect(Object.keys((await cash.json()).fields)).toContain('payout');
    expect((await bets.GET(get('/api/bets?from=nope'))).status).toBe(400);
    expect((await summary.GET(get('/api/bets/summary?result=nope'))).status).toBe(400);
  });

  it('PATCH: invalid cash-out against the stored stake is a 400', async () => {
    const bet = await (await bets.POST(send('/api/bets', body))).json();
    const res = await betById.PATCH(
      send(`/api/bets/${bet.id}`, { result: 'cashout', payout: 9999 }, 'PATCH'),
      idCtx(bet.id),
    );
    expect(res.status).toBe(400);
    expect(Object.keys((await res.json()).fields)).toContain('payout');
    expect(
      (await betById.PATCH(send(`/api/bets/${bet.id}`, {}, 'PATCH'), idCtx(bet.id))).status,
    ).toBe(400);
  });

  it("user B gets 404 for user A's bet and never sees it in lists or summaries", async () => {
    const bet = await (await bets.POST(send('/api/bets', { ...body, result: 'win' }))).json();
    currentUser = 'userB';
    expect((await betById.GET(get(`/api/bets/${bet.id}`), idCtx(bet.id))).status).toBe(404);
    expect(
      (await betById.PATCH(send(`/api/bets/${bet.id}`, { result: 'loss' }, 'PATCH'), idCtx(bet.id)))
        .status,
    ).toBe(404);
    expect((await betById.DELETE(get(`/api/bets/${bet.id}`), idCtx(bet.id))).status).toBe(404);
    expect(await (await bets.GET(get('/api/bets'))).json()).toEqual([]);
    expect(await (await summary.GET(get('/api/bets/summary'))).json()).toMatchObject({
      settled: 0,
      net: 0,
    });
    currentUser = 'userA';
    expect(
      (await (await betById.GET(get(`/api/bets/${bet.id}`), idCtx(bet.id))).json()).result,
    ).toBe('win');
  });

  it('enforces money limits with 400 field errors, and accepts the maximum', async () => {
    const big = await bets.POST(send('/api/bets', { ...body, stake: 10_000_001 }));
    expect(big.status).toBe(400);
    expect(Object.keys((await big.json()).fields)).toContain('stake');
    const max = await bets.POST(
      send('/api/bets', { ...body, stake: 10_000_000, odds: { decimal: 1000 }, result: 'win' }),
    );
    expect(max.status).toBe(201);
    expect((await max.json()).payout).toBe(10_000_000_000);

    const huge = await bets.POST(send('/api/bets', { ...body, result: 'cashout', payout: 1e12 }));
    expect(huge.status).toBe(400);
    expect(Object.keys((await huge.json()).fields)).toContain('payout');
    const bet = await (await bets.POST(send('/api/bets', body))).json();
    const patch = await betById.PATCH(
      send('/api/bets/' + bet.id, { result: 'cashout', payout: 1e12 }, 'PATCH'),
      idCtx(bet.id),
    );
    expect(patch.status).toBe(400);
    expect(Object.keys((await patch.json()).fields)).toContain('payout');
    const stakePatch = await betById.PATCH(
      send('/api/bets/' + bet.id, { stake: 1e9 }, 'PATCH'),
      idCtx(bet.id),
    );
    expect(stakePatch.status).toBe(400);
  });

  it('ignores unknown query params but still validates known ones', async () => {
    expect((await bets.GET(get('/api/bets?utm_source=x&_rsc=1'))).status).toBe(200);
    expect((await summary.GET(get('/api/bets/summary?utm_source=x'))).status).toBe(200);
    expect((await bets.GET(get('/api/bets?utm_source=x&from=nope'))).status).toBe(400);
  });
});
