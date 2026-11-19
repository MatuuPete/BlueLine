# SDD ledger — plan: docs/superpowers/plans/2026-11-18-blueline-v1.md

Spec: docs/superpowers/specs/2026-11-18-nba-props-app-design.md (reachable). Branch build/v1, baseline 2d7b9fc. User approved local commits on build/v1 (2026-11-18).

## Pre-flight scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T2 → T4,T5,T7,T10,T11,T12 | contracts enums/filters/dto/normalized | OK, single source |
| T3 → T6,T9,T10,T11 | db schema incl. propMetrics explicit columns | T9 writes and T10 reads the same columns; defined once in T3 → OK |
| T5 → T6 | StatsProvider/OddsProvider/HttpDeps | Same agent, sequential → OK |
| T4 → T9, T12 | analytics fns (LogLine) | T12 runs splits client-side with analytics → analytics must be browser-safe (pure, no node imports) → OK by design |
| T7 → T10, T12 | ui components | T10 FilterRail uses T7 Chip/Segmented → T10 after T7 → OK (Wave 2) |
| T10 ↔ T12 | FilterRail/FilterSheet in apps/web/app/(app)/_components | T12 pages consume; T12 must not recreate them → see ruling R3 |
| T11 ↔ T13 | routes call auth() before T13 exists | CONFLICT → ruling R2 |
| T13 ↔ T14 | AUTH_DEV_BYPASS used by E2E | OK |
| T1 vs all | "no new deps after T1" | T7/T12 need `next/font` (in next), T4 coverage needs `@vitest/coverage-v8` → add to T1 list (ruling R4) |
| Spec §9 vs env | docker-compose Postgres | Docker absent → PGlite (already in plan) |
| Each task self-consistency | tests vs interfaces | T4 parlay example: -110,-110 → 1.9091² = 3.6446, american +264 ✓; edge median of sorted [19,22,25,26,27,28,29,30,31,33] = 27.5 ✓ |

## Rulings

- Ruling R1: Wave 0 (Tasks 1–3) is dispatched to one Foundation implementer (opus) instead of being written by the lead — keeps the controller context clean; the three tasks are one coherent foundation. Cost if wrong: one extra review cycle.
- Ruling R2: T11 creates `apps/web/lib/session.ts` exporting `getUserId(): Promise<string|null>` (dev bypass: AUTH_DEV_BYPASS=1 and NODE_ENV!=='production' → fixed dev user id `dev-user`, upserted into users; otherwise null). T13 reimplements it on Auth.js `auth()` without changing the signature. Cost if wrong: T13 touches every route instead of one helper.
- Ruling R3: T10 owns the filter components; T12 imports them and only lays them out. Cost if wrong: duplicated UI.
- Ruling R4: T1 also installs `@vitest/coverage-v8`, `@vitejs/plugin-react` (vitest jsx for ui tests), `jsdom`. Cost if wrong: none.
- Ruling R5: User asked for parallel micro-agents, which overrides the skill's "never parallel". Waves run in parallel ONLY inside isolated git worktrees, on disjoint directories, with no dependency changes; the lead merges each worktree branch into build/v1. Cost if wrong: merge conflicts, resolved by the lead.

