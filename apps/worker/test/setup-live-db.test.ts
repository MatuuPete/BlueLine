import { closeDb, type AdminSql, type Db } from '@blueline/db';
import { createTestDbWithAdmin } from '@blueline/db/testing';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupDatabase } from '../src/setup-live/db-steps';
import { parseEnvText } from '../src/setup-live/envfiles';
import { resolveInputs } from '../src/setup-live/inputs';
import { pullInitialData, pullSteps } from '../src/setup-live/pull';
import { deployPaths, runSetup, type SetupDeps } from '../src/setup-live/run';
import { makeCtx, NOON } from './helpers';

const OWNER =
  'postgresql://neondb_owner:npg_secret@ep-cool-sky-123456.us-east-2.aws.neon.tech/neondb';

let db: Db;
let admin: AdminSql;
let root: string;
const logs: string[] = [];
const log = (m: string) => logs.push(m);

beforeEach(async () => {
  ({ db, admin } = await createTestDbWithAdmin());
  root = mkdtempSync(join(tmpdir(), 'blueline-setup-'));
  logs.length = 0;
});
afterEach(async () => {
  await closeDb(db);
  rmSync(root, { recursive: true, force: true });
});

async function memberships(): Promise<string[]> {
  const rows = await admin.query<{ m: string }>(
    `SELECT m.rolname || '>' || g.rolname AS m
       FROM pg_auth_members am
       JOIN pg_roles m ON m.oid = am.member
       JOIN pg_roles g ON g.oid = am.roleid
      WHERE m.rolname IN ('blueline_web', 'blueline_worker')
      ORDER BY 1`,
  );
  return rows.map((r) => r.m);
}

describe('setupDatabase', () => {
  it('migrates, applies roles.sql and creates both login roles; twice is fine', async () => {
    for (let i = 0; i < 2; i++) {
      const res = await setupDatabase({
        db,
        admin,
        passwords: { web: `web-pass-${i}`, worker: `worker-pass-${i}` },
        log,
      });
      expect(res.web.status).toBe(i === 0 ? 'created' : 'updated');
      expect(res.worker.status).toBe(i === 0 ? 'created' : 'updated');
    }
    expect(await memberships()).toEqual(['blueline_web>web_role', 'blueline_worker>worker_role']);
    const logins = await admin.query<{ rolname: string; rolcanlogin: boolean }>(
      `SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname LIKE 'blueline\\_%' ORDER BY 1`,
    );
    expect(logins).toEqual([
      { rolname: 'blueline_web', rolcanlogin: true },
      { rolname: 'blueline_worker', rolcanlogin: true },
    ]);
    expect(logs.join('\n')).not.toMatch(/pass-/);
  });

  it('hands back the manual SQL when roles cannot be created', async () => {
    const denied: AdminSql = {
      ...admin,
      exec: async (sql) => {
        if (/CREATE ROLE "blueline_/.test(sql)) {
          throw Object.assign(new Error('permission denied to create role'), { code: '42501' });
        }
        return admin.exec(sql);
      },
    };
    const res = await setupDatabase({
      db,
      admin: denied,
      passwords: { web: 'pw1', worker: 'pw2' },
      log,
    });
    expect(res.web).toMatchObject({
      status: 'manual',
      sql: `CREATE ROLE "blueline_web" LOGIN PASSWORD 'pw1' IN ROLE "web_role";`,
    });
    expect(res.worker.status).toBe('manual');
  });
});

describe('pullInitialData', () => {
  it('runs the fixture providers through the real jobs and reports row counts', async () => {
    const ctx = await makeCtx({ db, log });
    expect(pullSteps(NOON).map((s) => s.job)).toEqual([
      'ingest:schedule',
      'ingest:boxscores',
      'ingest:injuries',
      'ingest:odds',
      'ingest:odds',
      'precompute',
    ]);
    const report = await pullInitialData(ctx);
    expect(report.steps.filter((s) => !s.ok)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.counts.teams).toBe(30);
    expect(report.counts.games).toBeGreaterThan(0);
    expect(report.counts.prop_offers).toBeGreaterThan(0);
    expect(report.counts.prop_metrics).toBeGreaterThan(0);
  });
});

