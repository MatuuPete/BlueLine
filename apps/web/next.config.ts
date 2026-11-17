import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: [
    '@blueline/contracts',
    '@blueline/db',
    '@blueline/analytics',
    '@blueline/adapters',
    '@blueline/ui',
  ],
  // PGlite loads its WASM/data files at runtime; keep it out of the server bundle.
  serverExternalPackages: ['@electric-sql/pglite'],
};

export default nextConfig;
