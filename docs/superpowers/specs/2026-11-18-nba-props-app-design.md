# BlueLine: NBA Player Props Research App (Design Spec)

- **Date:** 2026-11-18
- **Status:** Draft for review
- **Working name:** BlueLine (can be renamed; must not use Duke marks or logos)

## 1. Goal

BlueLine is a personal and small-group web app (PWA) for researching NBA player props, with features similar to Props Madness. For every prop on tonight's slate, it shows:

- the best line and price across sportsbooks
- how often the player has cleared that line over several windows
- the matchup context: opponent defense vs position, rest, and injuries or teammates out
- powerful filters for finding spots

It is a research tool only. It never takes bets or handles money.

### In scope (v1)

- **Slate:** today's and upcoming NBA games.
- **Prop board:** every prop with L5/L10/L20/Season/H2H/Last-season hit rates, edge, and best price.
- **Prop detail:** a game-log bar chart against the line, splits, DvP, H2H, line movement, and injury context.
- **Matchup context:**
  - defense vs position (DvP) and H2H
  - with/without-teammate splits
  - injury report
- **Line shopping** across books, with the best price highlighted.
- **Favorites (watchlist) and a parlay/slip builder,** with automatic grading of saved slips.
- **Filters:** board-level and detail-level split filters (§6), plus saved presets and shareable URLs.
- **Simple accounts** for a small allowlisted group.

### Out of scope (v1)

- Other sports
- ML projections
- Payments or subscriptions
- Push alerts
- Native apps
- Public sign-up
- Data export endpoints (provider terms forbid redistribution)

## 2. Reference research (GitHub)

| Source | What we adopt |
|---|---|
| `VishalT25/propscope` | "Jobs fetch, pages read". Vendor adapters plus a fixture provider. Raw payloads stored before parsing. Append-only odds, so line movement and closing lines fall out of simple queries. Slip grading from box scores. SportsGameOdds free tier is enough. |
| `WalrusQuant/open-prop` | Counting rules: a 0-minute game is a DNP, not a miss. Integer-line handling. |
| `randyb-fowler/nba-prop-analyzer`, `npatel0126/free-throw` | ESPN public endpoints for schedule, box scores, and injuries (no key). Combo markets (PRA, PR, PA, RA). |
| `swar/nba_api` | **Not used.** stats.nba.com times out and blocks cloud IPs (many open issues). |
| Props Madness, Props.Cash, Outlier (public docs) | Filter vocabulary: home/away, back-to-back and rest, H2H, teammates in/out, usage, minutes, defense-rank tiers (Best/Good/Bad/Worst), DvP, odds range, line movement. |

## 3. Architecture

```
GitHub Actions cron ─▶ apps/worker ─▶ adapters (ESPN | SportsGameOdds | TheOddsAPI | Fixtures)
                                         │
                                         ▼
                              raw_payloads (stored first)
                                         │ parse
                                         ▼
                        normalized tables (Neon Postgres)
                                         │ precompute
                                         ▼
                              prop_metrics, team_dvp
                                         ▲
Browser (PWA) ─▶ Vercel: apps/web (Next.js App Router + Route Handlers) ─┘  (reads only)
```

### Monorepo layout (pnpm workspaces + Turborepo, TypeScript strict)

```
apps/web            Next.js (latest stable) App Router UI, Route Handlers (/api/*), Auth.js
apps/worker         CLI entrypoints for jobs: ingest:schedule, ingest:boxscores,
                    ingest:injuries, ingest:odds, precompute, grade-slips
packages/contracts  Zod schemas shared by UI and server: FilterState, API DTOs, enums
packages/analytics  Pure functions: hit rates, edge, devig, DvP, splits, parlay math
packages/adapters   Provider adapters behind one interface + fixture provider
packages/db         Drizzle ORM schema, migrations, typed query helpers
packages/ui         Design tokens + shared React components (Duke-blue system)
infra/              docker-compose (local Postgres), GH Actions workflows, scripts
```

### Rules

