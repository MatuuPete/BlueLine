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
| `AUTH_URL` | Only when self-hosting behind a proxy (e.g. `https://blueline.example.com`). On Vercel the host is trusted automatically. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional. Shared rate-limit buckets across serverless instances (Upstash Redis free tier > REST API). Unset = per-instance in-memory buckets. |
| `AUTH_DEV_BYPASS` | `1` = signed in as `dev-user` without OAuth. Ignored when `NODE_ENV=production`. Never set it on Vercel. |

`pnpm --filter @blueline/web build` needs none of these; they are read at request time. In production Auth.js fails closed (every request is signed out) if `AUTH_SECRET` is missing.

### 3. What the app enforces

- `apps/web/proxy.ts` (Next 16's renamed `middleware.ts`) runs before every request except `/_next/static`, `/_next/image` and `/favicon.ico`: without a session, pages redirect to `/signin?callbackUrl=...` and `/api/*` answers 401. Public: `/signin`, `/welcome` (and `/welcome/*`), `/offline`, `/api/health`, `/api/auth/*`, `/manifest.webmanifest`, `/sw.js`, `/icons/*`, `/icon*`, `/apple-icon*` and single-segment static files in `public/`.
- CSP with a per-request nonce (sent to the app as the `x-nonce` request header), set by the proxy. HSTS (production), `nosniff`, `Referrer-Policy`, `Permissions-Policy` and `X-Frame-Options: DENY` come from `next.config.ts`.
- Every `/api` route goes through `authed()` (`apps/web/lib/api.ts`): a token bucket of 60 requests/min per user (per IP when signed out), 429 with `Retry-After` when exceeded.
- Sign-out (`apps/web/app/_auth/SignOutButton.tsx`) clears Cache Storage and messages the service worker (`{ type: 'SIGN_OUT' }`) before ending the session.

### 4. Database roles (least privilege)

`packages/db/sql/roles.sql` creates `web_role` (SELECT on data tables; read/write on `users`, `user_settings`, `favorites`, `filter_presets`, `slips`, `slip_legs`) and `worker_role` (read/write on data tables; on user tables only SELECT and `UPDATE (result, graded_at)` on `slip_legs` for grading). Migrations keep using the owner role.

1. Run migrations as the owner, then: `psql "$OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/sql/roles.sql` (or paste it into the Neon SQL Editor as the owner).
2. Create login roles (strong passwords, Neon requires ~60 bits of entropy):
   ```sql
   CREATE ROLE blueline_web    LOGIN PASSWORD '<openssl rand -base64 32>' IN ROLE web_role;
   CREATE ROLE blueline_worker LOGIN PASSWORD '<openssl rand -base64 32>' IN ROLE worker_role;
   ```
3. Vercel `DATABASE_URL` = `blueline_web` (pooled). GitHub `DATABASE_URL` (ingest) = `blueline_worker`. Keep the owner string only for migrations and `DATABASE_URL_DIRECT` (backup).
4. Re-run `roles.sql` after any migration that adds a table (new tables get no grants by default).
