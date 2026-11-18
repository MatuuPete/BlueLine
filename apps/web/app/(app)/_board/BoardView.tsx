'use client';

import {
  BOARD_SORTS,
  DEFAULT_BOARD_FILTER,
  type BoardFilter,
  type BoardResponse,
  type BoardSort,
  type GameSummary,
  type PresetDTO,
} from '@blueline/contracts';
import { Button, EmptyState, HEAT_WINDOWS, Segmented, buttonClassName } from '@blueline/ui';
import Link from 'next/link';
import { useId, useState, useTransition } from 'react';
import { activeFilterCount } from '../../../lib/board-filter-url';
import { resetFilter } from '../../../lib/board-presets';
import { gameLine, gameStatus } from '../../../lib/game-format';
import { slateLabel, tipTimeET } from '../../../lib/time';
import { useBoardFilter } from '../../../lib/use-board-filter';
import { FilterRail } from '../_components/FilterRail';
import { FilterSheet } from '../_components/FilterSheet';
import { QuickFilters } from '../_components/QuickFilters';
import styles from './board.module.css';
import { BoardRows } from './BoardRows';
import { PresetDialog } from './PresetDialog';
import { useFavorites } from './useFavorites';

const SORT_LABELS: Record<Exclude<BoardSort, 'hitRate'>, string> = {
  edge: 'Edge vs line',
  value: 'Value vs fair price',
  odds: 'Best price',
  lineMove: 'Line movement',
  streak: 'Streak',
  tipAt: 'Tip-off time',
};

function gameOdds(g: GameSummary): string {
  if (g.status === 'scheduled') return gameLine(g) || `${g.propCount} props`;
  return gameStatus(g);
}

/** Fields worth saving in a preset: everything off-default except date and paging. */
function presetPatch(f: BoardFilter): Partial<BoardFilter> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (k === 'page' || k === 'date' || v === undefined) continue;
    const d = DEFAULT_BOARD_FILTER[k as keyof BoardFilter];
    if (JSON.stringify(v) !== JSON.stringify(d)) out[k] = v;
  }
  return out as Partial<BoardFilter>;
}