1. **Jobs fetch, pages read.** A web request never calls an external API.
2. **Adapters only.** Adapters are the only code that knows a vendor's JSON shape. Everything downstream uses `packages/contracts` types.
3. **Raw payloads first.** Every external response is written to `raw_payloads` before parsing, so parsers can be re-run without spending API budget.
4. **Append-only odds.** A `prop_offers` row is inserted only when line or price changes.
5. **Fixtures by default.** Dev and CI use the fixture provider, so they cost $0 and never hit live APIs.

### Data sources

| Data | Provider | Cost |
|---|---|---|
| Schedule, rosters, box scores, injuries | ESPN public site API | Free, no key |
| Player prop lines (primary) | SportsGameOdds free tier | $0, key required |
| Player prop lines (alternate) | The Odds API (`ODDS_PROVIDER=theoddsapi`) | Free 500 credits or $30/mo |
| Game spread and total | Same odds provider (featured markets) | Small |

**Budget guard:**

- The worker records units spent per provider in `api_usage`.
- It refuses a pull that would exceed the monthly budget set in `ODDS_MONTHLY_BUDGET`.
- On a short budget it degrades to fewer markets, in priority order: PTS, PRA, REB, AST, 3PM, then the rest.

### Job schedule (America/New_York; GH Actions cron is UTC)

| Job | When |
|---|---|
| `ingest:boxscores` → `precompute` → `grade-slips` | 06:00 daily |
| `ingest:schedule` | 06:15 daily (next 7 days) |
| `ingest:injuries` | Hourly, 10:00–23:00 |
| `ingest:odds` | Every 2h, 12:00–18:00 on game days |
| `ingest:odds --closing` | Every 15 min, 17:00–23:00; pulls only games tipping within 45 min |
| `precompute --incremental` | After every odds or injury ingest |

Each run writes a `job_runs` row (status, duration, units spent, error). A failed run fails the GH Actions job, which emails the repo owner.

## 4. Data model (Drizzle / Postgres)

- `teams` (id, abbr, name, espn_id)
- `players` (id, espn_id, name, team_id, position G/F/C, active)
- `games` (id, espn_id, date, tip_at, home_team_id, away_team_id, status, home_score, away_score, spread, total)
- `player_game_logs`:
  - columns: player_id, game_id, team_id, opp_team_id, is_home, started, minutes, pts, reb, ast, fg3m, stl, blk, tov, fga, fta, usage_proxy, dnp
  - unique (player_id, game_id)
- `injuries` (player_id, status, detail, captured_at): snapshots
- `prop_offers`:
  - columns: id, game_id, player_id, market, line, over_price, under_price, book, captured_at, is_closing
  - append-only
- `prop_current`: view returning the latest offer per (game, player, market, book)
- `prop_metrics`:
  - one row per (game, player, market, side, line): the main board line, which is the most common line across books
  - hit_l5/l10/l20/season/h2h/last_season, games_* (sample sizes), avg, median, edge_avg, edge_median
  - streak, best_price, best_book, implied_prob_novig, value
  - dvp_rank, dvp_tier, rest_days, is_b2b, is_home, minutes_l5, usage_l10
  - player_injury_status, teammates_out (jsonb)
  - line_open, line_move, game_total, game_spread, computed_at
- `team_dvp` (team_id, position, market, window 'l15'|'season', allowed_per_game, rank, tier)
- `raw_payloads` (id, provider, endpoint, params, fetched_at, body jsonb)
- `api_usage` (provider, month, units)
- `job_runs` (job, started_at, finished_at, status, units, error)
- `users` (id, email, name), plus Auth.js tables
- `favorites` (user_id, prop key)
- `filter_presets` (user_id, name, filter_state jsonb)
- `slips` (user_id, name, book, stake, created_at)
- `slip_legs`:
  - columns: slip_id, game_id, player_id, market, side, line, price, result
  - result: hit, miss, push, void, or pending

Indexes on `prop_metrics` cover every board filter column used in `WHERE` or `ORDER BY`.

## 5. Analytics (packages/analytics, pure and unit-tested)

**Markets:**

| Group | Markets |
|---|---|
| Single stats | PTS, REB, AST, 3PM, STL, BLK, TOV |
| Combos | PRA, PR, PA, RA, Stocks (STL+BLK) |

**Hit rate:**

