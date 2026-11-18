import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbFromPglite, runMigrations } from '../src/client';

const rolesSql = readFileSync(fileURLToPath(new URL('../sql/roles.sql', import.meta.url)), 'utf8');

let pg: PGlite;

/** Run `stmt` as `role` and report whether Postgres allowed it. */
async function allowed(role: string, stmt: string): Promise<boolean> {
  await pg.exec(`SET ROLE ${role}`);
  try {
    await pg.exec(stmt);
    return true;
  } catch (err) {
    if (/permission denied/i.test(String(err))) return false;
    throw err;
  } finally {
    await pg.exec('RESET ROLE');
  }
}

beforeAll(async () => {
  pg = new PGlite();
  await runMigrations(dbFromPglite(pg));
  await pg.exec(rolesSql);
  await pg.exec(rolesSql); // idempotent
  await pg.exec(`
      INSERT INTO teams (id, abbr, name) VALUES ('bos', 'BOS', 'Boston'), ('nyk', 'NYK', 'New York');
      INSERT INTO players (id, name, team_id, position) VALUES ('p1', 'P One', 'bos', 'F');
      INSERT INTO games (id, season, date, tip_at, home_team_id, away_team_id)
        VALUES ('g1', 2026, '2026-11-18', now(), 'bos', 'nyk');
      INSERT INTO users (id, email) VALUES ('u1', 'u1@example.com');
      INSERT INTO slips (id, user_id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'u1', 's');
      INSERT INTO slip_legs (slip_id, game_id, player_id, market, side, line, price)
        VALUES ('00000000-0000-4000-8000-000000000001', 'g1', 'p1', 'PTS', 'over', 20.5, -110);
  `);
}, 60_000);

afterAll(async () => {
  await pg.close();
});

describe('roles.sql', () => {
  it('web_role reads data tables but cannot write them', async () => {
    expect(await allowed('web_role', 'SELECT * FROM prop_metrics')).toBe(true);
    expect(await allowed('web_role', 'SELECT * FROM job_runs')).toBe(true);
    expect(await allowed('web_role', "UPDATE teams SET name = 'x'")).toBe(false);
    expect(await allowed('web_role', 'DELETE FROM prop_offers')).toBe(false);
  });

  it('web_role reads and writes user tables', async () => {
    expect(
      await allowed('web_role', "INSERT INTO users (id, email) VALUES ('u2', 'u2@example.com')"),
    ).toBe(true);
    expect(
      await allowed(
        'web_role',
        "INSERT INTO favorites (user_id, player_id, market, side) VALUES ('u2', 'p1', 'PTS', 'over')",
      ),
    ).toBe(true);
    expect(await allowed('web_role', "DELETE FROM favorites WHERE user_id = 'u2'")).toBe(true);
    expect(await allowed('web_role', 'SELECT * FROM slip_legs')).toBe(true);
  });

  it('worker_role writes data tables', async () => {
    expect(
      await allowed('worker_role', "UPDATE teams SET name = 'Boston Celtics' WHERE id = 'bos'"),
    ).toBe(true);
    expect(await allowed('worker_role', 'DELETE FROM team_dvp')).toBe(true);
    expect(
      await allowed(
        'worker_role',
        "INSERT INTO job_runs (job, status, started_at) VALUES ('t', 'ok', now())",
      ),
    ).toBe(true);
  });

  it('identity inserts need no sequence grant, and none is given', async () => {
    for (const stmt of [
      "INSERT INTO raw_payloads (provider, endpoint, body) VALUES ('t', 'e', '{}')",
      "INSERT INTO job_runs (job) VALUES ('t')",
      "INSERT INTO injuries (player_id, status) VALUES ('p1', 'out')",
      "INSERT INTO prop_offers (game_id, player_id, market, line, book) VALUES ('g1', 'p1', 'PTS', 20.5, 'fd')",
    ]) {
      expect(await allowed('worker_role', stmt), stmt).toBe(true);
    }
    const grants = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.usage_privileges
       WHERE object_type = 'SEQUENCE' AND grantee IN ('web_role', 'worker_role')`,
    );
    expect(grants.rows[0]!.n).toBe(0);
    const seqSelect = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_class c
       WHERE c.relkind = 'S' AND (has_sequence_privilege('worker_role', c.oid, 'USAGE')
         OR has_sequence_privilege('worker_role', c.oid, 'SELECT'))`,
    );
    expect(seqSelect.rows[0]!.n).toBe(0);
  });

  it('worker_role has no user tables beyond grading slip_legs', async () => {
    expect(await allowed('worker_role', 'SELECT * FROM users')).toBe(false);
    expect(await allowed('worker_role', 'SELECT * FROM slips')).toBe(false);
    expect(await allowed('worker_role', 'SELECT * FROM favorites')).toBe(false);
    expect(await allowed('worker_role', 'SELECT * FROM user_settings')).toBe(false);
    expect(await allowed('worker_role', 'SELECT * FROM filter_presets')).toBe(false);
    expect(
      await allowed(
        'worker_role',
        "UPDATE slip_legs SET result = 'win', graded_at = now() WHERE result = 'pending'",
      ),
    ).toBe(true);
    expect(await allowed('worker_role', 'UPDATE slip_legs SET line = 1')).toBe(false);
    expect(await allowed('worker_role', 'DELETE FROM slip_legs')).toBe(false);
  });

  // Relations each role's code queries (worker jobs, web query modules), tables AND views.
  const WORKER_READS = [
    'teams',
    'players',
    'games',
    'player_game_logs',
    'injuries',
    'provider_aliases',
    'prop_offers',
    'prop_metrics',
    'team_dvp',
    'raw_payloads',
    'api_usage',
    'job_runs',
    'prop_current',
    'slip_legs',
  ];
  const WEB_READS = [
    'teams',
    'players',
    'games',
    'player_game_logs',
    'injuries',
    'prop_offers',
    'prop_metrics',
    'team_dvp',
    'api_usage',
    'job_runs',
    'prop_current',
    'users',
    'user_settings',
    'favorites',
    'filter_presets',
    'slips',
    'slip_legs',
  ];

  it('worker_role can SELECT every relation its jobs query (incl. the prop_current view)', async () => {
    for (const rel of WORKER_READS) {
      expect(await allowed('worker_role', `SELECT * FROM ${rel}`), rel).toBe(true);
    }
  });

  it('web_role can SELECT every relation its queries use (incl. the prop_current view)', async () => {
    for (const rel of WEB_READS) {
      expect(await allowed('web_role', `SELECT * FROM ${rel}`), rel).toBe(true);
    }
  });

  it('web_role cannot read raw_payloads', async () => {
    expect(await allowed('web_role', 'SELECT * FROM raw_payloads')).toBe(false);
  });
});
