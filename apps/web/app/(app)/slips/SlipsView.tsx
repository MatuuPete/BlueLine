'use client';

import { BOOK_LABELS, MARKET_LABELS, type LegResult, type SlipDTO } from '@blueline/contracts';
import { parlay } from '@blueline/analytics';
import { Button, buttonClassName, EmptyState, formatAmerican, formatLine } from '@blueline/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatDecimalOdds } from '../../../lib/slip';
import { dayET } from '../../../lib/time';
import styles from '../_ui/page.module.css';
import own from './slips.module.css';

const RESULT_TEXT: Record<LegResult, string> = {
  pending: 'Pending',
  hit: 'Hit',
  miss: 'Miss',
  push: 'Push',
  void: 'Void',
};

function slipResult(s: SlipDTO): string {
  const r = s.legs.map((l) => l.result);
  if (r.includes('miss')) return 'Lost';
  if (r.includes('pending')) return 'Pending';
  if (r.every((x) => x === 'void' || x === 'push')) return 'Void';
  return 'Won';
}

export function SlipsView({ slips }: { slips: SlipDTO[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const remove = async (id: string) => {
    setBusy(id);
    setError('');
    try {
      const res = await fetch(`/api/slips/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setError('The slip was not deleted. Try again.');
    } finally {
      setBusy(null);
    }
  };

  if (slips.length === 0) {
    return (
      <div className={styles.emptyCard}>
        <EmptyState
          title="No saved slips yet"
          hint="Add props to the slip from the board, then press Save slip."
          action={
            <Link href="/" className={buttonClassName('primary')}>
              Browse the board
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <>
      {error ? (
        <p role="alert" className={own.error}>
          {error}
        </p>
      ) : null}
      <ul className={own.list}>
        {slips.map((s) => {
          const odds = parlay(s.legs.map((l) => ({ price: l.price })));
          const result = slipResult(s);
          return (
            <li key={s.id} className={styles.card}>
              <div className={`${styles.row} ${styles.spread}`}>
                <div className={styles.titleBlock}>
                  <h2 className={styles.h2}>{s.name}</h2>
                  <p className={styles.muted}>
                    Saved {dayET(s.createdAt)} · {s.legs.length}{' '}
                    {s.legs.length === 1 ? 'leg' : 'legs'}
                    {s.book ? ` · ${BOOK_LABELS[s.book]}` : ''}
                    {s.stake !== null ? ` · stake ${s.stake}` : ''}
                  </p>
                </div>
                <div className={own.odds}>
                  <span className={styles.mono}>{formatAmerican(Math.round(odds.american))}</span>
                  <span className={styles.muted}>{formatDecimalOdds(odds.decimal)} decimal</span>
                  <span className={own.result} data-result={result.toLowerCase()}>
                    {result}
                  </span>
                </div>
              </div>
              <ol className={own.legs}>
                {s.legs.map((l) => (
                  <li key={l.id} className={own.leg}>
                    <span>
                      <strong>{l.playerName}</strong>{' '}
                      <span className={styles.mono}>
                        {l.side === 'over' ? 'O' : 'U'} {formatLine(l.line)}
                      </span>{' '}
                      <span className={styles.muted}>{MARKET_LABELS[l.market]}</span>
                    </span>
                    <span className={styles.mono}>{formatAmerican(l.price)}</span>
                    <span className={own.legResult} data-result={l.result}>
                      {RESULT_TEXT[l.result]}
                    </span>
                  </li>
                ))}
              </ol>
              <div>
                <Button
                  variant="ghost"
                  disabled={busy === s.id}
                  onClick={() => void remove(s.id)}
                  aria-label={`Delete slip ${s.name}`}
                >
                  {busy === s.id ? 'Deleting slip…' : 'Delete slip'}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
