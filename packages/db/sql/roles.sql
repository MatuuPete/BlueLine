-- BlueLine database least privilege (spec §8).
--
--   web_role     SELECT on data tables; read/write on user tables only.
--   worker_role  read/write on data tables; no user tables, except SELECT/UPDATE on
--                slip_legs so grade-slips can settle legs.
--   owner        (the Neon project owner, e.g. neondb_owner) runs migrations from CI only.
--
-- How to apply on Neon
--   1. Run migrations first (as the owner), so every table exists.
--   2. Run this file as the owner:
--        psql "$OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/sql/roles.sql
--      (or paste it into the Neon SQL Editor, connected as the owner).
--   3. Create one LOGIN role per app and give it the group role. Neon requires strong
--      passwords (60+ bits of entropy), e.g. `openssl rand -base64 32`:
--        CREATE ROLE blueline_web    LOGIN PASSWORD '<strong password>' IN ROLE web_role;
--        CREATE ROLE blueline_worker LOGIN PASSWORD '<strong password>' IN ROLE worker_role;
--      Login roles created in SQL (not in the Neon console) are fine; Neon only manages the
--      ones it created. Keep passwords out of git.
--   4. Point Vercel's DATABASE_URL at blueline_web and the ingest workflow's DATABASE_URL at
--      blueline_worker. Keep the owner URL only in CI secrets used for migrations and backups.
--   5. Re-run this file after every migration that adds a table: grants are per table and
--      new tables get no access by default (deliberately; no ALTER DEFAULT PRIVILEGES).
--
-- The file is idempotent: roles are created if missing and all table grants are reset.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'web_role') THEN
    CREATE ROLE web_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'worker_role') THEN
    CREATE ROLE worker_role NOLOGIN;
  END IF;
END
$$;

-- Nobody but the owner creates objects (already the default on Postgres 15+).
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO web_role, worker_role;

-- Start from nothing, so re-running removes anything granted by hand.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM web_role, worker_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM web_role, worker_role;

-- Data tables (written by the worker, read by the web app).
GRANT SELECT ON
  teams, players, games, player_game_logs, injuries, provider_aliases,
  prop_offers, prop_metrics, team_dvp, raw_payloads, api_usage, job_runs
TO web_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  teams, players, games, player_game_logs, injuries, provider_aliases,
  prop_offers, prop_metrics, team_dvp, raw_payloads, api_usage, job_runs
TO worker_role;

-- Identity columns (injuries, job_runs, prop_offers, raw_payloads) need no sequence grant
-- for INSERT; this only covers explicit nextval()/currval() use.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO worker_role;

-- User tables (web app only; every query filters by session.user.id).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, user_settings, favorites, filter_presets, slips, slip_legs
TO web_role;

-- grade-slips reads pending legs and writes result/graded_at. Column-level UPDATE keeps
-- the worker from rewriting a leg's line, price or owner.
GRANT SELECT ON slip_legs TO worker_role;
GRANT UPDATE (result, graded_at) ON slip_legs TO worker_role;

-- Drizzle's migration journal (schema "drizzle") stays owner-only: no grants.
