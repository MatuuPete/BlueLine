// Minimal raw-SQL handle for one-off administration (the `setup:live` command): run
// packages/db/sql/roles.sql and manage login roles. App code uses `Db`, never this.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

export interface AdminSql {
  /** Run one or more statements (simple query protocol, no parameters). */
  exec: (sql: string) => Promise<void>;
  /** Run one parameterised query and return its rows. */
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<T[]>;
  close: () => Promise<void>;
}

/** Absolute path of packages/db/sql/roles.sql. */
export const ROLES_SQL_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'sql',
  'roles.sql',
);

/** The text of roles.sql. */
export function readRolesSql(): string {
  return readFileSync(ROLES_SQL_PATH, 'utf8');
}

/** A single dedicated connection (not a pool), as whoever the URL names. */
export async function connectAdminPg(url: string): Promise<AdminSql> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return {
    exec: async (sql) => {
      await client.query(sql);
    },
    query: async <T extends Record<string, unknown>>(sql: string, params?: unknown[]) =>
      (await client.query(sql, params)).rows as T[],
    close: () => client.end(),
  };
}

/** Wrap a PGlite instance (tests). */
export function adminFromPglite(client: PGlite): AdminSql {
  return {
    exec: async (sql) => {
      await client.exec(sql);
    },
    query: async <T extends Record<string, unknown>>(sql: string, params?: unknown[]) =>
      (await client.query<T>(sql, params)).rows,
    close: () => client.close(),
  };
}
