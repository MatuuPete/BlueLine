// Server-only database singleton. Never import this from a client component.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDb, runMigrations, type Db } from '@blueline/db';
import { DEFAULT_DATABASE_URL, resolveDatabaseUrl } from './db-url';

const g = globalThis as unknown as { __bluelineDb?: Promise<Db> };

/**
 * The shared Db. Survives Next dev hot reloads (stored on globalThis). PGlite URLs
 * (the dev default) resolve against the repo root and are migrated once on first use;
 * Postgres URLs are migrated by CI.
 */
export function getDb(): Promise<Db> {
  g.__bluelineDb ??= (async () => {
    const url = resolveDatabaseUrl(process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL);
    const isPglite = url.startsWith('pglite:');
    const dir = url.slice('pglite:'.length);
    if (isPglite && dir) mkdirSync(dirname(dir), { recursive: true });
    const db = createDb(url);
    if (isPglite) await runMigrations(db);
    return db;
  })();
  return g.__bluelineDb;
}
