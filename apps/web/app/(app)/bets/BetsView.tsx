'use client';

import {
  formatAmericanFromDecimal,
  formatDecimalOdds,
  formatMoney,
  formatPercent,
  formatSignedMoney,
  formatSignedPercent,
  type BetDTO,
  type BetFilter,
  type BetResult,
  type BetSummaryDTO,
  type GroupStats,
} from '@blueline/contracts';
import { Button, Chip, EmptyState, Segmented } from '@blueline/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, useTransition } from 'react';
import {
  activePreset,
  filterToQuery,
  formatDay,
  formatMonth,
  parseBetTitle,
  PRESET_LABEL,
  presetRange,
  RESULT_LABEL,
  todayLocal,
  type RangePreset,
} from '../../../lib/bets';
import page from '../_ui/page.module.css';
import { ActionMenu, type MenuItem } from './ActionMenu';
import { BetForm } from './BetForm';
import styles from './bets.module.css';
import { PnlChart } from './PnlChart';

const PRESETS: RangePreset[] = ['7d', '30d', 'month', 'all'];
const SETTLE: BetResult[] = ['win', 'loss', 'push', 'void'];

/** The more-actions button of a bet, in whichever layout (table or cards) is showing. */
function focusMore(id: string) {
  const all = document.querySelectorAll<HTMLElement>(`[data-menu-trigger="more-${id}"]`);
  (Array.from(all).find((el) => el.offsetParent !== null) ?? all[0])?.focus();
}

function tone(n: number | null): string | undefined {
  return n === null || n === 0 ? undefined : n > 0 ? styles.pos : styles.neg;
}

function Pnl({ value, currency }: { value: number | null; currency: string }) {
  if (value === null) return <span className={styles.dash}>—</span>;
  return (
    <span className={`${styles.money} ${tone(value) ?? ''}`}>
      {formatSignedMoney(value, currency)}
    </span>
  );
}

function ResultChip({ result }: { result: BetResult }) {
  return (
    <span className={styles.chip} data-result={result}>
      {RESULT_LABEL[result]}
    </span>
  );
}

function OddsCell({ d }: { d: number }) {
  return (
    <span className={styles.odds}>
      <span className={styles.oddsMain}>{formatDecimalOdds(d)}</span>
      <span className={styles.oddsAlt}>{formatAmericanFromDecimal(d)}</span>
    </span>
  );
}

