import { PGlite } from '@electric-sql/pglite';
import { adminFromPglite, type AdminSql } from './admin';
import { dbFromPglite, runMigrations, type Db } from './client';

// Migrating a fresh PGlite takes ~1.3s, so each test worker migrates one
// template instance once and every createTestDb() gets a clone of it.
let template: Promise<PGlite> | undefined;

function migratedTemplate(): Promise<PGlite> {
  template ??= (async () => {
    const client = new PGlite();
    await runMigrations(dbFromPglite(client));
    return client;
  })();
  return template;
}

/**
 * A fresh, isolated in-memory PGlite database with all migrations applied.
 * Close it with closeDb() when done.
 */
export async function createTestDb(): Promise<Db> {
  const clone = await (await migratedTemplate()).clone();
  return dbFromPglite(clone as PGlite);
}

/** Like createTestDb(), plus a raw-SQL admin handle on the same instance (roles, grants). */
export async function createTestDbWithAdmin(): Promise<{ db: Db; admin: AdminSql }> {
  const clone = (await (await migratedTemplate()).clone()) as PGlite;
  return { db: dbFromPglite(clone), admin: adminFromPglite(clone) };
}
