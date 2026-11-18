// Server-only database singleton. Never import this from a client component.
import { createDb, runMigrations, type Db } from '@blueline/db';

const g = globalThis as unknown as { __bluelineDb?: Promise<Db> };

/**
 * The shared Db. Survives Next dev hot reloads (stored on globalThis). PGlite URLs
 * (the dev default) are migrated once on first use; Postgres URLs are migrated by CI.
 */
export function getDb(): Promise<Db> {
  g.__bluelineDb ??= (async () => {
    const url = process.env.DATABASE_URL ?? 'pglite:./.data/pglite';
    const db = createDb(url);
    if (url.startsWith('pglite:')) await runMigrations(db);
    return db;
  })();
  return g.__bluelineDb;
}
