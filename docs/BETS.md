# Bet tracker

`/bets` logs every bet you place (player props, team or quarter totals, parlays) on any book and shows wins, losses and profit and loss. Money is stored exactly (`numeric`), per currency. Nothing here is betting advice.

## Log a bet

Press **Log a bet**. Fields:

| Field | Notes |
| --- | --- |
| Date | Defaults to today in your browser's time zone |
| Sportsbook | Free text with suggestions (Stake, DraftKings, FanDuel, BetMGM, Caesars, ESPN BET, bet365, Other) |
| Sport, Event | Sport defaults to NBA. Event is optional, e.g. "Miami Heat vs Milwaukee Bucks" |
| Bet | What you took, e.g. "Over 61.5 · 3rd Quarter Total" (160 characters) |
| Single / Parlay, Legs | Parlays have 2–20 legs |
| Odds | Decimal by default. Switch to American (+150, −120) and it is converted (+150 is 2.50, −120 is 1.833). The list shows decimal first and American beneath |
| Stake, Currency | Stake up to 10,000,000. PHP by default; PHP, USD, EUR, GBP, AUD, CAD |
| Result | Pending, Win, Loss, Push, Void or Cash-out |
| Payout | Calculated. Only editable for a cash-out |
| Notes | Optional |

The preview under the form shows the payout and profit as you type, e.g. `Payout ₱657.00 · Profit +₱292.00`.

Pending bets have **Settle** buttons (Win, Loss, Push, Void) in the list. Use **Edit** for a cash-out, which needs the amount you received.

## How money is counted

- Win pays stake × decimal odds (rounded to the centavo). Push and void return the stake. Loss pays 0. Cash-out is the amount you enter (between 0 and stake × odds). Pending has no payout.
- The server always recomputes the payout from the result, stake and odds. A payout sent for anything but a cash-out is ignored.
- Profit = payout − stake. Pending bets are left out of every total.
- Push and void count as 0 profit and are left out of the win rate. A cash-out counts as a win if it returned more than the stake, a loss if less, a push if equal.
- Win rate = wins ÷ (wins + losses). ROI = net PnL ÷ total staked (shown as "—" when nothing is staked yet). Void bets are kept in the bet counts but left out of total staked and total returned, so they never dilute ROI; pushes still count their stake.
- The streak counts the latest run of wins or losses; pushes and voids are skipped.
- Summaries are per currency and never added across currencies. The page shows your most-used currency (PHP on a tie) and a switcher appears when you have more than one.

## Dashboard

Net PnL, ROI, win rate (with W–L–P), total staked and total returned; a cumulative PnL chart (a step line, with a drawn zero line; hover, or focus it and use the arrow keys, to read the date and running PnL; a data table is available to screen readers); and breakdowns by sportsbook and by month. Filters: 7 days, 30 days, this month, all time, a custom range, book and result. They are kept in the URL, so a filtered view can be bookmarked.

## API

All routes need a signed-in session, are scoped to you (another user's id answers 404) and return JSON.

| Route | Purpose |
| --- | --- |
| `GET /api/bets?from&to&book&result&currency` | List, newest first (unknown query parameters are ignored) |
| `POST /api/bets` | Create. Odds as `{ "decimal": 1.8 }` or `{ "american": -120 }`; 400 with per-field errors |
| `GET` / `PATCH` / `DELETE /api/bets/{id}` | Read, partial update (payout recomputed), delete |
| `GET /api/bets/summary?…` | Summary for one currency, with the list of currencies in use |

## Data and deploy

Table `bets` (migration `0001_bets`), owned by `users` with `ON DELETE CASCADE`. `packages/db/sql/roles.sql` grants `web_role` SELECT/INSERT/UPDATE/DELETE on it and `worker_role` nothing. After running the migration on Neon, re-run `roles.sql` as the owner (grants are per table).
