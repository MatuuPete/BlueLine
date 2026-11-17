# BlueLine runbook

## Local development

Requires Node 24 and corepack (`corepack enable`; on Windows without pnpm on PATH, prefix commands with `corepack`).

```sh
pnpm install --frozen-lockfile
export DATABASE_URL=pglite:./.data/pglite   # embedded Postgres, no Docker needed
export STATS_PROVIDER=fixtures ODDS_PROVIDER=fixtures
pnpm worker seed                            # load fixture data
pnpm dev                                    # or: pnpm --filter @blueline/web dev
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build`, `pnpm e2e` (Playwright on fixtures; run `pnpm --filter @blueline/web exec playwright install chromium` once).

Worker CLI: `pnpm worker <ingest:schedule|ingest:boxscores|ingest:injuries|ingest:odds|precompute|grade-slips|seed> [--date YYYY-MM-DD] [--closing] [--incremental]`.

## Neon (database)

1. Create a Neon project (Free plan) and a database; use the pooled connection string for the web app and the direct one for migrations/`pg_dump` if you hit pooler limits.
2. Run migrations against it: `DATABASE_URL=<neon url> pnpm --filter @blueline/db exec drizzle-kit migrate` (check the db package scripts for the exact command).
3. Neon's built-in point-in-time restore window is the first line of recovery; the weekly `pg_dump` artifact is the second.

## Vercel (web)

1. Import the repo; set **Root Directory** to `apps/web`. Framework preset: Next.js.
2. Add environment variables (Production and Preview): `DATABASE_URL`, plus any auth/provider settings the web app documents (`ODDS_PROVIDER`, etc.).
3. Production deploys on merge to `main`. Run migrations before the deploy.

## GitHub Actions secrets

Repo Settings > Secrets and variables > Actions > New repository secret:

| Secret | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | ingest | Neon connection string |
| `DATABASE_URL_DIRECT` | backup | Neon DIRECT (non-pooled) connection string; pg_dump does not work through the pooler |
| `SGO_API_KEY` | ingest | SportsGameOdds |
| `THE_ODDS_API_KEY` | ingest | The Odds API (fallback provider) |
| `ODDS_PROVIDER` | ingest | `sportsgameodds` or `theoddsapi` (match the adapter's accepted values) |
| `ODDS_MONTHLY_BUDGET` | ingest | Monthly unit cap for the budget guard |

CLI alternative: `gh secret set DATABASE_URL`.

## Rotating keys

1. Create the new key at the provider (or rotate the Neon role password).
2. Update the GitHub secret (`gh secret set NAME`) and the Vercel env var if the web app uses it.
3. Trigger the matching job manually (Actions > Ingest > Run workflow) and confirm it succeeds, then revoke the old key.
4. For `DATABASE_URL`, redeploy Vercel so it picks up the new value.

## Scheduled jobs

`.github/workflows/ingest.yml` runs the spec section 3 schedule. GitHub cron is UTC only, so entries are written for **EST (UTC-5)**, the NBA regular season:

| Job | ET (spec) | UTC cron (EST) |
|---|---|---|
| boxscores, precompute, grade-slips | 06:00 | `0 11 * * *` |
| schedule | 06:15 | `15 11 * * *` |
| injuries (+ incremental precompute) | hourly 10:00-23:00 | `0 15-23,0-4 * * *` |
| odds (+ incremental precompute) | every 2h 12:00-18:00 | `0 17,19,21,23 * * *` |
| odds --closing | every 15 min 17:00-23:00 | `*/15 22,23,0-3 * * *` and `0,15,30,45 4 * * *` |

**DST drift:** while EDT (UTC-4) is in effect (roughly early October and the second half of the season from mid-March), every job fires one hour earlier in ET (boxscores at 07:00 ET, closing odds 18:00-00:45 ET). This is accepted: 07:00 daily jobs are harmless, and the closing window still covers evening tip-offs. No duplicate entries are used, to keep GH Actions minutes low. GH cron can also be delayed by several minutes.

Each schedule string maps to a job name in the "Map schedule to job" step; if you edit a cron, edit the `case` too. Concurrency group is `ingest-<job name>` with `cancel-in-progress: false`, so only one run per job executes at a time (scheduled and manual runs of the same job share the group; both odds-closing crons share `odds-closing`). GitHub keeps at most one pending run per group: a pending run can be superseded by a newer pending run of the same job. For manual dispatches that newer run may carry a different `date`, so re-dispatch any dropped manual date. Different job types may run concurrently; this is acceptable because precompute upserts are idempotent. Run one manually from Actions > Ingest > Run workflow (choose `job`, optional `date`). A failing run fails the workflow, which emails the repo owner.

## Backups

`.github/workflows/backup.yml` runs a `pg_dump` (custom format) every Sunday 08:00 UTC and uploads `blueline-<timestamp>.dump` as an artifact kept for 30 days. The workflow installs `postgresql-client-$PG_MAJOR` from the official PGDG apt repo (signed key) because Ubuntu's default client is too old for Neon. Set `PG_MAJOR` at the top of `backup.yml` to your Neon Postgres major version (currently 17). The secret `DATABASE_URL_DIRECT` must be the direct, non-pooled Neon string. **The artifact is an unencrypted full dump: only use this workflow in a private repository.**

Restore:

```sh
gh run download <run-id> -n blueline-pg-dump
pg_restore --clean --if-exists --no-owner -d "$TARGET_DATABASE_URL" blueline-<timestamp>.dump
```

Restore into a fresh Neon branch first and verify before touching production.

## Reading /status

Open `/status` on the deployed site. It shows the last run per job (status, duration, units spent, error), API budget used this month vs `ODDS_MONTHLY_BUDGET`, and row counts. A job whose last run is stale or failed: open the matching Actions run, read the log, fix, and re-run via workflow_dispatch. If odds budget is exhausted the worker degrades to fewer markets (PTS, PRA, REB, AST, 3PM first); raise `ODDS_MONTHLY_BUDGET` or switch `ODDS_PROVIDER`.

## CI

`.github/workflows/ci.yml` runs on PRs and pushes to `main`: install, lint, typecheck, vitest, build, Playwright on fixtures (skipped automatically until `apps/web` has an `e2e` script), gitleaks, and `pnpm audit --prod --audit-level high`. Third-party actions are pinned to full commit SHAs (version in a trailing comment); update them deliberately.

### Triage notes

- **`pnpm audit` failing:** run `pnpm audit --prod --audit-level high` locally, find the vulnerable path with `pnpm why <pkg>`, upgrade the direct dependency (or add a `pnpm.overrides` entry) and re-run. Only if no fix exists and the advisory is not reachable, document the exception in the PR; do not lower the audit level.
- **gitleaks:** `gitleaks-action` is free for personal-account repos; for organization-owned repos it requires a `GITLEAKS_LICENSE` secret (add it to the `security` job env in `ci.yml`).
