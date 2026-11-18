import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { buildCsp, createNonce, isPublicPath, securityHeaders } from '../lib/security';
import { gate } from '../lib/gate';

const directives = (csp: string) =>
  Object.fromEntries(
    csp
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...rest] = d.split(/\s+/);
        return [name, rest.join(' ')];
      }),
  );

describe('nonce', () => {
  it('is base64 of a random UUID and differs per call', () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, 'base64').toString()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('buildCsp', () => {
  it('production policy', () => {
    const d = directives(buildCsp('abc', { dev: false }));
    expect(d['default-src']).toBe("'self'");
    expect(d['script-src']).toBe("'self' 'nonce-abc' 'strict-dynamic'");
    expect(d['style-src']).toBe("'self' 'unsafe-inline'");
    expect(d['img-src']).toBe("'self' data: blob:");
    expect(d['font-src']).toBe("'self'");
    expect(d['connect-src']).toBe("'self'");
    expect(d['frame-ancestors']).toBe("'none'");
    expect(d['base-uri']).toBe("'self'");
    expect(d['object-src']).toBe("'none'");
    expect(d['worker-src']).toBe("'self'");
    expect(d['manifest-src']).toBe("'self'");
    expect(d['form-action']).toBe("'self' https://accounts.google.com https://github.com");
  });

  it("development adds 'unsafe-eval' to script-src only", () => {
    const csp = buildCsp('abc', { dev: true });
    expect(directives(csp)['script-src']).toBe("'self' 'nonce-abc' 'strict-dynamic' 'unsafe-eval'");
    expect(csp.match(/unsafe-eval/g)).toHaveLength(1);
  });
});

describe('isPublicPath', () => {
  it.each([
    '/signin',
    '/welcome',
    '/welcome/enter',
    '/offline',
    '/api/health',
    '/api/auth/signin',
    '/api/auth/callback/google',
    '/_next/static/chunks/main.js',
    '/manifest.webmanifest',
    '/sw.js',
    '/favicon.ico',
    '/icon.png',
    '/icons/icon-192.png',
    '/icon.svg',
    '/apple-icon.png',
    '/icon1.png',
    '/icon-192.png',
    '/icon-512x512.png',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
    '/robots.txt',
  ])('%s is public', (p) => expect(isPublicPath(p)).toBe(true));

  it.each([
    '/',
    '/board',
    '/props/p1/PTS',
    '/slips',
    '/signin-evil',
    '/welcomex',
    '/offlinex',
    '/api/board',
    '/api/healthz',
    '/api/authx',
    '/api/slips/x.png',
    '/api/board.js',
    '/iconography',
    '/icon',
    '/icon-evil',
    '/icon.svg/x',
    '/icon.html',
    '/apple-iconx.png',
  ])('%s is protected', (p) => expect(isPublicPath(p)).toBe(false));
});

describe('securityHeaders', () => {
  const asMap = (prod: boolean) =>
    Object.fromEntries(securityHeaders(prod).map((h) => [h.key.toLowerCase(), h.value]));

  it('sets the baseline headers', () => {
    const h = asMap(false);
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['strict-transport-security']).toBeUndefined();
  });

  it('adds HSTS only in production', () => {
    expect(asMap(true)['strict-transport-security']).toBe('max-age=63072000; includeSubDomains');
  });
});

describe('gate', () => {
  const req = (path: string) => new NextRequest(`https://blueline.test${path}`);
  const forwarded = (res: Response, name: string) =>
    res.headers.get(`x-middleware-request-${name}`);

  it('signed-in page request passes through with the CSP header and the x-nonce request header', () => {
    const res = gate(req('/board'), { signedIn: true, dev: false });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
    const csp = res.headers.get('content-security-policy')!;
    const nonce = forwarded(res, 'x-nonce')!;
    expect(nonce).toBeTruthy();
    expect(csp).toContain(`'nonce-${nonce}'`);
    // Next reads the nonce from the request CSP header to stamp its own scripts.
    expect(forwarded(res, 'content-security-policy')).toBe(csp);
  });

  it('a client-sent x-nonce is overwritten', () => {
    const r = new NextRequest('https://blueline.test/board', { headers: { 'x-nonce': 'evil' } });
    const res = gate(r, { signedIn: true, dev: false });
    expect(forwarded(res, 'x-nonce')).not.toBe('evil');
  });

  it('each request gets a fresh nonce', () => {
    const a = forwarded(gate(req('/'), { signedIn: true, dev: false }), 'x-nonce');
    const b = forwarded(gate(req('/'), { signedIn: true, dev: false }), 'x-nonce');
    expect(a).not.toBe(b);
  });

  it('a protocol-relative request path never becomes a callbackUrl', () => {
    const res = gate(req('//evil.com/x'), { signedIn: false, dev: false });
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin).toBe('https://blueline.test');
    expect(loc.searchParams.get('callbackUrl')).toBeNull();
  });

  it('unauthenticated page request redirects to /signin with a relative callbackUrl', () => {
    const res = gate(req('/props/p1/PTS?window=l10'), { signedIn: false, dev: false });
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin).toBe('https://blueline.test');
    expect(loc.pathname).toBe('/signin');
    expect(loc.searchParams.get('callbackUrl')).toBe('/props/p1/PTS?window=l10');
  });

  it('the bare root redirects without a callbackUrl', () => {
    const res = gate(req('/'), { signedIn: false, dev: false });
    expect(res.headers.get('location')).toBe('https://blueline.test/signin');
  });

  it('unauthenticated API request is a 401 JSON, not a redirect', async () => {
    const res = gate(req('/api/board'), { signedIn: false, dev: false });
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('public routes pass through without a session', () => {
    for (const p of ['/signin', '/welcome', '/api/health', '/api/auth/session']) {
      const res = gate(req(p), { signedIn: false, dev: false });
      expect(res.headers.get('x-middleware-next')).toBe('1');
      expect(res.headers.get('content-security-policy')).toContain("'strict-dynamic'");
    }
  });
});
