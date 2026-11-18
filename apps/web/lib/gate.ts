// The proxy's decision for one request, separated from Auth.js so it can be unit-tested.
import { NextResponse, type NextRequest } from 'next/server';
import { safeCallback } from './safe-callback';
import { buildCsp, createNonce, isPublicPath } from './security';

/**
 * Without a session: protected API routes answer 401 JSON, protected pages redirect to
 * /signin?callbackUrl=<path>. Otherwise the request continues with a fresh CSP nonce:
 * the CSP goes on the response and, with `x-nonce`, on the forwarded request headers
 * (Next reads the nonce from the request CSP to stamp its own scripts; the root layout
 * reads `x-nonce`).
 */
export function gate(req: NextRequest, opts: { signedIn: boolean; dev: boolean }): NextResponse {
  const { pathname, search, origin } = req.nextUrl;

  if (!opts.signedIn && !isPublicPath(pathname)) {
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const signin = new URL('/signin', origin);
    // The request path is client-controlled too (e.g. "//evil.com"): same sanitizer as /signin.
    const callback = safeCallback(`${pathname}${search}`);
    if (callback !== '/') signin.searchParams.set('callbackUrl', callback);
    return NextResponse.redirect(signin);
  }

  const nonce = createNonce();
  const csp = buildCsp(nonce, { dev: opts.dev });
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}
