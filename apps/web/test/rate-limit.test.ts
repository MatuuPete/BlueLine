import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clientIp,
  createMemoryLimiter,
  createUpstashLimiter,
  RATE_LIMIT,
  rateLimitResponse,
} from '../lib/rate-limit';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('in-memory token bucket', () => {
  it('allows 60 requests per minute, then answers with a retry delay', async () => {
    const limiter = createMemoryLimiter();
    for (let i = 0; i < RATE_LIMIT.capacity; i++) {
      expect((await limiter.take('u1')).ok).toBe(true);
    }
    const denied = await limiter.take('u1');
    expect(denied).toEqual({ ok: false, retryAfter: 1 });
  });

  it('refills one token per second', async () => {
    const limiter = createMemoryLimiter();
    for (let i = 0; i < 60; i++) await limiter.take('u1');
    expect((await limiter.take('u1')).ok).toBe(false);
    vi.advanceTimersByTime(999);
    expect((await limiter.take('u1')).ok).toBe(false);
    vi.advanceTimersByTime(1);
    expect((await limiter.take('u1')).ok).toBe(true);
    expect((await limiter.take('u1')).ok).toBe(false);
    vi.advanceTimersByTime(60_000);
    for (let i = 0; i < 60; i++) expect((await limiter.take('u1')).ok).toBe(true);
    expect((await limiter.take('u1')).ok).toBe(false);
  });

  it('keeps a separate bucket per key', async () => {
    const limiter = createMemoryLimiter();
    for (let i = 0; i < 60; i++) await limiter.take('u1');
    expect((await limiter.take('u1')).ok).toBe(false);
    expect((await limiter.take('u2')).ok).toBe(true);
  });

  it('retryAfter reflects how long until one token is back', async () => {
    const limiter = createMemoryLimiter({ capacity: 2, refillPerMinute: 2 });
    await limiter.take('k');
    await limiter.take('k');
    expect(await limiter.take('k')).toEqual({ ok: false, retryAfter: 30 });
    vi.advanceTimersByTime(10_500);
    expect(await limiter.take('k')).toEqual({ ok: false, retryAfter: 20 });
  });

  it('caps the number of buckets, evicting the least recently used', async () => {
    const limiter = createMemoryLimiter({ maxKeys: 3 });
    await limiter.take('a');
    await limiter.take('b');
    await limiter.take('c');
    await limiter.take('a'); // a is now the most recently used
    await limiter.take('d'); // evicts b
    expect(limiter.size()).toBe(3);
    expect(limiter.keys()).toEqual(['c', 'a', 'd']);
  });

  it('defaults to at most 10k buckets', async () => {
    const limiter = createMemoryLimiter();
    for (let i = 0; i < 10_050; i++) await limiter.take(`k${i}`);
    expect(limiter.size()).toBe(10_000);
    expect(limiter.keys()[0]).toBe('k50');
  });

  it('sweeps idle, fully refilled buckets periodically', async () => {
    const limiter = createMemoryLimiter();
    await limiter.take('a');
    await limiter.take('b');
    expect(limiter.size()).toBe(2);
    vi.advanceTimersByTime(61_000);
    await limiter.take('c');
    expect(limiter.size()).toBe(1);
  });
});

describe('Upstash limiter', () => {
  it('runs one atomic EVAL against the REST endpoint with the bearer token', async () => {
    const fetchMock = vi.fn(async () => Response.json({ result: [1, '59'] }));
    vi.stubGlobal('fetch', fetchMock);
    const limiter = createUpstashLimiter({ url: 'https://example.upstash.io/', token: 'tok' });
    expect(await limiter.take('u1')).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.upstash.io');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok');
    const body = JSON.parse(String(init.body)) as unknown[];
    expect(body[0]).toBe('EVAL');
    expect(body[2]).toBe('1');
    expect(body[3]).toBe('blueline:rl:u1');
    expect(body.slice(4)).toEqual(['60', String(60 / 60_000), String(Date.now())]);
  });

  it('maps a denial to a retry delay', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ result: [0, '0.25'] })),
    );
    const limiter = createUpstashLimiter({ url: 'https://example.upstash.io', token: 'tok' });
    expect(await limiter.take('u1')).toEqual({ ok: false, retryAfter: 1 });
  });

  it('falls back to the in-memory bucket when Upstash is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 503 })),
    );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const limiter = createUpstashLimiter({ url: 'https://example.upstash.io', token: 'tok' });
    for (let i = 0; i < 60; i++) expect((await limiter.take('u1')).ok).toBe(true);
    expect((await limiter.take('u1')).ok).toBe(false);
    expect(errors).toHaveBeenCalledTimes(1); // logged once, not per request
    errors.mockRestore();
  });
});

describe('helpers', () => {
  it('429 response carries Retry-After seconds and a JSON error', async () => {
    const res = rateLimitResponse(7);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('7');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'rate_limited' });
  });

  it('clientIp trusts only x-real-ip (set by Vercel), never the spoofable x-forwarded-for', () => {
    expect(clientIp(new Request('http://t/', { headers: { 'x-real-ip': ' 1.2.3.4 ' } }))).toBe(
      '1.2.3.4',
    );
    expect(
      clientIp(new Request('http://t/', { headers: { 'x-forwarded-for': '5.6.7.8, 10.0.0.1' } })),
    ).toBe('unknown');
    expect(clientIp(new Request('http://t/'))).toBe('unknown');
    expect(clientIp(undefined)).toBe('unknown');
  });
});

describe('authed() integration', () => {
  it('every API route is limited per user: the 61st call in a minute is a 429', async () => {
    vi.resetModules();
    vi.doMock('../lib/session', () => ({ getUserId: async () => 'rl-user' }));
    vi.doMock('../lib/db', () => ({ getDb: async () => ({}) }));
    const { authed } = await import('../lib/api');
    const handler = authed(async () => Response.json({ ok: true }));
    for (let i = 0; i < 60; i++) expect((await handler()).status).toBe(200);
    const limited = await handler();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('1');
    vi.advanceTimersByTime(1000);
    expect((await handler()).status).toBe(200);
    vi.doUnmock('../lib/session');
    vi.doUnmock('../lib/db');
  });

  it('unauthenticated callers are limited by IP and still get 401 under the limit', async () => {
    vi.resetModules();
    vi.doMock('../lib/session', () => ({ getUserId: async () => null }));
    vi.doMock('../lib/db', () => ({ getDb: async () => ({}) }));
    const { authed } = await import('../lib/api');
    const handler = authed(async (_a, _req: Request) => Response.json({ ok: true }));
    const req = () => new Request('http://t/api/x', { headers: { 'x-real-ip': '9.9.9.9' } });
    for (let i = 0; i < 60; i++) expect((await handler(req())).status).toBe(401);
    expect((await handler(req())).status).toBe(429);
    vi.doUnmock('../lib/session');
    vi.doUnmock('../lib/db');
  });
});
