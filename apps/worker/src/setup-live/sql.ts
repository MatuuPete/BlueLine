// Safe SQL building for statements Postgres cannot parameterise (CREATE/ALTER ROLE).
import type { AdminSql } from '@blueline/db';
import { randomBytes } from 'node:crypto';

/** "name" with embedded double quotes doubled. */
export function quoteIdent(name: string): string {
  if (name.length === 0 || name.includes('\0')) throw new Error('invalid SQL identifier');
  return `"${name.replaceAll('"', '""')}"`;
}

/** 'text' with quotes doubled; E'' form (backslashes doubled) when a backslash is present. */
export function quoteLiteral(value: string): string {
  if (value.includes('\0')) throw new Error('invalid SQL literal');
  const q = value.replaceAll("'", "''");
  return value.includes('\\') ? `E'${q.replaceAll('\\', '\\\\')}'` : `'${q}'`;
}

/** base64url of 32 random bytes: 43 characters, nothing that needs escaping in a URL. */
export function randomPassword(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export interface RoleSpec {
  name: string;
  group: string;
}
export const WEB_ROLE: RoleSpec = { name: 'blueline_web', group: 'web_role' };
export const WORKER_ROLE: RoleSpec = { name: 'blueline_worker', group: 'worker_role' };

/** The statement(s) that create or update one login role. */
export function loginRoleSql(spec: RoleSpec, password: string, exists: boolean): string {
  const role = quoteIdent(spec.name);
  const group = quoteIdent(spec.group);
  const pw = quoteLiteral(password);
  return exists
    ? `ALTER ROLE ${role} WITH LOGIN PASSWORD ${pw};\nGRANT ${group} TO ${role};`
    : `CREATE ROLE ${role} LOGIN PASSWORD ${pw} IN ROLE ${group};`;
}

export type RoleResult =
  { status: 'created' | 'updated' } | { status: 'manual'; sql: string; reason: string };

/**
 * Create the login role, or ALTER it (fresh password, membership re-granted) if it exists.
 * When Postgres refuses (insufficient privilege) the exact manual SQL is returned instead.
 */
export async function ensureLoginRole(
  admin: AdminSql,
  spec: RoleSpec,
  password: string,
): Promise<RoleResult> {
  const found = await admin.query('SELECT 1 AS one FROM pg_roles WHERE rolname = $1', [spec.name]);
  const exists = found.length > 0;
  const sql = loginRoleSql(spec, password, exists);
  try {
    await admin.exec(sql);
    return { status: exists ? 'updated' : 'created' };
  } catch (err) {
    const code = (err as { code?: string }).code;
    const msg = err instanceof Error ? err.message : String(err);
    if (code === '42501' || /permission denied|must have (createrole|admin)/i.test(msg)) {
      return { status: 'manual', sql, reason: msg };
    }
    throw err;
  }
}

/** The SQL with the password literal masked, for printing. */
export function maskPassword(sql: string, password: string): string {
  return sql.split(quoteLiteral(password)).join("'<password: see deploy/manual-roles.sql>'");
}
