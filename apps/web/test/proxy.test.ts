import { NextRequest, type NextFetchEvent } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.AUTH_SECRET ??= 'test-secret-test-secret-test-secret-00';

const { proxy, config } = await import('../proxy');
const { encode } = await import('next-auth/jwt');
const { userIdForEmail } = await import('../lib/auth-rules');

const ev = {} as NextFetchEvent;
// Next always forwards host and proto; Auth.js derives its URL (and cookie names) from them.
const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost:3000${path}`, {
    headers: { host: 'localhost:3000', 'x-forwarded-proto': 'http', ...headers },
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('proxy', () => {
  it('without a session: API 401, pages redirect to /signin', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_DEV_BYPASS', '0');
    const api = (await proxy(req('/api/slips'), ev))!;
    expect(api.status).toBe(401);
    const page = (await proxy(req('/slips'), ev))!;
    expect(page.status).toBe(307);
    expect(page.headers.get('location')).toBe('http://localhost:3000/signin?callbackUrl=%2Fslips');
  });

  it('dev bypass lets requests through outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_DEV_BYPASS', '1');
    const res = (await proxy(req('/api/slips'), ev))!;
    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(res.headers.get('content-security-policy')).toContain("'unsafe-eval'");
  });

  it('dev bypass is ignored in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_DEV_BYPASS', '1');
    const res = (await proxy(req('/api/slips'), ev))!;
    expect(res.status).toBe(401);
  });

  it('a valid session cookie for an allowlisted email passes', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_DEV_BYPASS', '0');
    vi.stubEnv('ALLOWED_EMAILS', 'matt@example.com');
    const uid = userIdForEmail('matt@example.com');
    const token = await encode({
      token: { email: 'matt@example.com', uid },
      secret: process.env.AUTH_SECRET!,
      salt: 'authjs.session-token',
    });
    const res = (await proxy(req('/api/slips', { cookie: `authjs.session-token=${token}` }), ev))!;
    expect(res.headers.get('x-middleware-next')).toBe('1');

    // Same cookie after the email is removed from the allowlist: rejected.
    vi.stubEnv('ALLOWED_EMAILS', 'other@example.com');
    const after = (await proxy(
      req('/api/slips', { cookie: `authjs.session-token=${token}` }),
      ev,
    ))!;
    expect(after.status).toBe(401);
  });

  it('matcher skips Next static assets', () => {
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image|favicon.ico).*)']);
  });
});
