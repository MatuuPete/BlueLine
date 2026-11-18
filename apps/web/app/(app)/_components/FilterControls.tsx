'use client';

import {
  BOARD_SORTS,
  BOOKS,
  BOOK_LABELS,
  DVP_TIERS,
  MARKETS,
  POSITIONS,
  WINDOWS,
  type BoardFilter,
  type BoardSort,
  type Window,
} from '@blueline/contracts';
import { BOOK_SHORT, Chip, Segmented, TIER_LABELS } from '@blueline/ui';
import { useEffect, useId, useState, type ReactNode } from 'react';
import styles from './FilterControls.module.css';

export interface GameOption {
  id: string;
  label: string;
}

export interface FilterControlsProps {
  value: BoardFilter;
  onChange: (next: BoardFilter) => void;
  /** Today's games for the "Games" chips. Omit to hide the group. */
  games?: readonly GameOption[];
}

const NBA_TEAMS = [
  'ATL',
  'BKN',
  'BOS',
  'CHA',
  'CHI',
  'CLE',
  'DAL',
  'DEN',
  'DET',
  'GSW',
  'HOU',
  'IND',
  'LAC',
  'LAL',
  'MEM',
  'MIA',
  'MIL',
  'MIN',
  'NOP',
  'NYK',
  'OKC',
  'ORL',
  'PHI',
  'PHX',
  'POR',
  'SAC',
  'SAS',
  'TOR',
  'UTA',
  'WAS',
] as const;

const WINDOW_LABELS: Record<Window, string> = {
  l5: 'L5',
  l10: 'L10',
  l20: 'L20',
  season: 'Szn',
  h2h: 'H2H',
  lastSeason: 'LY',
};

const SORT_LABELS: Record<BoardSort, string> = {
  hitRate: 'Hit rate',
  edge: 'Edge',
  value: 'Value',
  odds: 'Odds',
  lineMove: 'Line move',
  streak: 'Streak',
  tipAt: 'Tip time',
};

const FLOORS = [
  { label: 'Any', value: undefined },
  { label: '60%', value: 60 },
  { label: '70%', value: 70 },
  { label: '80%', value: 80 },
] as const;

function toggleIn<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function Group({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className={styles.group}>
      <h3 className={styles.groupTitle}>{title}</h3>
      {children}
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </section>
  );
}

interface NumberFieldProps {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min: number;
  max: number;
  /** Extra validity check (e.g. American odds need |x| >= 100). */
  valid?: (n: number) => boolean;
  inputMode?: 'numeric' | 'decimal';
  suffix?: string;
}

const show = (v: number | undefined) => (v === undefined ? '' : String(v));

