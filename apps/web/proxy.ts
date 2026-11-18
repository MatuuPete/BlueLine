// Next 16 renamed the `middleware` file convention to `proxy` (middleware.ts is deprecated);
// proxy.ts runs on the Node.js runtime before every matched request.
//
// 1. Gating (spec §8): no session -> pages redirect to /signin, /api/* answers 401.
// 2. CSP: a fresh nonce per request (see lib/gate.ts).
// The dev bypass (AUTH_DEV_BYPASS=1, never in production) skips the session check.
import NextAuth from 'next-auth';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { authConfig } from './auth.config';
import { isDevBypass } from './lib/dev-bypass';
import { gate } from './lib/gate';

// JWT-only Auth.js instance (no database): verifies and refreshes the session cookie.
const { auth } = NextAuth(authConfig);

const isDev = () => process.env.NODE_ENV === 'development';

const withSession = auth((req) =>
  gate(req, { signedIn: typeof req.auth?.user?.id === 'string', dev: isDev() }),
);

export async function proxy(req: NextRequest, ev: NextFetchEvent) {
  if (isDevBypass()) return gate(req, { signedIn: true, dev: isDev() });
  return withSession(req, ev as never);
}

export const config = {
  // Everything except Next's build assets. Prefetches are NOT skipped: they would render
  // protected pages without the session check.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