- A game hits when `stat > line` for the Over (`stat < line` for the Under).
- `stat == line` (whole-number lines only) is a **push**: shown separately and excluded from the denominator.
- **DNP and 0-minute games are excluded.** They are not misses.
- The sample size is always shown next to the rate.

**Windows:** L5, L10, L20, Season (current season), H2H (vs tonight's opponent, current and last season), Last season.

**Edge:** `avg − line` and `median − line` over L10 (sign flipped for Unders).

**Odds math:**

- Convert American odds to implied probability.
- **Devig** with the two-way multiplicative method using the same book's over and under. When several books carry the market, use the consensus (mean of no-vig probabilities).
- `value = hit_l10 − implied_prob_novig`.

**DvP:**

- Allowed stat per game to each position (G/F/C) over the last 15 games and the season, normalized by league average.
- Ranked 1–30 (1 = toughest).
- Tiers: **Best** 1–6, **Good** 7–15, **Bad** 16–24, **Worst** 25–30.

**Context:**

- **Rest:** days since the team's previous game; a back-to-back is `rest_days == 0`.
- **Teammate splits:** split a player's logs into games where teammate X played (minutes > 0) and games X did not.
- **teammates_out:** teammates with injury status Out or Doubtful on game day, ranked by minutes.

**Streak:** consecutive most-recent hits, or misses as a negative number.

**Parlay:**

- Payout: the product of decimal odds.
- Historical "all legs hit" rate:
  - same player: computed over shared games
  - different players: computed over games both played
  - otherwise: legs treated as independent, with a label saying so
- Legs from the same game are flagged "correlated".

**Grading:** after box scores land, each slip leg is resolved:

- **hit / miss / push**
- **void** for a DNP or a postponed game

## 6. Filters

### 6a. Prop board filters (server-side SQL over `prop_metrics`)

All of these live in one shared Zod `BoardFilterState` and round-trip through the URL query string.

| Group | Filters |
|---|---|
| Scope | Date/slate, games (multi), teams (multi), position (G/F/C), player search |
| Market | Markets (multi), side (Over/Under/Both) |
| Performance | Hit-rate floor per window (L5/L10/L20/Season/H2H, e.g. L10 ≥ 70%), minimum sample games, streak ≥ N, edge (avg−line) ≥ X |
| Price | Odds range (e.g. −200 to +150), books included, "best price only", value ≥ X% |
| Matchup | Opponent DvP tier (Best/Good/Bad/Worst), DvP rank range |
| Situation | Home/Away, back-to-back, rest days, game total range, spread range (blowout risk) |
| Role | Minutes L5 ≥ X, usage L10 ≥ X, starter only |
| Health | Exclude players Questionable or worse; only props where a key teammate is Out |
| Market moves | Line moved ≥ X since open (direction) |
| Sort | Hit rate (any window), edge, value, odds, line movement, tip time |

- **Presets:** saved per user.
- **Built-in presets:**
  - "L10 Locks" (L10 ≥ 80%, n ≥ 8)
  - "Soft Matchups" (DvP Worst, L10 ≥ 60%)
  - "Teammate Out Boost"
  - "Plus-money Value" (odds ≥ +100, value ≥ 5%)

### 6b. Prop detail split filters (client-side over the player's game logs)

These are applied instantly. Chart, averages, and hit rates all recompute. Toggles:

- Home/Away
- Rest (B2B / 1 / 2+)
- vs tonight's opponent
- With/without teammate (picker)
- Minutes ≥ X
- Opponent DvP tier at game time
- Starter/Bench
- Season (current/last)
- Window (L5/L10/L20/All)
- Win/Loss

The line is adjustable (slider or alt lines) and all rates recompute.

## 7. UI and design system (Duke-inspired blue and white)

**Approved visual reference:** the BlueLine UI Design canvas (https://claude.ai/artifact/HRc8K2mKCWPJaN9F28AAJT). It has four artboards:

- Prop board (desktop)
- Prop detail (desktop)
- Prop board (phone)
- Design system

The design agent builds `packages/ui` to match it.

**Process rules:**

- The design agent follows `frontend-design:frontend-design` and the system rules of `taste-skill:design-taste-frontend`:
  - one button and card family, one radius scale
  - the real product UI rather than a generic dashboard
  - visible hover and press feedback, 44px targets, no violet
- The finished UI is audited with `web-design-guidelines` and `chrome-devtools-mcp:a11y-debugging`.
- **No Duke logos, wordmarks, or the "Blue Devils" name.** Only the colors are borrowed.

### Signature: "the line"

Every prop row carries a **last-10 strip**:

- 10 small bars rising (Duke Blue, cleared) or dropping (slate, missed) from a hairline at the prop's line.
- Oldest game on the left.
- Bar length is the margin, so close calls look close.

The prop detail page repeats it at full size: a game-log bar chart with the line drawn across it as a navy rule labeled with the number. The logo mark is a tiny version of the strip.

### Color tokens (CSS variables in `packages/ui`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--brand` (Duke Blue, fills) | `#00539B` | `#2A72C0` | Hit bars, chips, primary buttons (white text passes on both) |
| `--brandText` | `#00539B` | `#5AA2EE` | Links, positive edge, brand-colored text |
| `--chrome` | `#012169` | `#020A1E` | Top bar |
| `--heading` | `#012169` | `#EAF1FB` | Display headings |
| `--bg` | `#FFFFFF` | `#06122B` | Page background |
| `--surface` (Mist) | `#F4F7FB` | `#0A1936` | Surfaces, filter panels |
| `--ink` | `#0A1730` | `#EAF1FB` | Body text |
| `--muted` | `#51627E` | `#93A4C0` | Labels, meta text (6.2:1 on white, 6.9:1 on dark surface) |
| `--line` | `#DCE4EF` | `#1D3157` | Borders and dividers |
| `--miss` (slate) | `#7F92AD` | `#566C91` | Misses in charts (3:1 graphic contrast on both grounds) |
| `--push` | `#E0B53B` | `#E0B53B` | Pushes |
| `--signal` | `#9A3412` | `#F4A27A` | Only for tough matchups and Questionable |
| `--danger` | `#B42318` | `#F97066` | Only for Out |

**Theme toggle.**

- A sun/moon button sits in the top bar of every page and on the intro.
- First visit follows `prefers-color-scheme`.
- The choice is saved per user (cookie, so the server renders the right theme with no flash) and applied as `data-theme` on `<html>`.
- All colors come from these tokens. Components never hard-code a hex.
- Dark heat scale:

| Range | Background | Text |
|---|---|---|
| under 40% | `#0E1E3D` | `#93A4C0` |
| 40–54% | `#15305A` | `#EAF1FB` |
| 55–69% | `#1F4A85` | `#FFFFFF` |
| 70–84% | `#2A72C0` | `#FFFFFF` |
| 85%+ | `#5AA2EE` | `#06122B` |

The full token set (hover, segmented, badge, defense-chip and chrome tokens) lives in the canvas's Prop board artboard and is copied verbatim into `packages/ui/tokens.css`.

### Intro page (`/welcome`, shown before the board)

- **Design, not copy.** The only words are:
  - the wordmark (**BLUE** solid, **LINE** outlined)
  - one line: "NBA player props, read against the line."
  - the "Enter the board" button
  - tonight's slate in mono at the bottom
- **Visuals and motion (CSS only, no WebGL):**
  - half-court geometry draws itself in on load (stroke-dash animation)
  - rings ripple out of the center circle every 1.6s
  - a full-width glowing rule (the line), with game-log bars growing out of it on load, breathing, and streaming right-to-left in a seamless 38s loop like a live ticker
  - a light pulse travels along the line every 3.6s
  - a highlight sweeps across the outlined "LINE"
  - a pause-motion button stops every loop; reduced-motion users get a still frame
- **Dark by default** (navy-black ground with a soft blue glow); the light version is white with Duke Blue bars.
- Shown on first visit and from the logo. A "skip intro" preference sends returning users straight to the board.

**Hit-rate heat scale.** The number and the fraction are always printed in the cell, and every step passes 4.5:1. The active window gets a 2px navy inset ring.

| Range | Background | Text |
|---|---|---|
| under 40% | `#F4F7FB` | `#51627E` |
| 40–54% | `#E3ECF7` | `#0A1730` |
| 55–69% | `#BCD3EC` | `#0A1730` |
| 70–84% | `#2E6DB0` | `#FFFFFF` |
| 85%+ | `#00539B` | `#FFFFFF` |

**Defense chips are side-aware.** They are blue when the matchup favors the chosen side (a soft defense for an Over) and orange when it hurts.

### Type

| Role | Face | Where |
|---|---|---|
| Display | **Big Shoulders** 700–800, uppercase | Page titles, player names, big hit rates only |
| UI | **Archivo** 400–700 | All interface text; sizes 12/13/14/15/17 |
| Data | **IBM Plex Mono** 500–600 | Lines, odds, fractions |

**Tabular figures everywhere.**

### Shape, spacing, motion

- **Radius scale:** 6 (badges), 10 (inputs/chips), 16 (cards/panels), 22 (sheets). Pills for filter chips.
- **Spacing:** 4px base; page gutters 24px desktop, 16px phone; max content width 1440px.
- **Motion:**
  - hover lifts cards 2px
  - buttons darken on hover and nudge 1px on press
  - chart bars ease height on split changes (250ms)
  - the bottom sheet slides up
  - everything is disabled under `prefers-reduced-motion`
  - no scroll-triggered animation

### Layout

- **Desktop:** navy top bar (wordmark, nav, search, data timestamp, slip button) → slate strip of tonight's games (click to filter) → left filter rail + prop board.
- **Board:** a 13-column ARIA grid that scrolls sideways inside its own box: favorite, player, prop, best price, last-10 strip, L5/L10/L20/Season/H2H heat cells, edge, opponent defense, add to slip.
- **Prop detail:**
  - header with monogram, name, market tabs, Over/Under, and an alt-line stepper (±0.5)
  - five big hit-rate tiles
  - game-log chart with split chips: window, venue, rest, vs opponent, without teammate, 30+ minutes, soft defenses
  - side column: line shopping (best price highlighted, no-vig fair chance), matchup, injury report, line movement
- **Phone:**
  - compact navy header, then a horizontal row of quick filters: Filters button with active count, "L10 70%+", "Overs", "Soft matchups", "Teammate out"
  - prop cards: strip, edge, defense chip, 5 heat cells, add button
  - full filters in a bottom sheet with a "Show N props" button
  - 4-tab bottom bar
- **Player and team icons** are generated monograms. Sportsbooks are text badges, never logos.
- **PWA:** manifest, icons, offline shell (last loaded board readable offline).

### Pages and copy

**Pages:**

- `/` board
- `/games` and `/games/[id]`
- `/props/[playerId]/[market]` detail
- `/slips`
- `/favorites`
- `/settings` (books, odds format American/decimal, theme)

**Copy rules:**

- Buttons name the action ("Add to slip", "Reset filters", "Show 6 props").
- Empty states say what to change ("Lower the hit-rate floor or widen the price range").
- Every page carries the responsible-gambling line: "Research only, not betting advice. 21+. Gambling problem? Call 1-800-GAMBLER."

## 8. Security

**Authentication:**

- Auth.js v5 with Google and GitHub OAuth.
- **Email allowlist** set in `ALLOWED_EMAILS`. Anyone else is rejected at sign-in.
- No passwords are stored.

**Authorization:**

- Every `/api/*` route and page requires a session, except the sign-in page and the health check.
- User-owned rows are filtered by `session.user.id` server-side, which prevents IDOR.

**Input handling:**

- Every route parses input with `packages/contracts` Zod schemas. Unknown keys are rejected; sizes and ranges are bounded.
- SQL only through Drizzle's parameterized queries. Sort columns come from an enum allowlist.

**Rate limiting:** per-user token bucket on API routes (60 requests/min), using the Upstash Redis free tier, or in-memory in dev.

**Headers:**

- Strict CSP with nonces, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`.
- Cookies are secure and httpOnly.

**Secrets:**

- Stored only in Vercel and GitHub encrypted secrets. Never exposed with the `NEXT_PUBLIC_` prefix. `.env.example` is committed; `.env` is git-ignored.
- **gitleaks** runs in CI.

**Database least privilege:**

| Role | Access |
|---|---|
| `web_role` | SELECT on data tables; read/write only on user tables |
| `worker_role` | Writes data tables; no access to user tables |
| Migrations | Use the owner role from CI only |

**Supply chain:** Dependabot, `pnpm audit` in CI, a committed lockfile, and pinned GH Action SHAs.

**Provider terms:** no export or redistribution endpoints. Books are shown as text badges, not logos.

**Review:** a security agent reviews the final diff (the `security-review` skill). An optional Strix pentest runs against a preview deploy.

## 9. DevOps

**Local development:**

- `docker compose up` starts Postgres.
- `pnpm dev` runs the web app.
- `pnpm worker <job>` runs jobs against fixtures by default.

**CI (GitHub Actions, on PR):**

- install
- lint (ESLint + Prettier)
- typecheck
- unit tests (Vitest)
- adapter fixture tests
- DB integration tests (Postgres service container)
- build
- Playwright E2E on fixture data
- gitleaks and audit

**CD:**

- Vercel preview deploy per PR, with a Neon branch per preview.
- Merging to `main` runs migrations (`drizzle-kit migrate`), then Vercel deploys to production.

**Scheduled jobs:** GH Actions cron workflows in `infra/workflows` call `pnpm worker …` with production secrets. There is a concurrency group per job, so runs never overlap.

**Observability:**

- `job_runs` table plus a `/status` page (last run per job, API budget used this month, row counts).
- GH Actions failure emails.
- Optional Sentry free tier for the web app.

**Backups:** Neon's built-in restore window, plus a weekly `pg_dump` uploaded as a 30-day GH Actions artifact.

**Cost target:** $0/month (Vercel Hobby, Neon Free, GH Actions free minutes, SportsGameOdds free, Upstash free).

## 10. Micro-agent assignment

Each agent works in its own git worktree against the shared contracts, and the lead (main session) merges.

| Wave | Agent | Owns |
|---|---|---|
| 0 | Lead | Monorepo scaffold, `packages/contracts` (Zod), `packages/db` schema and migrations: the shared contract everything else builds on |
| 1 | **Data agent** | `packages/adapters` (ESPN, SportsGameOdds, TheOddsAPI, Fixtures with recorded payloads), `apps/worker` ingest jobs, raw-payload store, budget guard |
| 1 | **Logic agent** | `packages/analytics` with TDD: hit rates, pushes/DNP, edge, devig, DvP tiers, splits, streaks, parlay, grading |
| 1 | **Design agent** | `packages/ui` tokens and components (board row/card, heat cell, game-log bar chart, filter rail/sheet, slip drawer), page shells running on fixture DTOs |
| 1 | **DevOps agent** | Turborepo pipeline, docker-compose, CI workflow, cron workflows, Vercel/Neon config, `/status` data |
| 2 | **Backend agent** | `precompute` job (analytics → `prop_metrics`/`team_dvp`), Route Handlers, queries, favorites/slips CRUD |
| 2 | **Filters agent** | `BoardFilterState` → SQL query builder, URL sync, presets, filter UI wiring, detail split filters |
| 3 | **Security agent** | Auth.js plus allowlist, middleware, rate limiting, headers/CSP, DB roles, gitleaks; final security review |
| 3 | Lead | Integration, Playwright E2E, verification, docs |

## 11. Testing

**Analytics:**

- Table-driven Vitest cases for every rule in §5, including pushes, DNPs, empty samples, and Under side.
- Target is about 100% branch coverage.

**Adapters:** parse recorded real payloads from `fixtures/` and snapshot the normalized output.

**DB and queries:** each board filter is tested against a seeded Postgres.

**E2E (Playwright on fixture data):**

- load board, apply filters, URL round-trip
- open detail, toggle splits
- build slip, save, grade

**Accessibility:** axe checks in E2E; contrast meets WCAG AA in both themes.

## 12. Risks

- **ESPN endpoints are unofficial and may change.** Mitigation: adapter isolation, stored raw payloads, and job failure alerts.
- **SportsGameOdds free tier may fall short.** Mitigation: the budget guard and a one-setting switch to The Odds API.
- **GH Actions cron can be delayed by a few minutes.** This is acceptable, since the closing-line window is 45 minutes.
- **Player position from ESPN is coarse (G/F/C).** DvP uses those three buckets in v1.