/** Number input that only commits values the schema would accept; empty clears the filter. */
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  valid,
  inputMode = 'numeric',
  suffix,
}: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]);

  const commit = (raw: string) => {
    setText(raw);
    if (raw.trim() === '') return onChange(undefined);
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > max || (valid && !valid(n))) return;
    onChange(n);
  };

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <span className={styles.inputWrap}>
        <input
          id={id}
          className={styles.input}
          type="text"
          inputMode={inputMode}
          value={text}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setText(show(value))}
        />
        {suffix ? (
          <span className={styles.suffix} aria-hidden="true">
            {suffix}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const americanOk = (n: number) => Number.isInteger(n) && Math.abs(n) >= 100 && Math.abs(n) <= 10000;

/** Every spec 6a filter group, controlled by `value`/`onChange`. Never fetches. */
export function FilterControls({ value, onChange, games }: FilterControlsProps) {
  const set = <K extends keyof BoardFilter>(key: K, v: BoardFilter[K]) =>
    onChange({ ...value, [key]: v, page: 1 });
  const dateId = useId();
  const searchId = useId();
  const sortId = useId();

  return (
    <div className={styles.controls}>
      <Group title="Scope">
        <div className={styles.field}>
          <label htmlFor={dateId} className={styles.fieldLabel}>
            Slate date
          </label>
          <input
            id={dateId}
            className={styles.input}
            type="date"
            value={value.date ?? ''}
            onChange={(e) => set('date', e.target.value === '' ? undefined : e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={searchId} className={styles.fieldLabel}>
            Player search
          </label>
          <input
            id={searchId}
            className={styles.input}
            type="search"
            maxLength={64}
            placeholder="Name"
            value={value.q ?? ''}
            onChange={(e) => set('q', e.target.value === '' ? undefined : e.target.value)}
          />
        </div>
        {games && games.length > 0 ? (
          <div className={styles.chips} role="group" aria-label="Games">
            {games.map((g) => (
              <Chip
                key={g.id}
                pressed={value.games.includes(g.id)}
                onClick={() => set('games', toggleIn(value.games, g.id))}
              >
                {g.label}
              </Chip>
            ))}
          </div>
        ) : null}
        <div className={styles.chips} role="group" aria-label="Position">
          {POSITIONS.map((p) => (
            <Chip
              key={p}
              pressed={value.positions.includes(p)}
              onClick={() => set('positions', toggleIn(value.positions, p))}
            >
              {p}
            </Chip>
          ))}
        </div>
        <details className={styles.details}>
          <summary className={styles.summary}>
            Teams{value.teams.length ? ` (${value.teams.length})` : ''}
          </summary>
          <div className={styles.chips} role="group" aria-label="Teams">
            {NBA_TEAMS.map((t) => (
              <Chip
                key={t}
                mono
                pressed={value.teams.includes(t)}
                onClick={() => set('teams', toggleIn(value.teams, t))}
              >
                {t}
              </Chip>
            ))}
          </div>
        </details>
      </Group>

      <Group title="Market">
        <div className={styles.chips} role="group" aria-label="Markets">
          {MARKETS.map((m) => (
            <Chip
              key={m}
              pressed={value.markets.includes(m)}
              onClick={() => set('markets', toggleIn(value.markets, m))}
            >
              {m}
            </Chip>
          ))}
        </div>
        <Segmented
          label="Side"
          value={value.side}
          onChange={(v) => set('side', v)}
          options={[
            { value: 'both', label: 'Both' },
            { value: 'over', label: 'Over' },
            { value: 'under', label: 'Under' },
          ]}
        />
      </Group>

      <Group title="Hit rate">
        <Segmented
          label="Hit-rate window"
          value={value.window}
          onChange={(v) => set('window', v)}
          options={WINDOWS.map((w) => ({ value: w, label: WINDOW_LABELS[w] }))}
        />
        <div className={styles.floors} role="group" aria-label="Minimum hit rate">
          {FLOORS.map((f) => (
            <Chip
              key={f.label}
              pressed={value.minHitRate === f.value}
              onClick={() => set('minHitRate', f.value)}
            >
              {f.label}
            </Chip>
          ))}
        </div>
        <div className={styles.pair}>
          <NumberField
            label="Hit rate at least"
            value={value.minHitRate}
            onChange={(v) => set('minHitRate', v)}
            min={0}
            max={100}
            suffix="%"
          />
          <NumberField
            label="Min games"
            value={value.minGames}
            onChange={(v) => set('minGames', v)}
            min={0}
            max={200}
          />
          <NumberField
            label="Streak at least"
            value={value.minStreak}
            onChange={(v) => set('minStreak', v)}
            min={-100}
            max={100}
          />
          <NumberField
            label="Edge at least"
            value={value.minEdge}
            onChange={(v) => set('minEdge', v)}
            min={-100}
            max={100}
            inputMode="decimal"
          />
        </div>
      </Group>

      <Group title="Best price">
        <div className={styles.pair}>
          <NumberField
            label="From"
            value={value.oddsMin}
            onChange={(v) => set('oddsMin', v)}
            min={-10000}
            max={10000}
            valid={americanOk}
          />
          <NumberField
            label="To"
            value={value.oddsMax}
            onChange={(v) => set('oddsMax', v)}
            min={-10000}
            max={10000}
            valid={americanOk}
          />
          <NumberField
            label="Value at least"
            value={value.minValue}
            onChange={(v) => set('minValue', v)}
            min={-100}
            max={100}
            inputMode="decimal"
            suffix="pts"
          />
        </div>
        <div className={styles.chips} role="group" aria-label="Sportsbooks">
          {BOOKS.map((b) => (
            <Chip
              key={b}
              mono
              shape="rounded"
              title={BOOK_LABELS[b]}
              pressed={value.books.includes(b)}
              onClick={() => set('books', toggleIn(value.books, b))}
            >
              {BOOK_SHORT[b]}
            </Chip>
          ))}
        </div>
        <Check
          label="Best price only"
          checked={value.bestPriceOnly}
          onChange={(v) => set('bestPriceOnly', v)}
        />
      </Group>

      <Group
        title="Opponent defense vs position"
        hint="Best = the 6 toughest defenses, Worst = the 6 softest."
      >
        <div className={styles.tiers} role="group" aria-label="Defense tier">
          {DVP_TIERS.map((t) => (
            <Chip
              key={t}
              shape="rounded"
              pressed={value.dvpTiers.includes(t)}
              onClick={() => set('dvpTiers', toggleIn(value.dvpTiers, t))}
            >
              {TIER_LABELS[t]}
            </Chip>
          ))}
        </div>
        <div className={styles.pair}>
          <NumberField
            label="DvP rank from"
            value={value.dvpRankMin}
            onChange={(v) => set('dvpRankMin', v)}
            min={1}
            max={30}
          />
          <NumberField
            label="DvP rank to"
            value={value.dvpRankMax}
            onChange={(v) => set('dvpRankMax', v)}
            min={1}
            max={30}
          />
        </div>
      </Group>

      <Group title="Situation">
        <Segmented
          label="Venue"
          value={value.homeAway}
          onChange={(v) => set('homeAway', v)}
          options={[
            { value: 'both', label: 'Both' },
            { value: 'home', label: 'Home' },
            { value: 'away', label: 'Away' },
          ]}
        />
        <Check
          label="Back-to-back only"
          checked={value.b2bOnly}
          onChange={(v) => set('b2bOnly', v)}
        />
        <div className={styles.pair}>
          <NumberField
            label="Rest days from"
            value={value.restDaysMin}
            onChange={(v) => set('restDaysMin', v)}
            min={0}
            max={30}
          />
          <NumberField
            label="Rest days to"
            value={value.restDaysMax}
            onChange={(v) => set('restDaysMax', v)}
            min={0}
            max={30}
          />
          <NumberField
            label="Game total from"
            value={value.totalMin}
            onChange={(v) => set('totalMin', v)}
            min={0}
            max={400}
            inputMode="decimal"
          />
          <NumberField
            label="Game total to"
            value={value.totalMax}
            onChange={(v) => set('totalMax', v)}
            min={0}
            max={400}
            inputMode="decimal"
          />
          <NumberField
            label="Spread within (blowout risk)"
            value={value.absSpreadMax}
            onChange={(v) => set('absSpreadMax', v)}
            min={0}
            max={50}
            inputMode="decimal"
          />
        </div>
      </Group>

      <Group title="Role">
        <div className={styles.pair}>
          <NumberField
            label="Minutes (L5) at least"
            value={value.minMinutes}
            onChange={(v) => set('minMinutes', v)}
            min={0}
            max={60}
            inputMode="decimal"
          />
          <NumberField
            label="Usage (L10) at least"
            value={value.minUsage}
            onChange={(v) => set('minUsage', v)}
            min={0}
            max={100}
            inputMode="decimal"
            suffix="%"
          />
        </div>
        <Check
          label="Starters only"
          checked={value.starterOnly}
          onChange={(v) => set('starterOnly', v)}
        />
      </Group>

      <Group title="Health">
        <Check
          label="Hide questionable players"
          checked={value.excludeQuestionable}
          onChange={(v) => set('excludeQuestionable', v)}
        />
        <Check
          label="A key teammate is out"
          checked={value.teammateOutOnly}
          onChange={(v) => set('teammateOutOnly', v)}
        />
      </Group>

      <Group title="Market moves">
        <div className={styles.pair}>
          <NumberField
            label="Line moved at least"
            value={value.minLineMove}
            onChange={(v) => set('minLineMove', v)}
            min={0}
            max={50}
            inputMode="decimal"
          />
        </div>
        <Segmented
          label="Line move direction"
          value={value.lineMoveDir}
          onChange={(v) => set('lineMoveDir', v)}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'up', label: 'Up' },
            { value: 'down', label: 'Down' },
          ]}
        />
      </Group>

      <Group title="Sort">
        <div className={styles.field}>
          <label htmlFor={sortId} className={styles.fieldLabel}>
            Sort by
          </label>
          <select
            id={sortId}
            className={styles.input}
            value={value.sort}
            onChange={(e) => set('sort', e.target.value as BoardSort)}
          >
            {BOARD_SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <Segmented
          label="Sort direction"
          value={value.dir}
          onChange={(v) => set('dir', v)}
          options={[
            { value: 'desc', label: 'High to low' },
            { value: 'asc', label: 'Low to high' },
          ]}
        />
      </Group>
    </div>
  );
}
