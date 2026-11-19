// Database half of setup:live: migrations, roles.sql, login roles. Each step is idempotent.
import { readRolesSql, runMigrations, type AdminSql, type Db } from '@blueline/db';
import { ensureLoginRole, WEB_ROLE, WORKER_ROLE, type RoleResult } from './sql';

export interface DbSetupArgs {
  /** Drizzle handle on the owner connection (for migrations). */
  db: Db;
  /** Raw SQL handle on the owner connection (roles.sql, CREATE/ALTER ROLE). */
  admin: AdminSql;
  passwords: { web: string; worker: string };
  log: (msg: string) => void;
}

export interface DbSetupResult {
  web: RoleResult;
  worker: RoleResult;
}

function describe(name: string, r: RoleResult): string {
  if (r.status === 'manual') return `${name}: NOT created (${r.reason.split('\n')[0]})`;
  return `${name}: ${r.status}`;
}

export async function setupDatabase(args: DbSetupArgs): Promise<DbSetupResult> {
  const { db, admin, passwords, log } = args;
  log('Applying migrations (owner)...');
  await runMigrations(db);
  log('  migrations: up to date');
  log('Applying packages/db/sql/roles.sql...');
  await admin.exec(readRolesSql());
  log('  web_role / worker_role grants: applied');
  log('Creating or updating login roles (fresh random passwords)...');
  const web = await ensureLoginRole(admin, WEB_ROLE, passwords.web);
  log(`  ${describe(WEB_ROLE.name, web)}`);
  const worker = await ensureLoginRole(admin, WORKER_ROLE, passwords.worker);
  log(`  ${describe(WORKER_ROLE.name, worker)}`);
  return { web, worker };
}
