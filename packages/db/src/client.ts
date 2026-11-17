import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import * as schema from './schema';

export type Schema = typeof schema;

/**
 * The common result shape of the PGlite and node-postgres drivers: both return
 * `{ rows }` from `db.execute(sql...)`. A PgQueryResultHKT subtype, so `Db` is
 * still a plain `PgDatabase`; it only makes raw `execute()` results typed.
 */
export interface DbQueryResultHKT extends PgQueryResultHKT {
  type: QueryRows<this['row']>;
}
export interface QueryRows<R> {
  rows: (R extends Record<string, unknown> ? R : Record<string, unknown>)[];
}

export type Db = PgDatabase<DbQueryResultHKT, Schema>;

interface Handle {
  close: () => Promise<void>;
  migrate: (migrationsFolder: string) => Promise<void>;
}

// Driver details stay private; callers only see `Db`.
const handles = new WeakMap<Db, Handle>();

/**
 * Open a database.
 * - `pglite:` → in-memory PGlite; `pglite:<dir>` → on-disk PGlite at <dir> (dev).
 * - Anything else → a `pg` Pool on that Postgres URL (Neon in prod).
 */
export function createDb(url: string): Db {
  if (url.startsWith('pglite:')) {
    const dir = url.slice('pglite:'.length);
    return dbFromPglite(dir ? new PGlite(dir) : new PGlite());
  }
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  const db = drizzlePg({ client: pool, schema });
  handles.set(db, {
    close: () => pool.end(),
    migrate: (migrationsFolder) => migratePg(db, { migrationsFolder }),
  });
  return db;
}

/** Wrap an existing PGlite instance (used by createTestDb to wrap clones). */
export function dbFromPglite(client: PGlite): Db {
  const db = drizzlePglite({ client, schema });
  handles.set(db, {
    close: () => client.close(),
    migrate: (migrationsFolder) => migratePglite(db, { migrationsFolder }),
  });
  return db;
}

/**
 * Absolute path of packages/db/migrations. Built with path.resolve (not
 * `new URL(..., import.meta.url)`, which bundlers treat as an asset import).
 */
export const MIGRATIONS_FOLDER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);

/** Apply all pending migrations from packages/db/migrations. */
export async function runMigrations(db: Db, migrationsFolder = MIGRATIONS_FOLDER): Promise<void> {
  const h = handles.get(db);
  if (!h) throw new Error('runMigrations: db was not created by createDb()');
  await h.migrate(migrationsFolder);
}

/** Close the underlying PGlite instance or pg Pool. Safe to call twice. */
export async function closeDb(db: Db): Promise<void> {
  const h = handles.get(db);
  if (!h) return;
  handles.delete(db);
  await h.close();
}
