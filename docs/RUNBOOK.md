# BlueLine runbook

Going live for the first time? Follow [DEPLOY.md](DEPLOY.md) (`corepack pnpm setup:live` automates the database, secrets and first data pull). This runbook is the reference behind it.

## Local development

Requires Node 24 and corepack (`corepack enable`; on Windows without pnpm on PATH, prefix commands with `corepack`).

```sh
pnpm install --frozen-lockfile
export DATABASE_URL=pglite:./.data/pglite   # embedded Postgres, no Docker needed
export STATS_PROVIDER=fixtures ODDS_PROVIDER=fixtures
pnpm worker seed                            # load fixture data
pnpm dev                                    # root script; same as: pnpm --filter @blueline/web dev
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build`, `pnpm e2e` (Playwright on fixtures; run `pnpm --filter @blueline/web exec playwright install chromium` once).

Worker CLI: `pnpm worker <job> [--date YYYY-MM-DD] [--days N] [--closing] [--incremental]`, where `<job>` is one of:

| Job | What it does |
|---|---|
| `ingest:schedule` | Upsert teams, the next 7 days of games and the playing teams' rosters |
| `ingest:boxscores` | Upsert box scores for final games (default: yesterday); then prunes `raw_payloads` past `RAW_PAYLOAD_RETENTION_DAYS` |
| `ingest:injuries` | Refresh the injury report |
| `ingest:odds` | Pull player props and game lines within the monthly unit budget; `--closing` pulls games tipping within 45 minutes |
| `dvp` | Recompute defense-vs-position (`team_dvp`) from the stored logs |
| `precompute` | Recompute `prop_metrics`; `--incremental` only games tipping today |
| `grade-slips` | Settle pending slip legs from final box scores |
| `seed` | Load fixture data (pglite only: it refuses any other `DATABASE_URL`) |

Providers fail closed: with a non-`pglite:` `DATABASE_URL`, a blank or unset `STATS_PROVIDER` or `ODDS_PROVIDER` (which would default to `fixtures`) is a startup error, so a missing secret can never write fixture data to production. Config and database errors print a single `worker: <message>` line and exit 1.

## Neon (database)

1. Create a Neon project (Free plan) and a database; use the pooled connection string for the web app and the direct one for migrations/`pg_dump` if you hit pooler limits.
2. Run migrations against it as the OWNER role: `DATABASE_URL=<owner url> pnpm --filter @blueline/db db:migrate` (this is `drizzle-kit migrate`). CI does this for you, see Migrations below.
3. Neon's built-in point-in-time restore window is the first line of recovery; the weekly `pg_dump` artifact is the second.

## Migrations

`.github/workflows/migrate.yml` runs `pnpm --filter @blueline/db db:migrate` against the secret `DATABASE_URL_OWNER` on every push to `main` (and on demand from Actions > Migrate > Run workflow). It is a no-op when nothing is pending, and it skips with a notice when the secret is absent (then run the command by hand). It runs as the Neon owner role, never as `blueline_web` or `blueline_worker`. The web app does not migrate Postgres at startup.

Order for any release that adds a table: **migrate (owner) -> re-run `roles.sql` (owner) -> deploy**. `roles.sql` is not run by CI.

## Vercel (web)

1. Import the repo; set **Root Directory** to `apps/web`. Framework preset: Next.js.
2. Add environment variables (Production and Preview): `DATABASE_URL`, plus any auth/provider settings the web app documents (`ODDS_PROVIDER`, `ODDS_MONTHLY_BUDGET`, etc.).
3. Production deploys on merge to `main`. The Migrate workflow runs on the same push; if it fails or is skipped, migrate by hand before relying on the deploy.

## GitHub Actions secrets

Repo Settings > Secrets and variables > Actions > New repository secret:

| Secret | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | ingest | Neon connection string for the `blueline_worker` login role |
| `DATABASE_URL_OWNER` | migrate | Neon OWNER connection string (migrations only; the workflow skips if unset) |
| `DATABASE_URL_DIRECT` | backup | Neon DIRECT (non-pooled) connection string; pg_dump does not work through the pooler |
| `SGO_API_KEY` | ingest | SportsGameOdds |
| `THE_ODDS_API_KEY` | ingest | The Odds API (fallback provider) |
| `ODDS_PROVIDER` | ingest | `sgo` or `theoddsapi` (`fixtures` is refused against a real database). `STATS_PROVIDER` is set to `espn` in the workflow itself |
| `ODDS_MONTHLY_BUDGET` | ingest | Monthly unit cap for the budget guard (default 2500 when blank) |
| `BACKUP_PASSPHRASE` | backup | Passphrase for the GPG-encrypted dump; the backup job fails without it. Also keep it in a password manager: without it the backups are unreadable |

CLI alternative: `gh secret set DATABASE_URL`.

## Rotating keys

1. Create the new key at the provider (or rotate the Neon role password).
2. Update the GitHub secret (`gh secret set NAME`) and the Vercel env var if the web app uses it.
3. Trigger the matching job manually (Actions > Ingest > Run workflow) and confirm it succeeds, then revoke the old key.
4. For `DATABASE_URL`, redeploy Vercel so it picks up the new value.

## raw_payloads retention

Every provider response is stored in `raw_payloads`. The daily job (`ingest:boxscores`) deletes rows older than `RAW_PAYLOAD_RETENTION_DAYS` (default 21) and reports `prunedRaw` in the job's meta. To change it, add `RAW_PAYLOAD_RETENTION_DAYS` to the Run job env in `ingest.yml`. The Neon Free plan is small, so keep it low.

## Scheduled jobs

`.github/workflows/ingest.yml` runs the spec section 3 schedule. GitHub cron is UTC only, so entries are written for **EST (UTC-5)**, the NBA regular season:

| Job | ET (spec) | UTC cron (EST) |
|---|---|---|
| boxscores, precompute, grade-slips | 06:00 | `0 11 * * *` |
| schedule | 06:15 | `15 11 * * *` |
| injuries (+ incremental precompute) | hourly at :10, 10:10-23:10 | `10 15-23,0-4 * * *` |
| odds (+ incremental precompute) | every 2h 12:00-16:00 | `0 17,19,21 * * *` |
| odds --closing (+ incremental precompute) | every 30 min 17:00-23:30 | `0,30 22-23,0-4 * * *` |

No minute fires two jobs: odds runs at 12/14/16 ET and closing starts at 17:00 ET, so the old 18:00 overlap (both pulling the same games) is gone, and injuries run at :10. The 45-minute closing window overlaps itself on a 30-minute cadence, so every game is caught. The closing job exits immediately (no provider call, 0 units) when no game tips within the window. The daily precompute takes no date: it always recomputes from current data.

**DST drift:** while EDT (UTC-4) is in effect (roughly early October and the second half of the season from mid-March), every job fires one hour earlier in ET (boxscores at 07:00 ET, closing odds 18:00-00:30 ET). This is accepted: 07:00 daily jobs are harmless, and the closing window still covers evening tip-offs. No duplicate entries are used, to keep GH Actions minutes low. GH cron can also be delayed by several minutes.

Each schedule string maps to a job name in the "Map schedule to job" step; if you edit a cron, edit the `case` too. Concurrency group is `ingest-<job name>` with `cancel-in-progress: false`, so only one run per job executes at a time (scheduled and manual runs of the same job share the group; the odds-closing cron has its own group). GitHub keeps at most one pending run per group: a pending run can be superseded by a newer pending run of the same job. For manual dispatches that newer run may carry a different `date`, so re-dispatch any dropped manual date. Different job types may run concurrently; this is acceptable because precompute upserts are idempotent. Run one manually from Actions > Ingest > Run workflow (choose `job`, optional `date`). A failing run fails the workflow, which emails the repo owner.