export function BoardView({
  board,
  games,
  favoriteKeys,
  presets,
  date,
  today,
  tomorrow,
}: {
  board: BoardResponse;
  games: GameSummary[];
  favoriteKeys: string[];
  presets: PresetDTO[];
  date: string;
  today: string;
  tomorrow: string;
}) {
  const [urlFilter, setUrlFilter] = useBoardFilter();
  const [pending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const favs = useFavorites(favoriteKeys);
  const sortId = useId();
  const headingId = useId();

  // R31: today's date stays out of the URL so shared links always mean "today".
  const setFilter = (next: BoardFilter) =>
    startTransition(() => setUrlFilter({ ...next, date: next.date === today ? undefined : next.date }));
  const filter: BoardFilter = { ...urlFilter, date };

  const gameOptions = games.map((g) => ({ id: g.id, label: `${g.away.abbr} @ ${g.home.abbr}` }));
  const windowLabel = HEAT_WINDOWS.find((w) => w.key === filter.window)?.label ?? 'L10';
  const { rows, total, page, pageSize } = board;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const filtered = activeFilterCount(filter) > 0;

  const countText =
    total === 0 ? 'No props' : `${total} ${total === 1 ? 'prop' : 'props'}${filtered ? ' match' : ''}`;
  const subtitle = `${slateLabel(date)} · ${games.length} ${games.length === 1 ? 'game' : 'games'} · ${countText}`;

  const empty =
    games.length === 0 ? (
      <EmptyState
        title="No games on this date"
        hint={date === today ? 'Switch to tomorrow or open the games list.' : 'Switch back to today or open the games list.'}
        action={
          <Button onClick={() => setFilter({ ...filter, date: date === today ? tomorrow : today, games: [], page: 1 })}>
            {date === today ? 'Show tomorrow' : 'Show today'}
          </Button>
        }
      />
    ) : filtered ? (
      <EmptyState
        title="No props match these filters"
        hint="Lower the hit-rate floor or widen the price range."
        action={<Button onClick={() => setFilter(resetFilter(filter))}>Reset filters</Button>}
      />
    ) : (
      <EmptyState
        title="No props posted yet"
        hint="Lines appear after the odds and precompute jobs run. Check the data status page."
        action={
          <Link href="/status" className={buttonClassName('primary')}>
            Open data status
          </Link>
        }
      />
    );

  return (
    <div className={styles.page}>
      <section aria-label="Games on this slate" className={styles.slate}>
        <div className={styles.slateInner}>
          <button
            type="button"
            aria-pressed={filter.games.length === 0}
            className={styles.game}
            onClick={() => setFilter({ ...filter, games: [] })}
          >
            <span className={styles.gameTitle}>All games</span>
            <span className={styles.gameSub}>{slateLabel(date).split(',')[0]}</span>
          </button>
          {games.map((g) => {
            const on = filter.games.length === 1 && filter.games[0] === g.id;
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={on}
                className={styles.game}
                onClick={() => setFilter({ ...filter, games: on ? [] : [g.id] })}
              >
                <span className={styles.gameLine}>
                  <span className={styles.gameTitle}>
                    {g.away.abbr} @ {g.home.abbr}
                  </span>
                  <span className={styles.gameTip}>{tipTimeET(g.tipAt).replace(' ET', '')}</span>
                </span>
                <span className={styles.gameOdds}>{gameOdds(g)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className={styles.wrap}>
        <div className={styles.railCol}>
          <FilterRail
            value={filter}
            onChange={setFilter}
            presets={presets}
            games={gameOptions}
            onSavePreset={() => setPresetOpen(true)}
          />
        </div>

        <section aria-labelledby={headingId} className={styles.boardCol}>
          <div className={styles.head}>
            <div className={styles.titleBlock}>
              <h1 id={headingId} className={styles.h1}>
                Prop board
              </h1>
              <p className={styles.sub}>{subtitle}</p>
            </div>
            <div className={styles.controls}>
              <Segmented
                label="Slate date"
                className={styles.dateSeg}
                value={date === tomorrow ? 'tomorrow' : date === today ? 'today' : 'other'}
                options={[
                  { value: 'today', label: 'Today' },
                  { value: 'tomorrow', label: 'Tomorrow' },
                ]}
                onChange={(v) =>
                  setFilter({ ...filter, date: v === 'tomorrow' ? tomorrow : today, games: [], page: 1 })
                }
              />
              <div className={styles.sortBox}>
                <label htmlFor={sortId} className={styles.sortLabel}>
                  Sort by
                </label>
                <select
                  id={sortId}
                  className={styles.select}
                  value={filter.sort}
                  onChange={(e) => setFilter({ ...filter, sort: e.target.value as BoardSort, page: 1 })}
                >
                  {BOARD_SORTS.map((s) => (
                    <option key={s} value={s}>
                      {s === 'hitRate' ? `${windowLabel} hit rate` : SORT_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className={styles.quick}>
            <QuickFilters value={filter} onChange={setFilter} onOpenFilters={() => setSheetOpen(true)} />
          </div>

          {favs.error ? (
            <p role="alert" className={styles.alert}>
              {favs.error}
            </p>
          ) : null}

          <div className={styles.results} aria-busy={pending} data-pending={pending ? 'true' : undefined}>
            <BoardRows
              rows={rows}
              activeWindow={filter.window}
              isFavorite={favs.has}
              onToggleFavorite={(r) => void favs.toggle(r)}
              label="NBA player props matching your filters"
              empty={empty}
            />
          </div>

          {total > pageSize ? (
            <nav aria-label="Pages" className={styles.pager}>
              <span className={styles.pagerText}>
                Showing {first}–{last} of {total}
              </span>
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setFilter({ ...filter, page: page - 1 })}
              >
                Previous page
              </Button>
              <Button
                variant="secondary"
                disabled={last >= total}
                onClick={() => setFilter({ ...filter, page: page + 1 })}
              >
                Next page
              </Button>
            </nav>
          ) : null}

          <p className={styles.note}>
            Hit rates leave out games the player did not play. A push on a whole-number line is
            not counted.
          </p>
        </section>
      </div>

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        value={filter}
        onChange={setFilter}
        presets={presets}
        resultCount={total}
        games={gameOptions}
        onSavePreset={() => {
          setSheetOpen(false);
          setPresetOpen(true);
        }}
      />
      <PresetDialog open={presetOpen} onClose={() => setPresetOpen(false)} filter={presetPatch(filter)} />
    </div>
  );
}
