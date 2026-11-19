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
import { useState, useTransition } from 'react';
import {
  activePreset,
  filterToQuery,
  formatDay,
  formatMonth,
  PRESET_LABEL,
  presetRange,
  RESULT_LABEL,
  todayLocal,
  type RangePreset,
} from '../../../lib/bets';
import page from '../_ui/page.module.css';
import { BetForm } from './BetForm';
import styles from './bets.module.css';
import { PnlChart } from './PnlChart';

const PRESETS: RangePreset[] = ['7d', '30d', 'month', 'all'];
const SETTLE: BetResult[] = ['win', 'loss', 'push', 'void'];

function tone(n: number | null): string | undefined {
  return n === null || n === 0 ? undefined : n > 0 ? styles.pos : styles.neg;
}

function Pnl({ value, currency }: { value: number | null; currency: string }) {
  if (value === null) return <span className={styles.dash}>—</span>;
  return <span className={tone(value)}>{formatSignedMoney(value, currency)}</span>;
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
        <p className={page.muted}>Nothing settled yet.</p>
      ) : (
        <div className={styles.scroll} tabIndex={0} role="region" aria-label={`${title} table`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{keyLabel}</th>
                <th scope="col" className={styles.num}>
                  Bets
                </th>
                <th scope="col" className={styles.num}>
                  Staked
                </th>
                <th scope="col" className={styles.num}>
                  PnL
                </th>
                <th scope="col" className={styles.num}>
                  ROI
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{fmtKey ? fmtKey(r.key) : r.key}</th>
                  <td className={styles.num}>{r.bets}</td>
                  <td className={styles.num}>{formatMoney(r.staked, currency)}</td>
                  <td className={styles.num}>
                    <Pnl value={r.net} currency={currency} />
                  </td>
                  <td className={styles.num}>
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
}: {
  bets: BetDTO[];
  summary: BetSummaryDTO;
  filter: BetFilter;
  books: string[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState<{ bet: BetDTO | null } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const s = summary;
  const cur = s.currency;
  const today = todayLocal();
  const preset = activePreset(filter, today);
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

  const actions = (b: BetDTO) => (
    <div className={styles.actions}>
      {b.result === 'pending' ? (
        <div className={styles.settle} role="group" aria-label={`Settle ${b.description}`}>
          <span className={styles.settleLabel}>Settle</span>
          {SETTLE.map((r) => (
            <button
              key={r}
              type="button"
              className={styles.mini}
              disabled={busy === b.id}
              onClick={() => void settle(b, r)}
              aria-label={`Mark ${RESULT_LABEL[r].toLowerCase()}: ${b.description}`}
            >
              {RESULT_LABEL[r]}
            </button>
          ))}
        </div>
      ) : null}
      <div className={styles.rowBtns}>
        <Button
          variant="ghost"
          onClick={() => setForm({ bet: b })}
          aria-label={`Edit bet: ${b.description}`}
        >
          Edit
        </Button>
        {confirm === b.id ? (
          <>
            <Button
              variant="secondary"
              disabled={busy === b.id}
              onClick={() => void remove(b)}
              aria-label={`Confirm delete: ${b.description}`}
            >
              Confirm delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            onClick={() => setConfirm(b.id)}
            aria-label={`Delete bet: ${b.description}`}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );

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
                      ...presetRange(p, today),
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
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bets.map((b) => (
                        <tr key={b.id}>
                          <td className={styles.nowrap}>{formatDay(b.placedOn)}</td>
                          <td>
                            <span className={styles.book}>{b.book}</span>
                          </td>
                          <td className={styles.betCell}>
                            <span className={styles.desc}>{b.description}</span>
                            {b.event ? <span className={styles.event}>{b.event}</span> : null}
                            {b.betType === 'parlay' ? (
                              <span className={styles.event}>Parlay · {b.legs} legs</span>
                            ) : null}
                          </td>
                          <td className={styles.num}>
                            <OddsCell d={b.oddsDecimal} />
                          </td>
                          <td className={styles.num}>{formatMoney(b.stake, b.currency)}</td>
                          <td>
                            <ResultChip result={b.result} />
                          </td>
                          <td className={styles.num}>
                            {b.payout === null ? (
                              <span className={styles.dash}>—</span>
                            ) : (
                              formatMoney(b.payout, b.currency)
                            )}
                          </td>
                          <td className={styles.num}>
                            <Pnl value={b.profit} currency={b.currency} />
                          </td>
                          <td>{actions(b)}</td>
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
                        <span className={styles.event}>{formatDay(b.placedOn)}</span>
                        <ResultChip result={b.result} />
                      </div>
                      <p className={styles.desc}>{b.description}</p>
                      {b.event ? <p className={styles.event}>{b.event}</p> : null}
                      {b.betType === 'parlay' ? (
                        <p className={styles.event}>Parlay · {b.legs} legs</p>
                      ) : null}
                      <dl className={styles.cardNums}>
                        <div>
                          <dt>Odds</dt>
                          <dd>
                            <OddsCell d={b.oddsDecimal} />
                          </dd>
                        </div>
                        <div>
                          <dt>Stake</dt>
                          <dd>{formatMoney(b.stake, b.currency)}</dd>
                        </div>
                        <div>
                          <dt>Payout</dt>
                          <dd>{b.payout === null ? '—' : formatMoney(b.payout, b.currency)}</dd>
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
