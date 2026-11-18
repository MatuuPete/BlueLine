// Security policy (spec §8): CSP, static security headers and the public-route list.
// Pure and dependency-free so next.config.ts, the proxy and tests can all import it.

/** Hosts a sign-in form may redirect to (OAuth authorize endpoints), for `form-action`. */
const OAUTH_FORM_TARGETS = ['https://accounts.google.com', 'https://github.com'];

/** A fresh per-request nonce: base64 of a random UUID. */
export function createNonce(): string {
  return btoa(crypto.randomUUID());
}

/**
 * The Content-Security-Policy for one response. Scripts need the nonce (`'strict-dynamic'`
 * lets those scripts load Next's chunks). Styles allow inline for CSS modules and style
 * attributes. In development React needs `eval` for its debugging features.
 */
export function buildCsp(nonce: string, { dev }: { dev: boolean }): string {
  const script = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(dev ? ["'unsafe-eval'"] : []),
  ];
  return [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    `form-action 'self' ${OAUTH_FORM_TARGETS.join(' ')}`,
  ].join('; ');
}

/** Headers for every response (next.config.ts `headers()`). HSTS only in production. */
export function securityHeaders(production: boolean): { key: string; value: string }[] {
  return [
    ...(production
      ? [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ]
      : []),
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'X-Frame-Options', value: 'DENY' },
  ];
}

const PUBLIC_EXACT = new Set([
  '/signin',
  '/offline',
  '/api/health',
  '/manifest.webmanifest',
  '/manifest.json',
  '/sw.js',
  '/favicon.ico',
  '/robots.txt',
]);
/** Each also covers its sub-paths, e.g. /welcome/enter (sets the seen_intro cookie). */
const PUBLIC_PREFIXES = ['/welcome', '/api/auth', '/_next', '/icons'];
/** App-router metadata icons: /icon, /icon.png, /icon-192.png, /apple-icon.png, … */
const ICON_RE = /^\/(apple-)?icon[\w-]*(\.(png|jpe?g|svg|ico|webp))?$/;
/** A file at the root of public/ (one path segment), e.g. /logo.svg. Never under /api. */
const ROOT_STATIC_RE = /^\/[\w.-]+\.(png|jpe?g|gif|svg|ico|webp|avif|txt|xml|webmanifest|woff2?)$/;

/**
 * Routes reachable without a session (spec §8 and ruling R34): sign-in, the intro and its
 * enter route, the offline page, health, Auth.js, the PWA manifest, service worker and icons.
 */
export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  return ICON_RE.test(pathname) || ROOT_STATIC_RE.test(pathname);
}
