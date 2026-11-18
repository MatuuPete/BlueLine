'use client';

import { BOOK_LABELS, BOOKS, type Book, type UserSettings } from '@blueline/contracts';
import { BOOK_SHORT, Button, Chip, Segmented } from '@blueline/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { chooseTheme } from '../../../lib/settings-client';
import styles from '../_ui/page.module.css';
import own from './settings.module.css';

export function SettingsForm({ initial }: { initial: UserSettings }) {
  const router = useRouter();
  const [s, setS] = useState<UserSettings>(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const introId = useId();
  const set = (p: Partial<UserSettings>) => {
    setS((prev) => ({ ...prev, ...p }));
    setStatus('idle');
  };
  const toggleBook = (b: Book) =>
    set({ books: s.books.includes(b) ? s.books.filter((x) => x !== b) : [...s.books, b] });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(s),
      });
      if (!res.ok) throw new Error(String(res.status));
      setS((await res.json()) as UserSettings);
      setStatus('saved');
      router.refresh();
    } catch {
      setStatus('error');
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className={own.form}>
      <section className={styles.card} aria-labelledby="set-look">
        <h2 id="set-look" className={styles.h2}>
          Look
        </h2>
        <div className={own.field}>
          <span className={own.label} aria-hidden="true">
            Theme
          </span>
          <Segmented
            label="Theme"
            className={own.seg}
            value={s.theme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
            onChange={(v) => {
              // Like the top-bar toggle: applies now, writes the cookie, saves userSettings.theme.
              chooseTheme(v === 'system' ? null : v, true);
              set({ theme: v });
            }}
          />
        </div>
        <div className={own.field}>
          <span className={own.label} aria-hidden="true">
            Odds format
          </span>
          <Segmented
            label="Odds format"
            className={own.seg}
            value={s.oddsFormat}
            options={[
              { value: 'american', label: 'American' },
              { value: 'decimal', label: 'Decimal' },
            ]}
            onChange={(v) => set({ oddsFormat: v })}
          />
          <p className={styles.muted}>Used in line shopping and line movement on prop pages.</p>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="set-books">
        <h2 id="set-books" className={styles.h2}>
          Your sportsbooks
        </h2>
        <p className={styles.muted}>
          Line shopping shows only these books. Pick none to see every book.
        </p>
        <div role="group" aria-label="Sportsbooks" className={own.books}>
          {BOOKS.map((b) => (
            <Chip
              key={b}
              shape="rounded"
              pressed={s.books.includes(b)}
              onClick={() => toggleBook(b)}
            >
              <span className={own.bookCode}>{BOOK_SHORT[b]}</span> {BOOK_LABELS[b]}
            </Chip>
          ))}
        </div>
      </section>

      <section className={styles.card} aria-labelledby="set-intro">
        <h2 id="set-intro" className={styles.h2}>
          Intro
        </h2>
        <label htmlFor={introId} className={own.check}>
          <input
            id={introId}
            type="checkbox"
            checked={s.skipIntro}
            onChange={(e) => set({ skipIntro: e.target.checked })}
          />
          Skip the intro and open the board directly
        </label>
        <p className={styles.muted}>
          The logo in the top bar always opens the intro.{' '}
          <Link href="/status">Check data status</Link>
        </p>
      </section>

      <div className={own.actions}>
        <Button type="submit" size="lg" disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving settings…' : 'Save settings'}
        </Button>
        <p role="status" className={status === 'error' ? own.error : styles.muted}>
          {status === 'saved'
            ? 'Settings saved.'
            : status === 'error'
              ? 'Settings were not saved. Try again.'
              : ''}
        </p>
      </div>
    </form>
  );
}
