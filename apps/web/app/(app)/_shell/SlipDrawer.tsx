'use client';

import type { GameLogEntry, PropDetail } from '@blueline/contracts';
import { MARKET_LABELS } from '@blueline/contracts';
import { Button, buttonClassName, EmptyState, formatAmerican, formatLine } from '@blueline/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  correlatedKeys,
  formatDecimalOdds,
  jointFromLogs,
  slipBody,
  slipOdds,
  type SlipLeg,
} from '../../../lib/slip';
import { shortDate } from '../../../lib/time';
import { CloseIcon } from './icons';
import { useSlip } from './SlipContext';
import styles from './slip.module.css';

const logCache = new Map<string, Promise<GameLogEntry[] | null>>();

/** One player's game log (via the detail API), cached per player/market/game for the session. */
function fetchLogs(leg: SlipLeg): Promise<GameLogEntry[] | null> {
  const id = `${leg.playerId}:${leg.market}:${leg.gameId}`;
  let p = logCache.get(id);
  if (!p) {
    const url = `/api/props/${encodeURIComponent(leg.playerId)}/${encodeURIComponent(leg.market)}?gameId=${encodeURIComponent(leg.gameId)}`;
    p = fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<PropDetail>) : null))
      .then((d) => d?.logs ?? null)
      .catch(() => null);
    logCache.set(id, p);
  }
  return p;
}

function useJointRate(legs: SlipLeg[], enabled: boolean) {
  const [logs, setLogs] = useState<Map<string, GameLogEntry[]>>(new Map());
  useEffect(() => {
    if (!enabled || legs.length < 2) return;
    let live = true;
    void Promise.all(legs.map(async (l) => [l.key, await fetchLogs(l)] as const)).then(
      (pairs) => {
        if (!live) return;
        const m = new Map<string, GameLogEntry[]>();
        for (const [k, v] of pairs) if (v) m.set(k, v);
        setLogs(m);
      },
    );
    return () => {
      live = false;
    };
  }, [legs, enabled]);
  return legs.length < 2 ? null : jointFromLogs(legs, logs);
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled])';

/** The slip drawer: legs, combined odds (parlay), joint hit rate, "Save slip". */
export function SlipDrawer() {
  const { legs, remove, clear, open, setOpen, notice } = useSlip();
  const router = useRouter();
  const titleId = useId();
  const nameId = useId();
  const ref = useRef<HTMLElement>(null);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const joint = useJointRate(legs, open);
  const odds = slipOdds(legs);
  const correlated = correlatedKeys(legs);
  const body = slipBody(name.trim() || defaultName(), legs);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    if (status === 'saved' || status === 'error') setStatus('idle');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const save = async () => {
    if (!body) return;
    setStatus('saving');
    try {
      const res = await fetch('/api/slips', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      clear();
      setName('');
      setStatus('saved');
      router.refresh();
    } catch {
      setStatus('error');
    }
  };

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {notice}
      </p>
      {open ? (
        <div className={styles.overlay}>
          <div className={styles.scrim} onClick={close} aria-hidden="true" />
          <section
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={styles.drawer}
            onKeyDown={onKeyDown}
          >
            <header className={styles.head}>
              <h2 id={titleId} className={styles.title}>
                Slip
              </h2>
              <button type="button" className={styles.close} onClick={close} aria-label="Close slip">
                <CloseIcon />
              </button>
            </header>

            {status === 'saved' ? (
              <div className={styles.saved} role="status">
                <p>Slip saved.</p>
                <Link href="/slips" className={buttonClassName('secondary')} onClick={close}>
                  View saved slips
                </Link>
              </div>
            ) : null}

            {legs.length === 0 ? (
              status === 'saved' ? null : (
                <EmptyState
                  title="Your slip is empty"
                  hint="Add props from the board with the + button."
                  action={
                    <Link href="/" className={buttonClassName('primary')} onClick={close}>
                      Browse the board
                    </Link>
                  }
                />
              )
            ) : (
              <>
                <ol className={styles.legs}>
                  {legs.map((l) => (
                    <li key={l.key} className={styles.leg}>
                      <div className={styles.legMain}>
                        <span className={styles.legName}>{l.playerName}</span>
                        <span className={styles.legProp}>
                          {l.side === 'over' ? 'Over' : 'Under'} {formatLine(l.line)}{' '}
                          {MARKET_LABELS[l.market]}
                        </span>
                        <span className={styles.legMeta}>
                          {l.matchup}
                          {correlated.has(l.key) ? (
                            <span className={styles.corr}>Correlated</span>
                          ) : null}
                        </span>
                      </div>
                      <span className={styles.legPrice}>
                        {l.price === null ? 'No price' : formatAmerican(l.price)}
                      </span>
                      <button
                        type="button"
                        className={styles.remove}
                        onClick={() => remove(l.key)}
                        aria-label={`Remove ${l.playerName} ${l.market} from slip`}
                      >
                        <CloseIcon />
                      </button>
                    </li>
                  ))}
                </ol>

                <dl className={styles.summary}>
                  <div>
                    <dt>Combined odds</dt>
                    <dd className={styles.big}>
                      {odds ? formatAmerican(Math.round(odds.american)) : '—'}
                    </dd>
                    <dd className={styles.small}>
                      {odds
                        ? `${formatDecimalOdds(odds.decimal)} decimal`
                        : 'Every leg needs a price'}
                    </dd>
                  </div>
                  <div>
                    <dt>Hit together</dt>
                    <dd className={styles.big}>
                      {joint && joint.rate !== null ? `${Math.round(joint.rate * 100)}%` : '—'}
                    </dd>
                    <dd className={styles.small}>
                      {legs.length < 2
                        ? 'Add a second leg'
                        : joint === null
                          ? 'Loading game logs'
                          : joint.n === 0
                            ? 'No games all these players played'
                            : `${joint.hits} of ${joint.n} shared games`}
                    </dd>
                  </div>
                </dl>
                {correlated.size > 0 ? (
                  <p className={styles.note}>
                    Correlated legs come from the same game, so their results move together.
                  </p>
                ) : null}

                <div className={styles.saveRow}>
                  <label htmlFor={nameId} className={styles.label}>
                    Slip name
                  </label>
                  <input
                    id={nameId}
                    className={styles.input}
                    value={name}
                    maxLength={80}
                    placeholder={defaultName()}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Button
                    size="lg"
                    onClick={() => void save()}
                    disabled={!body || status === 'saving'}
                    className={styles.saveBtn}
                  >
                    {status === 'saving' ? 'Saving slip…' : 'Save slip'}
                  </Button>
                  {status === 'error' ? (
                    <p className={styles.error} role="alert">
                      The slip was not saved. Check your connection and save again.
                    </p>
                  ) : null}
                  <Button variant="ghost" onClick={clear}>
                    Clear slip
                  </Button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

function defaultName(): string {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  return `Slip · ${shortDate(ymd)}`;
}