describe('runSetup', () => {
  function deps(over: Partial<SetupDeps> = {}): SetupDeps {
    return {
      log,
      rootDir: root,
      connectOwner: async () => ({ db, admin, close: async () => {} }),
      openWorker: async () => ({ ctx: await makeCtx({ db, log }), close: async () => {} }),
      ...over,
    };
  }
  const inputs = () =>
    resolveInputs({
      ownerUrl: OWNER,
      sgoApiKey: 'sgo-key',
      allowedEmails: 'me@example.com',
    });

  it('writes both files, pulls data, and a re-run reuses AUTH_SECRET/BACKUP_PASSPHRASE', async () => {
    const paths = deployPaths(root);
    const first = await runSetup(await inputs(), {}, deps());
    expect(first.exitCode).toBe(0);
    expect(first.pull?.counts.games).toBeGreaterThan(0);
    const v1 = parseEnvText(readFileSync(paths.vercelEnv, 'utf8'));
    const g1 = parseEnvText(readFileSync(paths.githubSecrets, 'utf8'));
    expect(new URL(v1.DATABASE_URL!).username).toBe('blueline_web');
    expect(new URL(v1.DATABASE_URL!).hostname).toContain('-pooler');
    expect(new URL(g1.DATABASE_URL!).username).toBe('blueline_worker');
    expect(new URL(g1.DATABASE_URL!).hostname).not.toContain('-pooler');
    expect(g1.DATABASE_URL_OWNER).toContain('neondb_owner');
    expect(Buffer.from(v1.AUTH_SECRET!, 'base64')).toHaveLength(32);
    expect(g1.BACKUP_PASSPHRASE!.length).toBeGreaterThanOrEqual(32);
    const printed = logs.join('\n');
    for (const secret of [v1.AUTH_SECRET!, g1.BACKUP_PASSPHRASE!, 'sgo-key', 'npg_secret']) {
      expect(printed).not.toContain(secret);
    }

    const second = await runSetup(await inputs(), {}, deps());
    expect(second.reused).toEqual({ authSecret: true, backupPassphrase: true });
    const v2 = parseEnvText(readFileSync(paths.vercelEnv, 'utf8'));
    const g2 = parseEnvText(readFileSync(paths.githubSecrets, 'utf8'));
    expect(v2.AUTH_SECRET).toBe(v1.AUTH_SECRET);
    expect(g2.BACKUP_PASSPHRASE).toBe(g1.BACKUP_PASSPHRASE);

    const rotated = await runSetup(await inputs(), { rotate: true, skipPull: true }, deps());
    expect(rotated.reused).toEqual({ authSecret: false, backupPassphrase: false });
    expect(parseEnvText(readFileSync(paths.vercelEnv, 'utf8')).AUTH_SECRET).not.toBe(
      v1.AUTH_SECRET,
    );
  });

  it('keeps the credential files when the data pull cannot start', async () => {
    const out = await runSetup(
      await inputs(),
      {},
      deps({
        openWorker: async () => {
          throw new Error('connection refused');
        },
      }),
    );
    expect(out.exitCode).toBe(2);
    const g = parseEnvText(readFileSync(deployPaths(root).githubSecrets, 'utf8'));
    expect(g.DATABASE_URL).toContain('blueline_worker');
  });

  it('reports a failing provider step without losing the others', async () => {
    const out = await runSetup(
      await inputs(),
      {},
      deps({
        openWorker: async () => {
          const ctx = await makeCtx({ db, log });
          ctx.odds = {
            ...ctx.odds,
            getPlayerProps: async () => {
              throw new Error('SGO 500');
            },
          } as typeof ctx.odds;
          return { ctx, close: async () => {} };
        },
      }),
    );
    expect(out.exitCode).toBe(2);
    expect(out.pull?.steps.some((s) => !s.ok && /SGO 500/.test(s.error ?? ''))).toBe(true);
    expect(out.pull?.counts.games).toBeGreaterThan(0);
  });

  it('writes manual SQL and exits 2 when CREATE ROLE is not permitted', async () => {
    const denied: AdminSql = {
      ...admin,
      exec: async (sql) => {
        if (/CREATE ROLE "blueline_/.test(sql)) {
          throw Object.assign(new Error('permission denied to create role'), { code: '42501' });
        }
        return admin.exec(sql);
      },
    };
    const out = await runSetup(
      await inputs(),
      {},
      deps({ connectOwner: async () => ({ db, admin: denied, close: async () => {} }) }),
    );
    expect(out.exitCode).toBe(2);
    expect(out.manualRoles).toBe(true);
    expect(readFileSync(deployPaths(root).manualRoles, 'utf8')).toContain(
      'CREATE ROLE "blueline_web"',
    );
    expect(logs.join('\n')).toContain('CREATE ROLE "blueline_web"');
    expect(logs.join('\n')).not.toMatch(/PASSWORD '[A-Za-z0-9_-]{30,}'/);
  });
});