## Progress
- Wave 0 (Tasks 1-3): dispatched to Foundation implementer (opus), BASE 2d7b9fc
- Wave 0 implementer: DONE_WITH_CONCERNS, commits 2d7b9fc..657f89a (b41b7d2, af8b1d5, d796a98, 657f89a), 38/38 tests
- Ruling R6: accept extra deps vite, pnpm (root dev dep for turbo), @types/react-dom, @testing-library/dom, next as ui peer; TypeScript pinned 6.0.3 for typescript-eslint — all needed by tooling — cost if wrong: none functional.
- Ruling R7: Wave 2+ agents import drizzle operators (eq, and, sql, ...) from @blueline/db re-exports, never from drizzle-orm directly. Db type uses DbQueryResultHKT (execute returns {rows}). Cost if wrong: import churn.
- User directive (2026-11-18, late): finish the build unattended, then shut down the PC. No questions possible — rule on everything. End: commit, write BUILD-REPORT.md, shutdown /s /t 120.
- Wave 0 review: spec ❌ (1 Important: plus-money preset), quality otherwise approved.
- Ruling R8: Plus-money preset = { oddsMin: 100, minValue: 5 } per spec §6a ("odds >= +100, value >= 5%"); plan text was wrong — spec is binding. Cost if wrong: preset shows fewer rows.
- Ruling R9: absSpreadMax (max |spread|) satisfies spec §6a "spread range (blowout risk)". Cost if wrong: add spreadMin/Max later.
- Ruling R10 (carry to T9/T10): filter percentages (minHitRate, minValue, minUsage) are 0..100; DB rate_*/value/usage are 0..1. T10 converts with one helper `pct(x)=x/100`. Cost if wrong: x100 filter bug — covered by T10 tests.
- Ruling R11 (carry to T10/T12): pages strip unknown query keys (utm_*, fbclid…) before parseBoardFilter; invalid filter → fall back to DEFAULT_BOARD_FILTER, never a 500. Cost if wrong: tracked links 500.
- Task 0: minor (deferred): no contracts↔db drift test; pg path of createDb untested; migration no trailing newline.
- Wave 0: fix round 1/5 dispatched (preset) to original implementer; Wave 1 dispatched in parallel worktrees from 657f89a (T4 logic, T5+T6 data, T7 design, T8 devops) — preset change is disjoint from Wave 1 files.
- Wave 0: fix round 1/5 commit 9947a6b (preset + units doc); scoped re-review dispatched (haiku).
- Ruling R12: harness worktree isolation refused (drive-letter case mismatch d: vs D:); lead created sibling worktrees at d:/Codes/blueline-wt/{t4-analytics,t5-data,t7-ui,t8-devops} on branches wave1/* from 9947a6b. Cost if wrong: none (equivalent isolation).
- Wave 1 dispatched (BASE 9947a6b): T4 sonnet, T5+T6 opus, T7 opus, T8 sonnet.
- Wave 0 re-review: 2/2 ADDRESSED, no new breakage.
- Task 1-3 (Wave 0): complete (commits 2d7b9fc..9947a6b, review clean after 1 fix round)
- Task 0: minor (deferred): minValue doc says 0..100 but validator allows -100..100 (value can be negative) — doc nit.
- Task 8: implementer DONE_WITH_CONCERNS, commit 24adeeb on wave1/t8-devops (actionlint unverified; e2e guard will run now; pnpm audit may fail)
- Task 8: review Approved w/ 1 Important (pg_dump client version) → fix round 1/5 dispatched (+3 minors: step-scoped secrets, shared ingest concurrency group, runbook notes)
- Task 4: implementer DONE_WITH_CONCERNS, commit 25898a5 on wave1/t4-analytics, 81 tests, 100% coverage
- Ruling R13: devigTwoWay(-120,+100).over = 0.5217 (0.54545/1.04545); the plan's 0.5238 was an arithmetic error — spec's multiplicative method is binding. Cost if wrong: none.
- Ruling R14: accept T4 implementer choices: h2h = vs opponent in current+previous season (spec §5); lastSeason = season−1; bestPrice tie → first; dvpRank tie → teamId; jointHitRate excludes games where any leg pushes; parlay american unrounded. Cost if wrong: small display differences.
- Task 4: minor (deferred): no separate RED run recorded (tests written alongside code).
- Task 8: fix round 1/5 commit 1d7db79 (PGDG pg_dump PG_MAJOR=17, step-scoped secrets, shared `ingest` concurrency group, runbook notes); scoped re-review dispatched.
- Task 8: minor (deferred): shared concurrency group keeps only one pending run — a queued run can be superseded (documented in RUNBOOK). Acceptable: next scheduled run repeats the work.
- Task 4: complete (commits 9947a6b..25898a5, review clean) — merged into build/v1
- Task 4: minor (deferred): parlay([]) → american −Infinity (no guard); dvpRank comparator returns 1 on equal ids; redundant null check hitrate.ts:199; restDays clamps negative gaps silently.
- Task 8: fix round 1/5 re-review: 4 addressed, 1 NEW Important (shared group drops once-daily runs; false runbook claim — caused by controller's round-1 suggestion).
- Ruling R15: per-job-type concurrency groups (ingest-<job>), cancel-in-progress false; concurrent precompute across job types accepted because upserts are idempotent. Cost if wrong: brief write contention at 23:00 UTC.
- Task 8: fix round 2/5 dispatched.
- Task 8: fix round 2/5 (d6ebf2c) re-review: fingerprint ADDRESSED; concurrency + runbook NOT ADDRESSED (group keyed on cron string, not job name).
- Ruling R16: concurrency group key = job name via an inline chained expression mirroring the map step (both kept in sync, commented). Cost if wrong: drift between the two mappings → duplicate overlap, caught by the comment.
- Task 8: fix round 3/5 dispatched.
- Task 8: fix round 3/5 (db2335a) re-review: 3/3 ADDRESSED, no new breakage.
- Task 8: complete (commits 9947a6b..db2335a, review clean after 3 rounds) — merged into build/v1
- Task 8: minor (deferred): `date` input silently ignored for non-daily jobs; cron strings duplicated in 3 places (comments keep sync); workflows unverified by actionlint.
- Overnight: T5+T6 and T7 agents hit the account 5-hour rate limit (reset 09:30 Asia/Taipei); partial work preserved uncommitted in their worktrees. No PC shutdown happened (build unfinished).
- 2026-11-18 16:04 TST: user said "continue the build" → resumed T5+T6 and T7 agents via SendMessage. Shutdown directive considered superseded (user is back); not shutting down unless asked again.
- User (2026-11-18): do NOT shut down the PC. Shutdown step removed from the finish plan.
- Task 7: implementer DONE_WITH_CONCERNS, commit c19fc0d on wave1/t7-ui, 87 tests.
- Ruling R17 (carry to T12): apps/web root layout applies `fontVariables` from @blueline/ui/fonts on <html>, imports @blueline/ui/tokens.css, and sets data-theme before paint (cookie → else inline script reading prefers-color-scheme). Cost if wrong: theme flash.
- Ruling R18 (carry to T12): /welcome layout must not wrap IntroScene in another <main> (IntroScene owns its <main>). Cost if wrong: a11y landmark nesting.
- Ruling R19: chart misses use --miss token (3:1 contrast) instead of canvas #B9C6D8 — spec §7 contrast rule wins over the mockup. Extra tokens (dark --toughBd, --veil, --scrim, --cardShadow) accepted. Cost if wrong: slightly darker miss bars.
- Task 7: complete (commits 9947a6b..c19fc0d, review clean) — merged into build/v1
- Task 7: minor (deferred): intro pulse animates `left` (layout per frame); unfavorited star ~3:1; DefenseChip favorable/tough direction by tint for sighted users (text tier+rank printed); grade() duplicated in HitStrip & GameLogChart.
- Ruling R20: lead added `"./queries/*": "./src/queries/*.ts"` export to @blueline/db (commit on build/v1) so T10/T11 add query modules without both editing src/index.ts/package.json. Consumers import '@blueline/db/queries/board' etc. Cost if wrong: none.
- Wave 2 partial dispatch: T10 (filters) and T11 (API) in worktrees wave2/t10-filters, wave2/t11-api; T9 waits for T6 merge; T12 waits for T10+T11.
- Task 11: implementer DONE_WITH_CONCERNS, commit 14ec9d1 on wave2/t11-api (db 26 + web 11 tests). board.ts placeholder → resolve merge toward T10's real file.
- Ruling R21: T11 extras accepted (queries/status.ts, async getDb(), DELETE /api/presets?id=, structural schema typing in lib/api.ts). Rate limiting stays in T13. Cost if wrong: minor API reshaping later.
- Task 11: review Approved w/ 1 Important (favorites FK → 500). Fix round 1/5 dispatched (+ minors: gameId/team mismatch → null, content-length check, zod id, prod-guard test).
- Task 11: minor (deferred): /api/status exposes raw job error text to authenticated users; preset POST always 201; detail logs include games after a selected past game (intended: full history view).
- Task 10: implementer DONE_WITH_CONCERNS, commit 07ec786 on wave2/t10-filters, 77 tests (51 board).
- Ruling R22: with a books filter, only best price/book are recomputed; value/implied prob stay all-book consensus (spec defines value vs market consensus). bestPriceOnly = "has a price among chosen books". Cost if wrong: value column slightly off under a books filter.
- Ruling R23 (carry to T12/T14): pages wrap components using useBoardFilter in <Suspense>; FilterSheet focus trap/Escape/restore verified in T14 Playwright + axe. Cost if wrong: a11y regression caught late.
- Task 11: fix round 1/5 commit bcdf71a (FK→400 shared helper, game/team mismatch→null, byte limit, uuid id, session tests); 44/44.
- Ruling R24: presets ?id= validated by a structural uuid regex parser (apps/web has no direct zod dep; no new deps allowed). Cost if wrong: none functional.
- Task 5+6: implementer DONE_WITH_CONCERNS, commits 8fb00a5, 043037c, 72896eb on wave1/t5-data; 101 tests; seed → 5 games today/12 tomorrow, 30 days box scores, 4 books.
- Ruling R25: injuries are stored as whole-report batches; the CURRENT report = all rows with captured_at = the newest batch's captured_at (not latest-row-per-player). Applies to T9 (teammates_out/injury_status) and T11 getPropDetail injuries (follow-up fix). Cost if wrong: recovered players shown as out.
- Ruling R26: relative `pglite:` paths resolve against the repo root (dir containing pnpm-workspace.yaml) in BOTH worker and web, so they share one DB. Applies to T11 getDb (follow-up fix). Cost if wrong: web opens an empty DB.
- Ruling R27: SGO/The Odds API live adapters are untested against real responses (no keys); flagged in BUILD-REPORT as a known risk.
- Task 10: review Approved w/ 1 Important (QuickFilters chip 40px < 44px). Fix round 1/5 dispatched (+ minors: null-rate test, useId, count in accessible name).
- Task 5+6: review dispatched (sonnet, fixtures excluded from diff).
- Task 11: fix round 1/5 re-review: 4 addressed, 1 partial (content-length branch untested), FK helper misses drizzle-wrapped cause.code.
- Task 11: fix round 2/5 dispatched (FK cause.code + test, content-length test, R25 injuries newest-batch, R26 repo-root pglite resolve, close PGlite in test).
- Task 5+6: complete (commits 9947a6b..72896eb, review clean) — merged into build/v1
- Task 5+6: minor (deferred): empty/all-unmatched injury report leaves stale batch as newest; repeated --closing leaves multiple is_closing rows (consumers take newest); DST shift in dev fixture remap; cli config errors unhandled stack; budget not re-checked mid-run.
- Ruling R28 (carry to T9): closing line = newest row with is_closing per (game,player,market,book); line_move = current main line − FIRST captured main line. Cost if wrong: wrong movement display.
- Task 9 dispatch: worktree wave2/t9-precompute from build/v1 (includes T4 analytics + T6 worker).
- Task 10: fix round 1/5 (79d196b) re-review: 4 addressed; 36px-visual Chips/38px Segmented in FilterControls flagged.
- Ruling R29: spec §7 "44px targets" = tap/hit area; @blueline/ui Chip extends its hit area to 44px via ::after, Segmented options reach it via --target — visual height may be smaller. Cost if wrong: denser-than-ideal touch UI; verify in T14 on phone width.
- Task 10: complete (commits 8dcf7af..79d196b, review clean after 1 round) — merged into build/v1
- Task 10: minor (deferred): QuickFilters `.open` lacks position:relative for the .sr span; CSS order dependency for .chip 44px override.
- Task 11: fix round 2/5 (ea6f590) re-review: 5/5 ADDRESSED, no new breakage.
- Task 11: complete (commits 8dcf7af..ea6f590, review clean after 2 rounds) — merged into build/v1 (6bb7da0; board.ts conflict resolved to T10's real implementation).
- Task 11: minor (deferred): findRepoRoot/resolveDatabaseUrl duplicated in web + worker; no index for table-wide max(injuries.captured_at); no literal Windows-path test.
- Integration check on 6bb7da0: typecheck 7/7; vitest 424/424 (first run 1 file flaked on PGlite beforeAll 10s timeout under load — T14 raises hookTimeout).
- Task 12 dispatch: worktree wave2/t12-pages from 6bb7da0.
- 2026-11-18 18:11 TST: T9 and T12 hit the 5-hour limit (reset 21:00 TST); user said TRY AGAIN → resumed both via SendMessage (work preserved uncommitted). T12 told to commit in logical steps.
- Task 9: implementer DONE_WITH_CONCERNS, commit a242e05 on wave2/t9-precompute; 52 worker tests; seed → 5304 prop_metrics, 2160 team_dvp in 3.0s; idempotent; --incremental 1.4s.
- Ruling R30: "key teammate out" = Out/Doubtful teammate averaging ≥ 20 season minutes (defines teammate_out bool; teammates_out jsonb lists all Out/Doubtful ranked by minutes). team_dvp.allowed_per_game stored raw (ranks identical to normalized; detail UI computes vs-league-average text). game_spread = home-team spread. Cost if wrong: preset sensitivity.
- Task 9: review Approved w/ 1 Important (incremental skips DvP rebuild). Fix round 1/5 dispatched (+ delete metrics for finished games on full run; teammate minutes fallback to previous season).
- Task 9: minor (deferred): line_open uses earliest single snapshot (ingest stamps one captured_at per run → OK); dvp season window = global latest season; full log history loaded per run (fine at seed scale).
- Ruling R31 (carry to T12): board page defaults filter.date to today's NY date when absent, in addition to T9 deleting finished-game rows. Cost if wrong: none.
- Task 9: fix round 1/5 (8e90650) re-review: 2 addressed; DvP staleness check misses games finalized after a build (compares tipAt, not finalization).
- Ruling R32: --incremental always rebuilds team_dvp (≈1–2 s) — drop the staleness heuristic. Also incremental deletes today's finished-game metrics. Cost if wrong: ~1 s extra per intraday run.
- Task 9: fix round 2/5 dispatched.
- Task 9: fix round 2/5 (f9ab5e2) re-review: 2/2 ADDRESSED, no new breakage.
- Task 9: complete (commits a26a5d6..f9ab5e2, review clean after 2 rounds) — merged into build/v1
- Task 9: minor (deferred): yesterday's games finishing after NY midnight keep metrics until next full run; DvP and metric writes in separate transactions (brief window); finished-games delete is autocommit.
- Integration check on 540b4e7 (T9 merged): typecheck clean, vitest 439/439 (41 files).
- Ruling R33: T13 middleware generates a per-request CSP nonce and forwards it as request header `x-nonce`; T12's root layout reads it for inline scripts. T13 owns middleware.ts, auth.ts, next.config.ts headers, app/signin/page.tsx (replaces T12 placeholder), lib/session.ts internals, lib/rate-limit.ts. T13 runs in parallel with T12 from 540b4e7. Cost if wrong: merge conflicts on signin page (resolve to T13).
- Task 12: implementer DONE_WITH_CONCERNS, commits 6dfbac5..0437d05 on wave2/t12-pages (merged build/v1 in at 9b7a46c); web 85/85; build passes; screenshots in shots/.
- Ruling R34: T13 public paths add /welcome/enter, /offline, /sw.js, /manifest.webmanifest, /icons/*, /icon.svg; CSP adds worker-src 'self', manifest-src 'self'. Sent to T13. Theme follows device until toggled (cookie-first) — accepted. Board table scrolls horizontally inside its box at 1440 — per spec.
- Lead viewed shots: board-light-1440 and detail-dark-1440 match the canvas. Note for BUILD-REPORT: default L10 sort surfaces near-certain U 0.5 blocks/threes props from hand-built fixture odds (data realism, not code).
- Task 12: review dispatched (opus, base 540b4e7..0437d05, images excluded).
- Task 12: review Needs fixes — 2 Important (impossible dates crash board/games = R11; slip independent-legs fallback §5 missing). Fix round 1/5 dispatched with 9 minors (log cache retry, NY dates, decode guard, 44px tabs/search, heading order, not-found + welcome footer, localStorage validation + settings theme PUT, sticky add-to-slip column, drop AGENTS.md). T12 may edit contracts filters.ts date refine.
- Ruling R35: T13 provides SignOutButton that clears all caches before signOut; lead mounts it in Settings at integration. Cost if wrong: stale board HTML after sign-out on shared devices.
- Task 12: minor (deferred): useFavorites ignores refreshed props; OffSlate remove uses toggle; delete slip has no confirm; SW VERSION constant/offline CSS not precached.
- Task 13: implementer DONE_WITH_CONCERNS, commits 8ed58f0, 593b254 on wave3/t13-security; full suite 523/523; build + next start smoke OK.
- Ruling R36: Next 16 `apps/web/proxy.ts` replaces middleware.ts. Integration step after T12+T13 merge (lead-dispatched): keep T13 signin page on conflict; mount SignOutButton in Settings; sw.js handles {type:'SIGN_OUT'} (clear caches); verify every page renders dynamically so CSP nonces apply (production `next start` check, no CSP console errors). Cost if wrong: blocked scripts in prod.
- Task 13: review Needs fixes — 1 CRITICAL (callbackUrl open redirect via /%09/evil.com, confirmed by probe). Fix round 1/5 dispatched (+ minors: hasOwn error lookup, drop schema-wide sequence grant, x-real-ip only + capped limiter map, anchored matcher/icon regex, server-action note).
- Ruling R37: HSTS without `preload` (max-age=63072000; includeSubDomains; production only). Cost if wrong: can add preload later deliberately.
- Integration (carry): verify all pages dynamic so CSP nonces apply (/, /welcome, /offline were static in T13's build).
- 2026-11-18 ~22:00 TST: T12 (fix round 1, mid-debug of a redirect loop) and T13 (fix round 1) hit the 5-hour limit; work preserved uncommitted.
- 2026-11-19 02:47 TST: user: "continue the build; if credits are about to max out, shut down this PC before hitting the limit". Lead cannot observe remaining quota. Standing rule: on ANY agent rate-limit failure notification → write ledger state, then run `shutdown /s /t 120` (abortable with `shutdown /a`). Remaining dispatches prefer sonnet/haiku to stretch quota.
- Task 12: fix round 1/5 commit 32c8230 (11 items; reload loop = stale dev server); 128/128; build OK.
- Integration (carry): add `AGENTS.md` handling (agentRules:false in next.config or gitignore apps/web/AGENTS.md); /welcome has two footer landmarks (IntroScene footer + disclaimer) — minor, deferred.
- Task 13: fix round 1/5 commit 56625a1 (7 items; root public/ files now require a session unless in PUBLIC_EXACT; RUNBOOK AUTH_TRUST_HOST note); 566/566; build + next start smoke.
- Task 12: fix round 1/5 (32c8230) re-review: 11/11 ADDRESSED, no new breakage.
- Task 12: complete (commits 540b4e7..32c8230, review clean after 1 round) — merged into build/v1
- Task 12: minor (deferred): welcome footer overlay fixed padding may collide at some heights; slip.ts formatting nit.
- Task 13: fix round 1/5 (56625a1) re-review: 6 addressed; CRITICAL open redirect still bypassable via dot-segments (/.//evil.com → //evil.com). PUBLIC_EXACT covers everything T12 needs.
- Task 13: fix round 2/5 dispatched (final pathname must match ^/(?![/\]) + property test).
- Task 13: fix round 2/5 (d596efd) re-review: CRITICAL ADDRESSED; ~100 adversarial probes, 0 failures.
- Task 13: complete (commits 540b4e7..d596efd, review clean after 2 rounds) — merged into build/v1 (signin page conflict resolved to T13's version).
- Task 13: minor (deferred): safeCallback has no input length cap; encoded slashes returned encoded (safe in Location).
- Integration check on 604d63e (all of T1–T13 merged): typecheck clean; vitest 643/643 (51 files).
- Ruling R38: Integration items (R35/R36 carry-overs, AGENTS.md, vitest hookTimeout) are folded into Task 14's dispatch (one agent, worktree wave3/t14-e2e) to save quota. Cost if wrong: larger T14 diff.
- Task 14: implementer DONE, commits 3619f8e (integration), 472e4ae (e2e) on wave3/t14-e2e; lint/typecheck 7/7, vitest 643/643, build (all pages ƒ), e2e 20/20 incl. 12 axe + 3 CSP prod checks.
- Task 14: review Approved w/ 1 Important (SIGN_OUT wipes the precached offline shell). Important 2 (is /offline public?) resolved: PUBLIC_EXACT includes /offline (T13 re-review). Fix round 1/5 dispatched (+ replace sleeps with polls, vitest config single source, Account heading style).
- Task 14: minor (deferred): temp DB not removed on hard kill; main e2e suite runs on next dev (per brief).
- 2026-11-19 06:43 TST: previous Claude Code process exited mid T14 fix round 1 (edits uncommitted in worktree); user said continue → resumed T14 agent via SendMessage.
- Task 14: fix round 1/5 commit 3976c3b (SW shell re-precache, deflaked waits, single vitest timeout source, Account heading); full verification passed; Playwright timeout 60s→120s (cold next dev compile on loaded machine).
- Ruling R39: accept 120s Playwright per-test timeout for the dev-server suite. Cost if wrong: slower failure detection.
- Task 14: fix round 1/5 (3976c3b) re-review: SW + deflake + heading ADDRESSED; claimed vitest-timeout regression.
- Ruling R40: re-reviewer's "only worker sets timeouts" finding is wrong — lead verified on wave3/t14-e2e that all 7 project configs set testTimeout/hookTimeout 30_000 (reviewer read the main checkout). Finding rejected. Cost if wrong: none.
- Task 14: complete (commits 604d63e..3976c3b, review clean after 1 round + ruling) — merged into build/v1
- Task 14: minor (deferred): SW SIGN_OUT .catch also swallows a failed caches.delete (silent); a11y animation snapshot taken once.
- Final whole-branch review (opus) and Task 15 security review (sonnet) dispatched in parallel on 2d7b9fc..3976c3b (filtered diff review-final.diff).
- Task 15: security review PASS (no Critical/High). Medium-conditional: unencrypted pg_dump artifact (backup.yml:48). Low: err.stack stored in job_runs.error and shown on /status; SW board HTML survives non-button sign-out (by design, shared-device risk); web_role SELECT on raw_payloads unused. Info: no Dependabot; next-auth beta pinned; /api/auth not rate-limited.
- Task 15: complete (review-only). Fixes queued for the single final-fix dispatch: encrypt backup (gpg symmetric with BACKUP_PASSPHRASE secret, fail if missing); store err.message only (no stack) in job_runs; drop web_role SELECT on raw_payloads; add .github/dependabot.yml (npm weekly + github-actions).
- Final review: "Ready after fixes" — C1 roles.sql lacks prop_current view grants (worker odds/precompute + web detail/books filter fail under app roles); C2 ingest.yml never sets STATS_PROVIDER → fixtures written to prod; I1 RUNBOOK ODDS_PROVIDER wrong value; I2 migrations not automated (spec §9) + false comment; I3 raw_payloads unbounded growth vs Neon 0.5 GB; I4 Actions minutes vs free tier + 23:00 double pull.
- Ruling R41: ONE final fix dispatch (sonnet, worktree wave3/final-fixes) covering C1, C2, I1–I4, T15 fixes (encrypted backup, err.message only, drop web raw_payloads SELECT, dependabot) and cheap minors (budget default 2500 everywhere, /status month in NY, don't pass --date to precompute, slip joint rate min n=5, readConfig errors wrapped, RUNBOOK gaps + first-deploy section, prettier check in CI, drop redundant CI seed step, remove unused @blueline/adapters dep from web). Removing a dependency (and the resulting lockfile change) is permitted for this dispatch only. Deferred: stale empty-injury-batch, duplication refactors, Postgres-service CI job. Cost if wrong: larger final diff.
- Final fix wave: DONE, commits 3e014c2..ea9ca5e on wave3/final-fixes (12 commits incl. whitespace-only prettier commit 6d7f50e); lint/typecheck 7/7, vitest 656/656, build, e2e 20/20, prettier clean.
- Final fix wave re-review: 17/17 ADDRESSED, no new breakage; C1 verified by roles test in PGlite (8/8).
- Final fix wave: complete — merged into build/v1.
- Post-merge minor (deferred): slip fallback label says "no shared games" when 1–4 exist; prune skipped on a failed boxscore day; web_role SELECT on provider_aliases unused.
- 2026-11-19: user approved a Vercel deploy kit (Google + GitHub sign-in): setup:live command, vercel.json, conditional providers, workflow secret guards, docs/DEPLOY.md. Branch feat/vercel-deploy-kit (worktree d:/Codes/blueline-wt/deploy-kit).
- Deploy kit review: Safe to merge and run (no Critical/Important). Minor deferred: role passwords altered before files rewritten on re-run error; legacy env fallbacks; file mode no-op on Windows; existing login role attributes not reset; admin exports in db barrel.
