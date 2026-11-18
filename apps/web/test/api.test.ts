import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL = 'pglite:';

let currentUser: string | null = null;
vi.mock('../lib/session', () => ({ getUserId: async () => currentUser }));

const { getDb } = await import('../lib/db');
const { games, players, teams, users } = await import('@blueline/db');
const { foreignKeyFields } = await import('../lib/api');
const health = await import('../app/api/health/route');
const board = await import('../app/api/board/route');
const slips = await import('../app/api/slips/route');
const slipById = await import('../app/api/slips/[id]/route');
const presets = await import('../app/api/presets/route');
const favorites = await import('../app/api/favorites/route');
const settings = await import('../app/api/settings/route');
const status = await import('../app/api/status/route');
const gamesRoute = await import('../app/api/games/route');
const detail = await import('../app/api/props/[playerId]/[market]/route');

const post = (url: string, body: unknown, method = 'POST') =>
  new Request(`http://t${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const get = (url: string) => new Request(`http://t${url}`);
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

const slipBody = {
  name: 'Tonight',
  legs: [{ gameId: 'g1', playerId: 'p1', market: 'PTS', side: 'over', line: 26.5, price: -115 }],
};

beforeAll(async () => {
  const db = await getDb();
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

beforeEach(() => {
  currentUser = 'userA';
});

describe('auth', () => {
  it('health is public', async () => {
    currentUser = null;
    const res = health.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('every other route answers 401 without a session', async () => {
    currentUser = null;
    const calls: Promise<Response>[] = [
      board.GET(get('/api/board')),
      slips.GET(),
      slips.POST(post('/api/slips', slipBody)),
      slipById.GET(get('/api/slips/x'), idCtx('x')),
      slipById.DELETE(get('/api/slips/x'), idCtx('x')),
      presets.GET(),
      favorites.GET(),
      settings.GET(),
      status.GET(),
      gamesRoute.GET(get('/api/games')),
      detail.GET(get('/api/props/p1/PTS'), {
        params: Promise.resolve({ playerId: 'p1', market: 'PTS' }),
      }),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });
});

describe('input validation', () => {
  it('board: invalid known value is 400 with field errors; unknown keys are ignored', async () => {
    const bad = await board.GET(get('/api/board?minHitRate=999'));
    expect(bad.status).toBe(400);
    expect((await bad.json()).fields).toHaveProperty('minHitRate');
    // unknown key stripped, so it reaches queryBoard (placeholder throws, mapped to 500 not 400)
    const ok = await board.GET(get('/api/board?utm_source=x'));
    expect(ok.status).not.toBe(400);
  });

  it('slips: bad body is 400 with field errors, wrong content type 415', async () => {
    const res = await slips.POST(post('/api/slips', { name: '', legs: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_request');
    expect(Object.keys(body.fields)).toEqual(expect.arrayContaining(['name', 'legs']));
    const unknownKey = await slips.POST(post('/api/slips', { ...slipBody, userId: 'userB' }));
    expect(unknownKey.status).toBe(400);
    const wrongType = await slips.POST(
      new Request('http://t/api/slips', { method: 'POST', body: '{}' }),
    );
    expect(wrongType.status).toBe(415);
  });

  it('slips: unknown game is a 400, not a 500', async () => {
    const res = await slips.POST(
      post('/api/slips', { ...slipBody, legs: [{ ...slipBody.legs[0], gameId: 'nope' }] }),
    );
    expect(res.status).toBe(400);
  });

  it('props detail: bad market is 400, unknown player is 404', async () => {
    const bad = await detail.GET(get('/api/props/p1/XYZ'), {
      params: Promise.resolve({ playerId: 'p1', market: 'XYZ' }),
    });
    expect(bad.status).toBe(400);
    const missing = await detail.GET(get('/api/props/zzz/PTS'), {
      params: Promise.resolve({ playerId: 'zzz', market: 'PTS' }),
    });
    expect(missing.status).toBe(404);
  });

  it('games: bad date is 400; a valid date lists games', async () => {
    expect((await gamesRoute.GET(get('/api/games?date=nope'))).status).toBe(400);
    const res = await gamesRoute.GET(get('/api/games?date=2026-11-18'));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });

  it('favorites: unknown player is a 400, not a 500', async () => {
    const res = await favorites.POST(
      post('/api/favorites', { playerId: 'ghost', market: 'PTS', side: 'over' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).fields).toHaveProperty('playerId');
  });

  it('bodies over 64KB are 413 (declared and actual bytes)', async () => {
    const big = 'x'.repeat(70_000);
    const res = await settings.PUT(post('/api/settings', { theme: big }, 'PUT'));
    expect(res.status).toBe(413);
    const multibyte = await settings.PUT(
      post('/api/settings', { theme: 'é'.repeat(40_000) }, 'PUT'),
    );
    expect(multibyte.status).toBe(413);
  });

  it('content-length over the limit is 413 before the body is read', async () => {
    const req = new Request('http://t/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'content-length': '70000' },
      body: '{}',
    });
    expect((await settings.PUT(req)).status).toBe(413);
  });

  it('presets: malformed id is 400', async () => {
    expect((await presets.DELETE(get('/api/presets?id=junk'))).status).toBe(400);
    expect((await presets.DELETE(get('/api/presets'))).status).toBe(400);
  });

  it('settings: defaults on GET, validated PUT', async () => {
    expect(await (await settings.GET()).json()).toMatchObject({ theme: 'system' });
    expect((await settings.PUT(post('/api/settings', { theme: 'neon' }, 'PUT'))).status).toBe(400);
    const ok = await settings.PUT(post('/api/settings', { theme: 'dark' }, 'PUT'));
    expect((await ok.json()).theme).toBe('dark');
  });
});

describe('IDOR: user B cannot see or change user A data', () => {
  it('slip read and delete answer 404 for the other user', async () => {
    const created = await slips.POST(post('/api/slips', slipBody));
    expect(created.status).toBe(201);
    const { id } = await created.json();

    currentUser = 'userB';
    expect((await slipById.GET(get(`/api/slips/${id}`), idCtx(id))).status).toBe(404);
    expect((await slipById.DELETE(get(`/api/slips/${id}`), idCtx(id))).status).toBe(404);
    expect(await (await slips.GET()).json()).toEqual([]);

    currentUser = 'userA';
    expect((await slipById.GET(get(`/api/slips/${id}`), idCtx(id))).status).toBe(200);
    expect((await slipById.DELETE(get(`/api/slips/${id}`), idCtx(id))).status).toBe(200);
    expect((await slipById.GET(get(`/api/slips/${id}`), idCtx(id))).status).toBe(404);
  });

  it('preset delete answers 404 for the other user; favorites are per user', async () => {
    const saved = await presets.POST(
      post('/api/presets', { name: 'Hot', filter: { minHitRate: 70 } }),
    );
    expect(saved.status).toBe(201);
    const { id } = await saved.json();
    await favorites.POST(post('/api/favorites', { playerId: 'p1', market: 'PTS', side: 'over' }));

    currentUser = 'userB';
    expect(
      (await presets.DELETE(new Request(`http://t/api/presets?id=${id}`, { method: 'DELETE' })))
        .status,
    ).toBe(404);
    expect(await (await presets.GET()).json()).toEqual([]);
    expect(await (await favorites.GET()).json()).toEqual([]);

    currentUser = 'userA';
    expect(await (await presets.GET()).json()).toHaveLength(1);
    expect(
      (await presets.DELETE(new Request(`http://t/api/presets?id=${id}`, { method: 'DELETE' })))
        .status,
    ).toBe(200);
  });
});

describe('foreignKeyFields', () => {
  it('detects code 23503 on the error, on cause, and on cause.cause', () => {
    expect(foreignKeyFields({ code: '23503' })).toEqual({ _: expect.any(Array) });
    expect(foreignKeyFields({ cause: { code: '23503' } })).toEqual({ _: expect.any(Array) });
    expect(foreignKeyFields({ cause: { cause: { code: '23503' } } })).not.toBeNull();
  });

  it('names the failing column from the constraint', () => {
    expect(
      foreignKeyFields({
        cause: { code: '23503', constraint: 'favorites_player_id_players_id_fk' },
      }),
    ).toEqual({ playerId: ['unknown player'] });
    expect(
      foreignKeyFields({ cause: { code: '23503', constraint: 'slip_legs_game_id_games_id_fk' } }),
    ).toEqual({ gameId: ['unknown game'] });
  });

  it('returns null for other errors', () => {
    expect(foreignKeyFields(new Error('boom'))).toBeNull();
    expect(foreignKeyFields({ cause: { code: '23505' } })).toBeNull();
  });
});

describe('status', () => {
  it('returns jobs, budget and row counts', async () => {
    const body = await (await status.GET()).json();
    expect(body).toMatchObject({ jobs: [], budget: { limit: 2500 }, rowCounts: { teams: 2 } });
  });
});
