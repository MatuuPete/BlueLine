'use client';

import {
  americanToDecimal,
  BET_RESULTS,
  BetInputSchema,
  BOOK_SUGGESTIONS,
  CURRENCIES,
  computePayout,
  formatMoney,
  formatSignedMoney,
  ODDS_MAX,
  ODDS_MIN,
  profit,
  type BetDTO,
  type BetResult,
  type BetType,
} from '@blueline/contracts';
import { Button, Segmented } from '@blueline/ui';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { RESULT_LABEL, todayLocal } from '../../../lib/bets';
import styles from './form.module.css';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

type Errors = Record<string, string>;

/** Server and client field errors both arrive as `{ field: message }`. */
function firstErrors(fields: Record<string, string[]>): Errors {
  const out: Errors = {};
  for (const [k, v] of Object.entries(fields)) out[k.split('.')[0]!] ??= v[0] ?? 'Invalid';
  return out;
}

const num = (s: string): number | undefined => {
  const v = s.trim().replace(/,/g, '');
  if (v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function BetForm({
  bet,
  initialResult,
  onClose,
  onSaved,
}: {
  bet: BetDTO | null;
  /** Preselects the result (the Settle menu's "Cash-out…"); the bet's own result otherwise. */
  initialResult?: BetResult;
  onClose: () => void;
  onSaved: (saved: BetDTO, created: boolean) => void;
}) {
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const ref = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  const [placedOn, setPlacedOn] = useState(bet?.placedOn ?? '');
  const [book, setBook] = useState(bet?.book ?? 'Stake');
  const [sport, setSport] = useState(bet?.sport ?? 'NBA');
  const [event, setEvent] = useState(bet?.event ?? '');
  const [description, setDescription] = useState(bet?.description ?? '');
  const [betType, setBetType] = useState<BetType>(bet?.betType ?? 'single');
  const [legs, setLegs] = useState(String(bet?.legs ?? 1));
  const [oddsMode, setOddsMode] = useState<'decimal' | 'american'>('decimal');
  const [oddsText, setOddsText] = useState(bet ? String(bet.oddsDecimal) : '');
  const [stake, setStake] = useState(bet ? String(bet.stake) : '');
  const [currency, setCurrency] = useState(bet?.currency ?? 'PHP');
  const [result, setResult] = useState<BetResult>(initialResult ?? bet?.result ?? 'pending');
  const [cashout, setCashout] = useState(
    bet?.result === 'cashout' && bet.payout !== null ? String(bet.payout) : '',
  );
  const [notes, setNotes] = useState(bet?.notes ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // The browser's local date is only known after mount, so a new bet's date is set here, not in render.
  useEffect(() => {
    if (!bet) setPlacedOn((d) => d || todayLocal());
  }, [bet]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  const switchOdds = (mode: 'decimal' | 'american') => {
    if (mode === oddsMode) return;
    const v = num(oddsText);
    if (v !== undefined) {
      if (mode === 'american' && v >= ODDS_MIN) {
        setOddsText(String(v >= 2 ? Math.round((v - 1) * 100) : Math.round(-100 / (v - 1))));
      } else if (mode === 'decimal' && Math.abs(v) >= 100) {
        setOddsText(String(americanToDecimal(v)));
      }
    }
    setOddsMode(mode);
  };

  const oddsValue = num(oddsText);
  const oddsDecimal =
    oddsValue === undefined
      ? undefined
      : oddsMode === 'decimal'
        ? oddsValue
        : Math.abs(oddsValue) >= 100
          ? americanToDecimal(oddsValue)
          : undefined;
  const stakeValue = num(stake);
  const oddsOk = oddsDecimal !== undefined && oddsDecimal >= ODDS_MIN && oddsDecimal <= ODDS_MAX;
  const ready = oddsOk && stakeValue !== undefined && stakeValue > 0;

  const cashoutValue = num(cashout);
  const payout = ready
    ? computePayout({
        result: result === 'pending' ? 'win' : result,
        stake: stakeValue,
        oddsDecimal,
        cashout: cashoutValue,
      })
    : null;
  const shownProfit =
    ready && payout !== null ? profit({ stake: stakeValue, result: 'win', payout }) : null;
  const cur = currency || 'PHP';
  const previewLabel =
    result === 'pending'
      ? 'If it wins'
      : result === 'cashout' && payout === null
        ? 'Enter the cash-out amount'
        : 'Settled';

  const submit = async () => {
    const e: Errors = {};
    if (!description.trim()) e.description = 'Describe the bet, e.g. Over 61.5 · 3rd Quarter Total';
    if (!book.trim()) e.book = 'Enter the sportsbook';
    if (stakeValue === undefined || stakeValue <= 0) e.stake = 'Enter a stake above zero';
    if (oddsValue === undefined) e.odds = 'Enter the odds';
    else if (oddsMode === 'american' && Math.abs(oddsValue) < 100)
      e.odds = 'American odds start at +100 or −100';
    else if (!oddsOk) e.odds = `Decimal odds must be between ${ODDS_MIN} and ${ODDS_MAX}`;
    if (result === 'cashout' && cashoutValue === undefined)
      e.payout = 'Enter the cash-out amount you received';
    if (betType === 'parlay' && (num(legs) ?? 0) < 2) e.legs = 'A parlay has at least 2 legs';

    const raw = {
      placedOn,
      book,
      sport,
      event,
      description,
      betType,
      legs: betType === 'single' ? 1 : (num(legs) ?? 1),
      odds: oddsMode === 'decimal' ? { decimal: oddsValue ?? 0 } : { american: oddsValue ?? 0 },
      stake: stakeValue ?? 0,
      currency,
      result,
      payout: result === 'cashout' ? (cashoutValue ?? null) : null,
      notes,
    };
    if (Object.keys(e).length === 0) {
      const parsed = BetInputSchema.safeParse(raw);
      if (!parsed.success) {
        const f: Record<string, string[]> = {};
        for (const i of parsed.error.issues) (f[i.path.join('.') || '_'] ??= []).push(i.message);
        Object.assign(e, firstErrors(f));
      }
    }
    setErrors(e);
    setFormError('');
    if (Object.keys(e).length > 0) {
      const key = Object.keys(e)[0]!;
      ref.current?.querySelector<HTMLElement>(`[data-field="${key}"]`)?.focus();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(bet ? `/api/bets/${encodeURIComponent(bet.id)}` : '/api/bets', {
        method: bet ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(raw),
      });
      if (res.status === 400) {
        const j = (await res.json()) as { fields?: Record<string, string[]> };
        setErrors(firstErrors(j.fields ?? {}));
        setFormError('Some fields need attention.');
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      onSaved((await res.json()) as BetDTO, !bet);
    } catch {
      setFormError('The bet was not saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    if (
      e.shiftKey &&
      (document.activeElement === first || document.activeElement === ref.current)
    ) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const err = (k: string) =>
    errors[k] ? (
      <p id={id(`${k}-err`)} className={styles.err}>
        {errors[k]}
      </p>
    ) : null;
  const aria = (k: string) =>
    errors[k]
      ? ({ 'aria-invalid': true, 'aria-describedby': id(`${k}-err`) } as const)
      : ({} as const);

  const title = bet ? 'Edit bet' : 'Log a bet';
  return (
    <div className={styles.overlay}>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id('title')}
        tabIndex={-1}
        className={styles.dialog}
        onKeyDown={onKeyDown}
      >
        <header className={styles.head}>
          <h2 id={id('title')} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <form
          className={styles.form}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor={id('date')}>Date</label>
              <input
                ref={firstRef}
                id={id('date')}
                data-field="placedOn"
                type="date"
                value={placedOn}
                onChange={(e) => setPlacedOn(e.target.value)}
                required
                {...aria('placedOn')}
              />
              {err('placedOn')}
            </div>
            <div className={styles.field}>
              <label htmlFor={id('book')}>Sportsbook</label>
              <input
                id={id('book')}
                data-field="book"
                list={id('books')}
                value={book}
                maxLength={40}
                autoComplete="off"
                onChange={(e) => setBook(e.target.value)}
                {...aria('book')}
              />
              <datalist id={id('books')}>
                {BOOK_SUGGESTIONS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              {err('book')}
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor={id('sport')}>Sport</label>
              <input
                id={id('sport')}
                data-field="sport"
                value={sport}
                maxLength={40}
                onChange={(e) => setSport(e.target.value)}
                {...aria('sport')}
              />
              {err('sport')}
            </div>
            <div className={styles.field}>
              <label htmlFor={id('event')}>Event (optional)</label>
              <input
                id={id('event')}
                data-field="event"
                value={event}
                maxLength={120}
                placeholder="Miami Heat vs Milwaukee Bucks"
                onChange={(e) => setEvent(e.target.value)}
                {...aria('event')}
              />
              {err('event')}
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor={id('desc')}>Bet</label>
            <input
              id={id('desc')}
              data-field="description"
              value={description}
              maxLength={160}
              placeholder="Over 61.5 · 3rd Quarter Total"
              onChange={(e) => setDescription(e.target.value)}
              {...aria('description')}
            />
            {err('description')}
          </div>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <span className={styles.fieldLabel} id={id('type')}>
                Bet type
              </span>
              <Segmented
                label="Bet type"
                value={betType}
                onChange={(v) => {
                  setBetType(v);
                  if (v === 'parlay' && (num(legs) ?? 1) < 2) setLegs('2');
                }}
                options={[
                  { value: 'single', label: 'Single' },
                  { value: 'parlay', label: 'Parlay' },
                ]}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={id('legs')}>Legs</label>
              <input
                id={id('legs')}
                data-field="legs"
                type="number"
                inputMode="numeric"
                min={betType === 'parlay' ? 2 : 1}
                max={20}
                value={betType === 'single' ? '1' : legs}
                disabled={betType === 'single'}
                onChange={(e) => setLegs(e.target.value)}
                {...aria('legs')}
              />
              {err('legs')}
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <div className={styles.labelRow}>
                <label htmlFor={id('odds')}>Odds ({oddsMode})</label>
                <Segmented
                  label="Odds format"
                  value={oddsMode}
                  onChange={switchOdds}
                  className={styles.mini}
                  options={[
                    { value: 'decimal', label: 'Decimal' },
                    { value: 'american', label: 'American' },
                  ]}
                />
              </div>
              <input
                id={id('odds')}
                data-field="odds"
                inputMode="decimal"
                value={oddsText}
                placeholder={oddsMode === 'decimal' ? '1.80' : '-120'}
                autoComplete="off"
                onChange={(e) => setOddsText(e.target.value)}
                {...aria('odds')}
              />
              {err('odds')}
            </div>
            <div className={styles.field}>
              <label htmlFor={id('stake')}>Stake</label>
              <input
                id={id('stake')}
                data-field="stake"
                inputMode="decimal"
                value={stake}
                placeholder="365"
                autoComplete="off"
                onChange={(e) => setStake(e.target.value)}
                {...aria('stake')}
              />
              {err('stake')}
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor={id('cur')}>Currency</label>
              <select id={id('cur')} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {[...new Set([...CURRENCIES, currency])].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor={id('result')}>Result</label>
              <select
                id={id('result')}
                value={result}
                onChange={(e) => setResult(e.target.value as BetResult)}
              >
                {BET_RESULTS.map((r) => (
                  <option key={r} value={r}>
                    {RESULT_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor={id('payout')}>
              Payout{result === 'cashout' ? '' : ' (calculated)'}
            </label>
            <input
              id={id('payout')}
              data-field="payout"
              inputMode="decimal"
              readOnly={result !== 'cashout'}
              value={
                result === 'cashout'
                  ? cashout
                  : result === 'pending' || payout === null
                    ? ''
                    : payout.toFixed(2)
              }
              placeholder={result === 'cashout' ? 'Amount you cashed out for' : '—'}
              autoComplete="off"
              onChange={(e) => setCashout(e.target.value)}
              {...aria('payout')}
            />
            {err('payout')}
          </div>

          <div className={styles.field}>
            <label htmlFor={id('notes')}>Notes (optional)</label>
            <textarea
              id={id('notes')}
              data-field="notes"
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              {...aria('notes')}
            />
            {err('notes')}
          </div>

          <p className={styles.preview} role="status" data-testid="bet-preview">
            {ready && payout !== null && shownProfit !== null ? (
              <>
                <span className={styles.previewLabel}>{previewLabel}</span> Payout{' '}
                <strong>{formatMoney(payout, cur)}</strong> · Profit{' '}
                <strong
                  className={
                    shownProfit > 0 ? styles.pos : shownProfit < 0 ? styles.neg : undefined
                  }
                >
                  {formatSignedMoney(shownProfit, cur)}
                </strong>
              </>
            ) : (
              <span className={styles.previewLabel}>
                {ready ? previewLabel : 'Enter odds and stake to preview the payout'}
              </span>
            )}
          </p>

          {formError ? (
            <p role="alert" className={styles.err}>
              {formError}
            </p>
          ) : null}

          <div className={styles.actions}>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : bet ? 'Save changes' : 'Save bet'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
