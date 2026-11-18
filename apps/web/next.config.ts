import type { NextConfig } from 'next';
import { securityHeaders } from './lib/security';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  poweredByHeader: false,
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: [
    '@blueline/contracts',
    '@blueline/db',
    '@blueline/analytics',
    '@blueline/ui',
  ],
  // PGlite loads its WASM/data files at runtime; keep it out of the server bundle.
  serverExternalPackages: ['@electric-sql/pglite'],
  // Static security headers on every response (spec §8). The CSP is per request (it carries
  // a nonce), so proxy.ts sets it.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders(process.env.NODE_ENV === 'production') }];
  },
};

export default nextConfig;