function BetCell({ b }: { b: BetDTO }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const { title, legs } = parseBetTitle(b.description, b.betType, b.legs);
  return (
    <div className={styles.betBody}>
      <p className={styles.desc} title={b.description}>
        {title}
      </p>
      <p className={styles.event}>
        {b.event ? <span>{b.event}</span> : null}
        {b.event && legs.length > 0 ? <span aria-hidden="true"> · </span> : null}
        {legs.length > 0 ? (
          <button
            type="button"
            className={styles.legsBtn}
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Hide legs' : 'Show legs'}
            <span className="sr-only">{` (${legs.length}) for ${title}`}</span>
          </button>
        ) : null}
      </p>
      {legs.length > 0 ? (
        <ol id={id} className={styles.legs} hidden={!open}>
          {legs.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function Breakdown({
  title,
  keyLabel,
  rows,
  currency,
  fmtKey,
}: {
  title: string;
  keyLabel: string;
  rows: GroupStats[];
  currency: string;
  fmtKey?: (k: string) => string;
}) {
  return (
    <section className={styles.panel} aria-labelledby={`bd-${keyLabel}`}>
      <h2 id={`bd-${keyLabel}`} className={styles.h2}>
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className={page.muted}>No bets yet.</p>
      ) : (
        <div className={styles.scroll} tabIndex={0} role="region" aria-label={`${title} table`}>
          <table className={`${styles.table} ${styles.breakdown}`} role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">
                  {keyLabel}
                </th>
                <th scope="col" className={styles.num} role="columnheader">
                  Settled
                </th>
                <th scope="col" className={styles.num} role="columnheader">
                  Pending
                </th>
                <th scope="col" className={styles.num} role="columnheader">
                  Staked
                </th>
                <th scope="col" className={styles.num} role="columnheader">
                  PnL
                </th>
                <th scope="col" className={styles.num} role="columnheader">
                  ROI
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {rows.map((r) => (
                <tr key={r.key} role="row">
                  <th scope="row" role="rowheader">
                    {fmtKey ? fmtKey(r.key) : r.key}
                  </th>
                  <td className={styles.num} data-label="Settled" role="cell">
                    {r.settled}
                  </td>
                  <td className={styles.num} data-label="Pending" role="cell">
                    {r.pending}
                  </td>
                  <td className={styles.num} data-label="Staked" role="cell">
                    <span className={styles.money}>{formatMoney(r.staked, currency)}</span>
                  </td>
                  <td className={styles.num} data-label="PnL" role="cell">
                    <Pnl value={r.settled === 0 ? null : r.net} currency={currency} />
                  </td>
                  <td className={styles.num} data-label="ROI" role="cell">
                    <span className={tone(r.roi)}>{formatSignedPercent(r.roi)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function BetsView({
  bets,
  summary,
  filter,
  books,
  year,
}: {
  bets: BetDTO[];
  summary: BetSummaryDTO;
  filter: BetFilter;
  books: string[];
  /** Server's current year: dates in it show without the year until the browser date is known. */
  year: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState<{ bet: BetDTO | null; result?: BetResult } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const s = summary;
  const cur = s.currency;
  // The browser's local date is only known after mount; rendering it earlier would mismatch SSR.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayLocal()), []);
  const thisYear = today ? today.slice(0, 4) : year;
  const preset = today ? activePreset(filter, today) : null;
  const hasFilter = Boolean(filter.from || filter.to || filter.book || filter.result);

  const go = (next: BetFilter) => {
    startTransition(() => router.push(`/bets${filterToQuery(next)}`));
  };
  const refresh = () => startTransition(() => router.refresh());

  const settle = async (b: BetDTO, result: BetResult) => {
    setBusy(b.id);
    setError('');
    try {
      const res = await fetch(`/api/bets/${encodeURIComponent(b.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ result }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setNotice(`Bet marked ${RESULT_LABEL[result].toLowerCase()}.`);
      refresh();
      // The Settle button goes away with the pending state; keep keyboard focus on the row.
      focusMore(b.id);
    } catch {
      setError('The bet was not updated. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (b: BetDTO) => {
    setBusy(b.id);
    setError('');
    try {
      const res = await fetch(`/api/bets/${encodeURIComponent(b.id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(String(res.status));
      setConfirm(null);
      setNotice('Bet deleted.');
      refresh();
    } catch {
      setError('The bet was not deleted. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const actions = (b: BetDTO) => {
    if (confirm === b.id) {
      return (
        <div className={styles.actions} role="group" aria-label={`Delete ${b.description}?`}>
          <Button
            variant="secondary"
            disabled={busy === b.id}
            onClick={() => void remove(b)}
            aria-label={`Confirm delete: ${b.description}`}
          >
            Confirm delete
          </Button>
          <Button
            variant="ghost"
            autoFocus
            onClick={() => {
              setConfirm(null);
              setTimeout(() => focusMore(b.id), 0);
            }}
          >
            Cancel
          </Button>
        </div>
      );
    }
    const settleItems: MenuItem[] = [
      ...SETTLE.map((r) => ({
        key: r,
        label: RESULT_LABEL[r],
        disabled: busy === b.id,
        onSelect: () => void settle(b, r),
      })),
      {
        key: 'cashout',
        label: 'Cash-out…',
        onSelect: () => setForm({ bet: b, result: 'cashout' }),
      },
    ];
    const moreItems: MenuItem[] = [
      { key: 'edit', label: 'Edit', onSelect: () => setForm({ bet: b }) },
      { key: 'delete', label: 'Delete', danger: true, onSelect: () => setConfirm(b.id) },
    ];
    return (
      <div className={styles.actions}>
        {b.result === 'pending' ? (
          <ActionMenu
            className={styles.settleBtn}
            label={
              <>
                Settle
                <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
                  <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </>
            }
            ariaLabel={`Settle: ${b.description}`}
            items={settleItems}
          />
        ) : null}
        <ActionMenu
          className={styles.moreBtn}
          label={
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="5" cy="12" r="2" fill="currentColor" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
              <circle cx="19" cy="12" r="2" fill="currentColor" />
            </svg>
          }
          ariaLabel={`More actions for ${b.description}`}
          items={moreItems}
          triggerData={`more-${b.id}`}
        />
      </div>
    );
  };

  const noBetsAtAll = bets.length === 0 && !hasFilter && s.currencies.length === 0;
  const record = `${s.wins}–${s.losses}–${s.pushes}`;

  const kpis = [
    {
      key: 'roi',
      label: 'ROI',
      value: <span className={tone(s.roi)}>{formatSignedPercent(s.roi)}</span>,
      sub: s.staked > 0 ? 'Net PnL ÷ staked' : 'Settle a bet to see ROI',
    },
    {
      key: 'win',
      label: 'Win rate',
      value: <span>{formatPercent(s.winRate)}</span>,
      sub: `${record} W–L–P${s.voids > 0 ? ` · ${s.voids} void` : ''}`,
    },
    {
      key: 'staked',
      label: 'Total staked',
      value: <span>{formatMoney(s.staked, cur)}</span>,
      sub: `${s.settled} settled`,
    },
    {
      key: 'returned',
      label: 'Total returned',
      value: <span>{formatMoney(s.returned, cur)}</span>,
      sub: s.pending > 0 ? `${s.pending} pending, not counted` : 'Payouts incl. stake back',
    },
  ];

  return (
    <>
      <div className={page.head}>
        <div className={page.titleBlock}>
          <h1 className={page.h1}>Bets</h1>
          <p className={page.sub}>
            {s.settled} settled · {s.pending} pending · profit and loss in {cur}
          </p>
        </div>
        <Button size="lg" onClick={() => setForm({ bet: null })}>
          Log a bet
        </Button>
      </div>

      <p role="status" aria-live="polite" className={notice ? styles.notice : 'sr-only'}>
        {notice}
      </p>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}

      {noBetsAtAll ? (
        <div className={page.emptyCard}>
          <EmptyState
            title="No bets logged yet"
            hint="Log any bet you place: a player prop, a team or quarter total, a parlay. Wins, losses and profit build from there."
            action={<Button onClick={() => setForm({ bet: null })}>Log your first bet</Button>}
          />
        </div>
      ) : (
        <>
          <div className={styles.filters} role="group" aria-label="Filters">
            <div className={styles.filterRow}>
              {PRESETS.map((p) => (
                <Chip
                  key={p}
                  pressed={preset === p}
                  onClick={() =>
                    go({
                      ...filter,
                      ...presetRange(p, today ?? todayLocal()),
                      ...(p === 'all' ? { from: undefined, to: undefined } : {}),
                    })
                  }
                >
                  {PRESET_LABEL[p]}
                </Chip>
              ))}
              <label className={styles.inline}>
                <span>From</span>
                <input
                  type="date"
                  value={filter.from ?? ''}
                  max={filter.to}
                  onChange={(e) => go({ ...filter, from: e.target.value || undefined })}
                />
              </label>
              <label className={styles.inline}>
                <span>To</span>
                <input
                  type="date"
                  value={filter.to ?? ''}
                  min={filter.from}
                  onChange={(e) => go({ ...filter, to: e.target.value || undefined })}
                />
              </label>
            </div>
            <div className={styles.filterRow}>
              <label className={styles.inline}>
                <span>Book</span>
                <select
                  value={filter.book ?? ''}
                  onChange={(e) => go({ ...filter, book: e.target.value || undefined })}
                >
                  <option value="">All books</option>
                  {[...new Set([...books, ...(filter.book ? [filter.book] : [])])].map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.inline}>
                <span>Result</span>
                <select
                  value={filter.result ?? ''}
                  onChange={(e) =>
                    go({
                      ...filter,
                      result: (e.target.value || undefined) as BetResult | undefined,
                    })
                  }
                >
                  <option value="">All results</option>
                  {(Object.keys(RESULT_LABEL) as BetResult[]).map((r) => (
                    <option key={r} value={r}>
                      {RESULT_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>
              {s.currencies.length > 1 ? (
                <Segmented
                  label="Currency"
                  value={cur}
                  onChange={(c) => go({ ...filter, currency: c })}
                  options={s.currencies.map((c) => ({ value: c.currency, label: c.currency }))}
                />
              ) : null}
              {hasFilter ? (
                <Button variant="ghost" onClick={() => go({ currency: filter.currency })}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          </div>

          <section className={styles.kpis} aria-label="Profit and loss summary">
            <div className={`${styles.tile} ${styles.hero}`}>
              <span className={styles.tileLabel}>Net PnL</span>
              <span className={styles.heroValue} data-testid="kpi-net">
                <Pnl value={s.net} currency={cur} />
              </span>
              <span className={styles.tileSub}>
                {s.settled === 0
                  ? 'No settled bets in this view'
                  : `${s.settled} settled bets${s.streak ? ` · ${s.streak.count} ${s.streak.type === 'win' ? 'win' : 'loss'}${s.streak.count === 1 ? '' : s.streak.type === 'loss' ? 'es' : 's'} in a row` : ''}`}
              </span>
            </div>
            {kpis.map((k) => (
              <div key={k.key} className={styles.tile}>
                <span className={styles.tileLabel}>{k.label}</span>
                <span className={styles.tileValue} data-testid={`kpi-${k.key}`}>
                  {k.value}
                </span>
                <span className={styles.tileSub}>{k.sub}</span>
              </div>
            ))}
          </section>

          <section className={styles.panel} aria-labelledby="pnl-h">
            <div className={styles.panelHead}>
              <h2 id="pnl-h" className={styles.h2}>
                Cumulative PnL
              </h2>
              <dl className={styles.facts}>
                <div>
                  <dt>Avg odds</dt>
                  <dd>{s.avgOdds === null ? '—' : formatDecimalOdds(s.avgOdds)}</dd>
                </div>
                <div>
                  <dt>Biggest win</dt>
                  <dd>{s.biggestWin ? <Pnl value={s.biggestWin.amount} currency={cur} /> : '—'}</dd>
                </div>
                <div>
                  <dt>Biggest loss</dt>
                  <dd>
                    {s.biggestLoss ? <Pnl value={s.biggestLoss.amount} currency={cur} /> : '—'}
                  </dd>
                </div>
              </dl>
            </div>
            <PnlChart series={s.series} currency={cur} />
          </section>

          <div className={styles.twoCol}>
            <Breakdown title="By sportsbook" keyLabel="Book" rows={s.byBook} currency={cur} />
            <Breakdown
              title="By month"
              keyLabel="Month"
              rows={s.byMonth}
              currency={cur}
              fmtKey={formatMonth}
            />
          </div>

          <section className={styles.panel} aria-labelledby="list-h">
            <h2 id="list-h" className={styles.h2}>
              All bets
            </h2>
            {bets.length === 0 ? (
              <EmptyState
                title="No bets match these filters"
                hint="Widen the date range or clear the book and result filters."
                action={
                  <Button variant="secondary" onClick={() => go({ currency: filter.currency })}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <>
                <div className={styles.tableOnly}>
                  <table className={styles.table}>
                    <caption className="sr-only">Your bets, newest first</caption>
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Book</th>
                        <th scope="col">Bet</th>
                        <th scope="col" className={styles.num}>
                          Odds
                        </th>
                        <th scope="col" className={styles.num}>
                          Stake
                        </th>
                        <th scope="col">Result</th>
                        <th scope="col" className={styles.num}>
                          Payout
                        </th>
                        <th scope="col" className={styles.num}>
                          PnL
                        </th>
                        <th scope="col" className={styles.actionsHead}>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {bets.map((b) => (
                        <tr key={b.id}>
                          <td className={styles.nowrap}>
                            <time dateTime={b.placedOn}>{formatDay(b.placedOn, thisYear)}</time>
                          </td>
                          <td>
                            <span className={styles.book}>{b.book}</span>
                          </td>
                          <td className={styles.betCell}>
                            <BetCell b={b} />
                          </td>
                          <td className={styles.num}>
                            <OddsCell d={b.oddsDecimal} />
                          </td>
                          <td className={styles.num}>
                            <span className={styles.money}>{formatMoney(b.stake, b.currency)}</span>
                          </td>
                          <td>
                            <ResultChip result={b.result} />
                          </td>
                          <td className={styles.num}>
                            {b.payout === null ? (
                              <span className={styles.dash}>—</span>
                            ) : (
                              <span className={styles.money}>
                                {formatMoney(b.payout, b.currency)}
                              </span>
                            )}
                          </td>
                          <td className={styles.num}>
                            <Pnl value={b.profit} currency={b.currency} />
                          </td>
                          <td className={styles.actionsCell}>{actions(b)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className={styles.cards}>
                  {bets.map((b) => (
                    <li key={b.id} className={styles.card}>
                      <div className={styles.cardTop}>
                        <span className={styles.book}>{b.book}</span>
                        <time className={styles.event} dateTime={b.placedOn}>
                          {formatDay(b.placedOn, thisYear)}
                        </time>
                        <ResultChip result={b.result} />
                      </div>
                      <BetCell b={b} />
                      <dl className={styles.cardNums}>
                        <div>
                          <dt>Odds</dt>
                          <dd>
                            <OddsCell d={b.oddsDecimal} />
                          </dd>
                        </div>
                        <div>
                          <dt>Stake</dt>
                          <dd className={styles.money}>{formatMoney(b.stake, b.currency)}</dd>
                        </div>
                        <div>
                          <dt>Payout</dt>
                          <dd className={styles.money}>
                            {b.payout === null ? '—' : formatMoney(b.payout, b.currency)}
                          </dd>
                        </div>
                        <div>
                          <dt>PnL</dt>
                          <dd>
                            <Pnl value={b.profit} currency={b.currency} />
                          </dd>
                        </div>
                      </dl>
                      {actions(b)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      {form ? (
        <BetForm
          bet={form.bet}
          initialResult={form.result}
          onClose={() => setForm(null)}
          onSaved={(_saved, created) => {
            setForm(null);
            setNotice(created ? 'Bet saved.' : 'Bet updated.');
            refresh();
          }}
        />
      ) : null}
    </>
  );
}
