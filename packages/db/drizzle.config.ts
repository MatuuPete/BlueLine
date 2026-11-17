import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` needs no database. DATABASE_URL is only read by
// `drizzle-kit migrate/studio`: a Postgres URL, or `pglite:<dir>` for local PGlite.
const url = process.env.DATABASE_URL ?? '';
const pgliteDir = url.startsWith('pglite:') ? url.slice('pglite:'.length) : null;

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  strict: true,
  verbose: true,
  ...(pgliteDir !== null
    ? { driver: 'pglite' as const, dbCredentials: { url: pgliteDir || 'memory://' } }
    : url
      ? { dbCredentials: { url } }
      : {}),
});
