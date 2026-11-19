# Deploy BlueLine to Vercel

This gets BlueLine live on Vercel with Neon Postgres, SportsGameOdds and Google and/or GitHub sign-in. Allow about 45 minutes the first time. You need Node 24 and this repo cloned; commands use PowerShell and `corepack pnpm` (pnpm itself does not need to be installed).

Reference material (database roles, backups, retention) lives in [RUNBOOK.md](RUNBOOK.md).

## 1. Neon: create the database

1. Sign in at <https://console.neon.tech> and create a project (any region, Postgres 17).
2. On the project dashboard click **Connect**. Turn **Connection pooling off** (you want the _direct_ host, whose name has no `-pooler`) and make sure the role is the owner (usually `neondb_owner`).
3. Copy the connection string. It looks like `postgresql://neondb_owner:...@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`. This is the **owner connection string**; keep it private.

## 2. SportsGameOdds: get an API key

Create an account at <https://sportsgameodds.com>, open the dashboard and copy your API key. The default `ODDS_MONTHLY_BUDGET=2500` keeps usage inside a small plan.

## 3. Run the setup command

From the repo root:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm setup:live
```

It asks for: the owner connection string, an optional pooled connection string (press Enter and it is derived), the SportsGameOdds key, the emails allowed to sign in (comma list), and optionally your GitHub/Google OAuth IDs and secrets (press Enter to add them later in step 5). Secret input is hidden.

It then, in order: runs the database migrations, applies `packages/db/sql/roles.sql`, creates the login roles `blueline_web` and `blueline_worker` with fresh random passwords, writes your credential files, pulls the first data (7 days of schedule, 30 days of box scores, injuries, odds for today and tomorrow, then precompute) and prints row counts. It takes roughly 2 to 5 minutes. Re-running is safe: it updates the roles (new passwords, so re-paste the files), reuses your `AUTH_SECRET` and `BACKUP_PASSPHRASE` and any OAuth values from the previous run, and `--rotate` replaces those two secrets.

It writes two files in `deploy/` (gitignored; they contain secrets, never commit or share them):

- `deploy/vercel.env`: the environment for Vercel (step 4).
- `deploy/github-secrets.txt`: one `NAME=value` line per GitHub Actions secret (step 6).

Non-interactive (scripts, re-runs): set `SETUP_OWNER_URL`, `SETUP_SGO_API_KEY`, `SETUP_ALLOWED_EMAILS` (and optionally `SETUP_POOLED_URL`, `SETUP_GITHUB_ID`, `SETUP_GITHUB_SECRET`, `SETUP_GOOGLE_ID`, `SETUP_GOOGLE_SECRET`), then `corepack pnpm setup:live --non-interactive`, for example:

```powershell
$env:SETUP_OWNER_URL = "postgresql://neondb_owner:...@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
$env:SETUP_SGO_API_KEY = "your-key"
$env:SETUP_ALLOWED_EMAILS = "you@example.com"
corepack pnpm setup:live --non-interactive
```

If your Neon role cannot create roles, the command prints the exact SQL (and writes it to `deploy/manual-roles.sql`); run it in the Neon SQL Editor as the owner, then run `setup:live` again.

## 4. Vercel: create the project

1. <https://vercel.com> > **Add New** > **Project** > import `MatuuPete/BlueLine`.
2. **Root Directory**: click Edit and choose `apps/web`. The Framework Preset stays Next.js; `apps/web/vercel.json` already sets the install and build commands.
3. Open **Environment Variables**, click into the first Key field and paste the whole contents of `deploy/vercel.env` (Vercel splits the `KEY=value` lines into rows; lines starting with `#` are ignored).
4. Click **Deploy**. When it finishes, note your domain, for example `blueline-abc.vercel.app`. The site will show "Sign-in isn't configured yet" until step 5.

## 5. Sign-in: GitHub and Google

Use your Vercel domain below (`https://<your-vercel-domain>`).

**GitHub OAuth app**: GitHub > Settings > Developer settings > OAuth Apps > **New OAuth App**. Homepage URL `https://<your-vercel-domain>`; Authorization callback URL `https://<your-vercel-domain>/api/auth/callback/github`. Register, then **Generate a new client secret**. Copy the Client ID and the secret.

**Google OAuth client**: <https://console.cloud.google.com> > APIs & Services > **OAuth consent screen**: User type External, fill the app name and your email, and under **Test users** add your own email (Testing mode is fine). Then APIs & Services > Credentials > **Create credentials** > **OAuth client ID** > Web application. Authorized redirect URI `https://<your-vercel-domain>/api/auth/callback/google`. Copy the Client ID and secret.

Add the four variables in Vercel (Project > Settings > Environment Variables): `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (you can add just one provider; its button is the only one shown). Then **Deployments** > the latest one > **...** > **Redeploy**. Each button appears only when both its ID and secret are set.

## 6. GitHub Actions secrets

In the GitHub repo: **Settings** > **Secrets and variables** > **Actions** > **New repository secret**. For each line of `deploy/github-secrets.txt`, the name is the text before the first `=` and the value is everything after it: `DATABASE_URL`, `DATABASE_URL_OWNER`, `DATABASE_URL_DIRECT`, `ODDS_PROVIDER`, `SGO_API_KEY`, `ODDS_MONTHLY_BUDGET`, `BACKUP_PASSPHRASE`. Until these exist, the scheduled Ingest and Backup workflows skip with a notice instead of failing. Keep `BACKUP_PASSPHRASE` somewhere safe as well: backups cannot be restored without it.

## 7. Check it works

1. GitHub > **Actions** > **Ingest** > **Run workflow** > job `daily`. Wait for green.
2. Open `https://<your-vercel-domain>`, sign in with an allowed email, and open **/status**: every job should show OK and the row counts should be non-zero.
3. Optional: Actions > **Backup** > Run workflow once.

## Troubleshooting

- **"This email isn't on the BlueLine allowlist" (AccessDenied)**: the email you signed in with is not in `ALLOWED_EMAILS` (Vercel env, comma list, case-insensitive). Fix it, redeploy. GitHub uses your _verified_ email, so check it at github.com/settings/emails.
- **`redirect_uri_mismatch` (Google) or a callback error (GitHub)**: the callback URL in the OAuth app must exactly match `https://<your-vercel-domain>/api/auth/callback/google` (or `/github`): https, no trailing slash, the same domain you open in the browser.
- **Sign-in page says it is not configured**: the `AUTH_*_ID` and `AUTH_*_SECRET` pair is missing or empty in Vercel, or you have not redeployed since adding it.
- **Board is empty**: run Actions > Ingest > `daily` (box scores, precompute), then `odds`. A day with no games also leaves it empty.
- **Vercel build fails** with a corepack or pnpm error: make sure `ENABLE_EXPERIMENTAL_COREPACK=1` is set in Vercel (it is in `deploy/vercel.env`), the Root Directory is `apps/web`, and "Include source files outside of the Root Directory" is enabled (the default).
- **Everyone is signed out / sign-in loops**: `AUTH_SECRET` is missing in Vercel.
- **Database password failed after re-running `setup:live`**: each run issues new role passwords. Re-paste `DATABASE_URL` from `deploy/vercel.env` into Vercel and update the Actions secrets from `deploy/github-secrets.txt`, then redeploy.