### Actions minutes

GitHub bills each job rounded up to whole minutes. Runs per day: 1 daily + 1 schedule + 14 injuries + 3 odds + 14 closing = 33 runs, each about 1 to 2 minutes (checkout, cached pnpm install, a short worker call), so roughly **1,000 to 2,000 minutes per month**, plus CI (about 5 to 8 minutes per PR or push) and the weekly backup (about 2 minutes). Private repositories get 2,000 free Linux minutes per month, so the upper end is at the limit; public repositories are free. To reduce usage, drop closing to hourly or injuries to every 2 hours.

Measure one run: open Actions > Ingest > the run > the job and read the job duration, or from a terminal:

```sh
gh run list --workflow ingest.yml --limit 20 --json databaseId,displayTitle,createdAt
gh run view <run-id> --json jobs --jq '.jobs[] | {name, startedAt, completedAt}'
```

Billable minutes are the job duration rounded up. Settings > Billing > Actions shows the month's total. Multiply the average run by 33 runs/day x 30 days.

## Backups

`.github/workflows/backup.yml` runs a `pg_dump` (custom format) every Sunday 08:00 UTC encrypts it with `gpg --symmetric --cipher-algo AES256` using the secret `BACKUP_PASSPHRASE` (the job fails if the secret is missing), and uploads only `blueline-<timestamp>.dump.gpg` as an artifact kept for 30 days. The workflow installs `postgresql-client-$PG_MAJOR` from the official PGDG apt repo (signed key) because Ubuntu's default client is too old for Neon. Set `PG_MAJOR` at the top of `backup.yml` to your Neon Postgres major version (currently 17). The secret `DATABASE_URL_DIRECT` must be the direct, non-pooled Neon string. The unencrypted dump never leaves the runner. Keep the repository private anyway.

Restore:

```sh
gh run download <run-id> -n blueline-pg-dump
# Decrypt (prompts for BACKUP_PASSPHRASE)
gpg --decrypt --output blueline-<timestamp>.dump blueline-<timestamp>.dump.gpg
pg_restore --clean --if-exists --no-owner -d "$TARGET_DATABASE_URL" blueline-<timestamp>.dump
```

Restore into a fresh Neon branch first and verify before touching production.

## Reading /status

Open `/status` on the deployed site. It shows the last run per job (status, duration, units spent, error), API budget used this month (America/New_York calendar month) vs `ODDS_MONTHLY_BUDGET` (default 2500), and row counts. A job whose last run is stale or failed: open the matching Actions run, read the log, fix, and re-run via workflow_dispatch. If odds budget is exhausted the worker degrades to fewer markets (PTS, PRA, REB, AST, 3PM first); raise `ODDS_MONTHLY_BUDGET` or switch `ODDS_PROVIDER`.

## CI

`.github/workflows/ci.yml` runs on PRs and pushes to `main`: install, `prettier --check .`, lint, typecheck, vitest, build, Playwright on fixtures (skipped automatically until `apps/web` has an `e2e` script), gitleaks, and `pnpm audit --prod --audit-level high`. Third-party actions are pinned to full commit SHAs (version in a trailing comment); update them deliberately.

### Triage notes

- **`pnpm audit` failing:** run `pnpm audit --prod --audit-level high` locally, find the vulnerable path with `pnpm why <pkg>`, upgrade the direct dependency (or add a `pnpm.overrides` entry) and re-run. Only if no fix exists and the advisory is not reachable, document the exception in the PR; do not lower the audit level.
- **gitleaks:** `gitleaks-action` is free for personal-account repos; for organization-owned repos it requires a `GITLEAKS_LICENSE` secret (add it to the `security` job env in `ci.yml`).

## First deploy checklist

The guided path is [DEPLOY.md](DEPLOY.md); `corepack pnpm setup:live` performs steps 2 to 4 and the first data pull for you. The manual steps:

1. Create the Neon project and database (Neon section above).
2. Migrate as the owner: `DATABASE_URL=<owner url> pnpm --filter @blueline/db db:migrate` (or set `DATABASE_URL_OWNER` and run Actions > Migrate).
3. Apply grants: `psql "$OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/sql/roles.sql`.
4. Create the login roles `blueline_web` and `blueline_worker` with strong passwords (section 4 of Auth & security setup below).
5. Set secrets and env:
   - GitHub Actions: `DATABASE_URL` (worker role), `DATABASE_URL_OWNER`, `DATABASE_URL_DIRECT`, `ODDS_PROVIDER=sgo`, `SGO_API_KEY`, `ODDS_MONTHLY_BUDGET`, `BACKUP_PASSPHRASE`. (`STATS_PROVIDER=espn` is set in the workflow.)
   - Vercel: `DATABASE_URL` (web role), `ODDS_PROVIDER=sgo`, `ODDS_MONTHLY_BUDGET`, the `AUTH_*` variables and `ALLOWED_EMAILS`.
6. Run from Actions > Ingest > Run workflow, in this order: `schedule`, then `daily` (boxscores need games and teams), then `odds`. Confirm each run is green.
7. Open `/status`: every job should show OK, the odds budget should have moved, and row counts should be non-zero. Then run Actions > Backup once and test a restore on a Neon branch.

## Auth & security setup

Sign-in is Auth.js v5 (`apps/web/auth.ts`, `auth.config.ts`) with Google and GitHub OAuth, JWT sessions (7 days, httpOnly cookies, `Secure` on https) and no database adapter. Only emails in `ALLOWED_EMAILS` get in; everyone else lands on `/signin` with "This email isn't on the BlueLine allowlist."

### 1. OAuth apps

Callback URLs (one per environment; add `http://localhost:3000/...` for local dev):

| Provider | Callback URL |
|---|---|
| Google | `https://<your-domain>/api/auth/callback/google` |
| GitHub | `https://<your-domain>/api/auth/callback/github` |

- **Google:** Google Cloud Console > APIs & Services > OAuth consent screen (External, add yourself as a test user or publish), then Credentials > Create credentials > OAuth client ID > Web application. Authorized JavaScript origin `https://<your-domain>`, redirect URI as above. Copy the client ID/secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
- **GitHub:** Settings > Developer settings > OAuth Apps > New OAuth App. Homepage `https://<your-domain>`, callback as above (GitHub allows one callback per app, so create a separate app for localhost). Copy into `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`. The app requests `read:user user:email` and only ever uses a **verified** GitHub email.

Google sign-in also requires `email_verified`. The same email via Google or GitHub is the same BlueLine user (`users.id = u_` + 24 hex chars of sha256(lowercased email)).

### 2. Environment (Vercel: Production and Preview; never with a `NEXT_PUBLIC_` prefix)

| Variable | Notes |
|---|---|
| `AUTH_SECRET` | Generate with `npx auth secret` or `openssl rand -base64 32`. Rotating it signs everyone out. |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | From the Google OAuth client |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | From the GitHub OAuth app |
| `ALLOWED_EMAILS` | Comma list, case-insensitive, e.g. `me@example.com, partner@example.com`. Empty = nobody. Removing an email ends that person's session on their next request. |
| `AUTH_URL` / `AUTH_TRUST_HOST` | Not needed on Vercel (host trusted automatically). Self-hosting or `next start` locally in production mode: set `AUTH_URL=https://blueline.example.com` or `AUTH_TRUST_HOST=true`, otherwise Auth.js logs `UntrustedHost` and everyone stays signed out (fails closed). |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional. Shared rate-limit buckets across serverless instances (Upstash Redis free tier > REST API). Unset = per-instance in-memory buckets. |
| `AUTH_DEV_BYPASS` | `1` = signed in as `dev-user` without OAuth. Ignored when `NODE_ENV=production`. Never set it on Vercel. |

`pnpm --filter @blueline/web build` needs none of these; they are read at request time. In production Auth.js fails closed (every request is signed out) if `AUTH_SECRET` is missing.

### 3. What the app enforces

- `apps/web/proxy.ts` (Next 16's renamed `middleware.ts`) runs before every request except `/_next/static/*`, `/_next/image` and `/favicon.ico`: without a session, pages redirect to `/signin?callbackUrl=...` and `/api/*` answers 401. Public: `/signin`, `/welcome` (and `/welcome/*`), `/offline`, `/api/health`, `/api/auth/*`, `/manifest.webmanifest`, `/manifest.json`, `/sw.js`, `/robots.txt`, `/icons/*`, and the icon files `/icon.svg`, `/icon.png`, `/icon<N>.png`, `/icon-<size>.png`, `/apple-icon.png`, `/apple-touch-icon[-precomposed].png`. Any other file in `public/` needs a session; add it to `PUBLIC_EXACT` in `apps/web/lib/security.ts` if it must be public.
- **The proxy is a first gate, not the authorization layer.** It lets server actions posted to public pages (e.g. `/signin`, `/welcome`) through. Every server action, and every server component or route handler that touches user data, must call `getUserId()` (`apps/web/lib/session.ts`) itself and treat `null` as signed out. `/api` routes do this via `authed()`.
- Sign-in redirect targets (`callbackUrl`) go through `safeCallback()` (`apps/web/lib/safe-callback.ts`): same-origin paths only.
- CSP with a per-request nonce (sent to the app as the `x-nonce` request header), set by the proxy. HSTS (`max-age=63072000; includeSubDomains`, production only; deliberately no `preload`, which is hard to undo), `nosniff`, `Referrer-Policy`, `Permissions-Policy` and `X-Frame-Options: DENY` come from `next.config.ts`.
- Every `/api` route goes through `authed()` (`apps/web/lib/api.ts`): a token bucket of 60 requests/min per user (per IP when signed out), 429 with `Retry-After` when exceeded. The IP comes only from `x-real-ip`, which Vercel sets and clients cannot forge; `x-forwarded-for` is ignored. If you self-host behind another proxy, have it set `x-real-ip`, otherwise all signed-out callers share one bucket. In-memory buckets are capped at 10,000 keys (least recently used evicted).
- Sign-out (`apps/web/app/_auth/SignOutButton.tsx`) clears Cache Storage and messages the service worker (`{ type: 'SIGN_OUT' }`) before ending the session.

### 4. Database roles (least privilege)

`packages/db/sql/roles.sql` creates `web_role` (SELECT on data tables and the `prop_current` view, but not `raw_payloads`; read/write on `users`, `user_settings`, `favorites`, `filter_presets`, `slips`, `slip_legs`, `bets`) and `worker_role` (read/write on data tables, SELECT on `prop_current`; on user tables only SELECT and `UPDATE (result, graded_at)` on `slip_legs` for grading; no access to `bets`). After deploying the `0001_bets` migration, re-run `roles.sql` so `web_role` gets the new table (see [BETS.md](BETS.md)). Migrations keep using the owner role.

1. Run migrations as the owner, then: `psql "$OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/sql/roles.sql` (or paste it into the Neon SQL Editor as the owner).
2. Create login roles (strong passwords, Neon requires ~60 bits of entropy):
   ```sql
   CREATE ROLE blueline_web    LOGIN PASSWORD '<openssl rand -base64 32>' IN ROLE web_role;
   CREATE ROLE blueline_worker LOGIN PASSWORD '<openssl rand -base64 32>' IN ROLE worker_role;
   ```
3. Vercel `DATABASE_URL` = `blueline_web` (pooled). GitHub `DATABASE_URL` (ingest) = `blueline_worker`. Keep the owner string only for migrations and `DATABASE_URL_DIRECT` (backup).
4. Re-run `roles.sql` after any migration that adds a table (new tables get no grants by default).
