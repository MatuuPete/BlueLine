'use client';

import {
  BOOK_LABELS,
  DVP_TIERS,
  MARKET_LABELS,
  MARKETS,
  type Book,
  type DetailSplit,
  type DvpTier,
  type GameLogEntry,
  type InjuryStatus,
  type PropDetail,
  type Side,
} from '@blueline/contracts';
import { allWindows, consensusNoVig, hitRate, mean, median, statValue } from '@blueline/analytics';
import {
  Badge,
  BOOK_SHORT,
  Button,
  Chip,
  DefenseChip,
  GameLogChart,
  HEAT_WINDOWS,
  HeatCell,
  MINUS,
  ordinal,
  Segmented,
  TIER_LABELS,
  formatLine,
  type GameLogEntryView,
} from '@blueline/ui';
import Link from 'next/link';
import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  applySplits,
  bestPriceAt,
  defaultLine,
  DEFAULT_SPLIT,
  stepLine,
  type SplitContext,
} from '../../../../../lib/detail-splits';
import { formatOdds, type OddsFormat } from '../../../../../lib/odds-format';
import { dateTimeET, monogram, shortDate, tipTimeET } from '../../../../../lib/time';
import { useSlip } from '../../../_shell/SlipContext';
import { useFavorites } from '../../../_board/useFavorites';
import styles from './detail.module.css';

const POSITION_NAMES = { G: 'Guard', F: 'Forward', C: 'Center' } as const;
const STAT_WORDS: Record<string, string> = {
  PTS: 'points',
  REB: 'rebounds',
  AST: 'assists',
  '3PM': 'threes made',
  STL: 'steals',
  BLK: 'blocks',
  TOV: 'turnovers',
  PRA: 'points + rebounds + assists',
  PR: 'points + rebounds',
  PA: 'points + assists',
  RA: 'rebounds + assists',
  STOCKS: 'steals + blocks',
};

function injuryTone(s: InjuryStatus): 'out' | 'questionable' | null {
  if (s === 'out') return 'out';
  if (s === 'probable') return null;
  return 'questionable';
}
const STATUS_TEXT: Record<InjuryStatus, string> = {
  out: 'Out',
  doubtful: 'Doubtful',
  questionable: 'Questionable',
  'day-to-day': 'Day-to-day',
  probable: 'Probable',
};

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length < 2 ? name : `${parts[0]!.charAt(0)}. ${parts.slice(1).join(' ')}`;
}

/** Number of non-default splits (window excluded: it is always set). */
function activeSplits(s: DetailSplit): number {
  let n = 0;
  if (s.homeAway !== 'all') n++;
  if (s.rest !== 'all') n++;
  if (s.vsOpponent) n++;
  if (s.teammateId) n++;
  if (s.minMinutes !== undefined) n++;
  if (s.oppTiers.length) n++;
  if (s.role !== 'all') n++;
  if (s.season !== 'all') n++;
  if (s.result !== 'all') n++;
  return n;
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.group}>
      <span className={styles.groupLabel} aria-hidden="true">
        {label}
      </span>
      <div role="group" aria-label={label} className={styles.chips}>
        {children}
      </div>
    </div>
  );
}

export function PropDetailView({
  detail,
  initialSide,
  favoriteKeys,
  books,
  oddsFormat,
  today,
}: {
  detail: PropDetail;
  initialSide: Side;
  favoriteKeys: string[];
  books: Book[];
  oddsFormat: OddsFormat;
  today: string;
}) {
  const { player, game, market, logs, shop, teammates, injuries, matchup, lineMoves } = detail;
  const isHome = game.home.id === player.teamId;
  const opp = isHome ? game.away : game.home;
  const board = detail.metrics.find((m) => m.side === initialSide) ?? detail.metrics[0] ?? null;

  const [side, setSide] = useState<Side>(initialSide);
  const [line, setLine] = useState<number>(() => defaultLine(detail, initialSide));
  const [split, setSplit] = useState<DetailSplit>(DEFAULT_SPLIT);
  const slip = useSlip();
  const favs = useFavorites(favoriteKeys);
  const ids = { mins: useId(), mate: useId(), log: useId(), shop: useId(), match: useId(), inj: useId(), move: useId() };

  const season = useMemo(
    () => logs.reduce((s, l) => Math.max(s, l.season), 0) || Number(game.date.slice(0, 4)),
    [logs, game.date],
  );
  const ctx: SplitContext = { oppTeamId: opp.id, season, teammates };
  const patch = (p: Partial<DetailSplit>) => setSplit((s) => ({ ...s, ...p }));

  // Everything recomputes from the split and the (alt) line, instantly, in the browser.
  const chartLogs = applySplits(logs, split, ctx);
  const tileLogs = applySplits(logs, { ...split, window: 'all' }, ctx);
  const rates = allWindows(tileLogs, market, line, side, { oppTeamId: opp.id, season });
  const values = chartLogs.map((l) => statValue(l, market));
  const chartRate = hitRate(chartLogs, market, line, side);
  const avg = mean(values);
  const med = median(values);

  const entries: GameLogEntryView[] = chartLogs.map((l: GameLogEntry) => ({
    value: statValue(l, market),
    label: `${l.isHome ? 'vs' : '@'} ${l.oppAbbr}`,
    sublabel: `${shortDate(l.date)} · ${Math.round(l.minutes)}m`,
    isH2h: l.oppTeamId === opp.id,
  }));

  const visibleShop = shop
    .filter((r) => books.length === 0 || books.includes(r.book))
    .sort((a, b) => a.line - b.line || a.book.localeCompare(b.book));
  const best = bestPriceAt(shop, line, side, books);
  const pairs = shop
    .filter((r) => r.line === line && r.overPrice !== null && r.underPrice !== null)
    .map((r) => ({ over: r.overPrice!, under: r.underPrice! }));
  const fair = consensusNoVig(pairs);
  const mainLine = board?.line ?? null;

  const legKey = `${game.id}:${player.id}:${market}:${side}`;
  const inSlip = slip.legs.some((l) => l.key === legKey && l.line === line);
  const favorite = favs.has({ playerId: player.id, market, side });

  const dvp = matchup.find((m) => m.window === 'season') ?? matchup[0] ?? null;
  const outMates = (board?.teammatesOut ?? []).filter((t) => t.status === 'out' || t.status === 'doubtful');
  const keyOut = outMates.map((t) => teammates.find((m) => m.playerId === t.playerId)).find(Boolean);
  const withoutRate = keyOut
    ? hitRate(
        applySplits(logs, { ...DEFAULT_SPLIT, window: 'all', teammateId: keyOut.playerId, teammateMode: 'without' }, ctx),
        market,
        line,
        side,
      )
    : null;

  const teamAbbr = (teamId: string) =>
    teamId === game.home.id ? game.home.abbr : teamId === game.away.id ? game.away.abbr : '';
  const tipLabel =
    game.status === 'final'
      ? `Final ${game.away.abbr} ${game.away.score ?? 0}–${game.home.abbr} ${game.home.score ?? 0}`
      : `${game.date === today ? 'Tonight' : shortDate(game.date)} ${tipTimeET(game.tipAt)}`;
  const rest =
    board?.restDays === null || board?.restDays === undefined
      ? null
      : board.restDays === 0
        ? 'Back-to-back'
        : `${board.restDays} ${board.restDays === 1 ? 'day' : 'days'} rest`;
  const meta = [player.teamAbbr, POSITION_NAMES[player.position], `${isHome ? 'vs' : '@'} ${opp.abbr}`, tipLabel, rest]
    .filter(Boolean)
    .join(' · ');
  const sideWord = side === 'over' ? 'Over' : 'Under';
  const altNote =
    mainLine !== null && line !== mainLine
      ? `Alt line (main ${formatLine(mainLine)}). `
      : mainLine !== null
        ? 'Main line. '
        : '';
  const priceNote = best
    ? `Best ${sideWord} ${formatOdds(best.price, oddsFormat)} at ${BOOK_LABELS[best.book]}.`
    : 'No book prices this line.';

  const toggleSlip = () =>
    slip.toggle({
      key: legKey,
      gameId: game.id,
      playerId: player.id,
      playerName: player.name,
      market,
      side,
      line,
      price: best?.price ?? null,
      matchup: `${game.away.abbr} @ ${game.home.abbr}`,
    });

  const chip = (label: string, on: boolean, onClick: () => void) => (
    <Chip pressed={on} onClick={onClick} key={label}>
      {label}
    </Chip>
  );
  const softOn = split.oppTiers.length === 2 && split.oppTiers.includes('bad') && split.oppTiers.includes('worst');
  const splitCount = activeSplits(split);

  return (
    <div className={styles.page}>
      <nav aria-label="Breadcrumb" className={styles.crumbs}>
        <Link href="/">Prop board</Link> <span aria-hidden="true">/</span>{' '}
        <span aria-current="page">{player.name}</span>
      </nav>

      <section aria-label="Player and prop" className={styles.header}>
        <div className={styles.who}>
          <div aria-hidden="true" className={styles.monogram}>
            {monogram(player.name)}
          </div>
          <div className={styles.whoText}>
            <h1 className={styles.h1}>{player.name}</h1>
            <p className={styles.meta}>{meta}</p>
            {outMates.length > 0 ? (
              <p className={styles.tout}>
                {outMates.map((t) => shortName(t.name)).join(', ')}{' '}
                {outMates.length === 1 ? 'is' : 'are'} out tonight
              </p>
            ) : null}
          </div>
        </div>

        <div className={styles.picker}>
          <div className={styles.lineCard}>
            <nav aria-label="Market" className={styles.markets}>
              {MARKETS.map((m) => (
                <Link
                  key={m}
                  href={`/props/${encodeURIComponent(player.id)}/${encodeURIComponent(m)}?gameId=${encodeURIComponent(game.id)}&side=${side}`}
                  aria-current={m === market ? 'page' : undefined}
                  className={styles.marketTab}
                  title={MARKET_LABELS[m]}
                >
                  {m}
                </Link>
              ))}
            </nav>
            <div className={styles.lineRow}>
              <Segmented
                label="Side"
                className={styles.sideSeg}
                value={side}
                options={[
                  { value: 'over', label: 'Over' },
                  { value: 'under', label: 'Under' },
                ]}
                onChange={(v) => {
                  setSide(v);
                  if (line === defaultLine(detail, side)) setLine(defaultLine(detail, v));
                }}
              />
              <button
                type="button"
                className={styles.step}
                aria-label="Lower the line by 0.5"
                onClick={() => setLine((l) => stepLine(l, -1))}
                disabled={line <= 0.5}
              >
                {MINUS}
              </button>
              <output aria-live="polite" aria-label={`${sideWord} line`} className={styles.line}>
                {formatLine(line)}
              </output>
              <button
                type="button"
                className={styles.step}
                aria-label="Raise the line by 0.5"
                onClick={() => setLine((l) => stepLine(l, 1))}
              >
                +
              </button>
            </div>
            <p className={styles.lineNote}>
              {MARKET_LABELS[market]}. {altNote}
              {priceNote}
            </p>
          </div>
          <div className={styles.actions}>
            <Button size="lg" aria-pressed={inSlip} onClick={toggleSlip}>
              {inSlip ? 'Remove from slip' : 'Add to slip'}
            </Button>
            <Button
              variant="secondary"
              aria-pressed={favorite}
              onClick={() => void favs.toggle({ playerId: player.id, market, side })}
            >
              {favorite ? 'Remove from favorites' : 'Save to favorites'}
            </Button>
            {favs.error ? (
              <p role="alert" className={styles.alert}>
                {favs.error}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section aria-label={`Hit rates, ${sideWord} ${formatLine(line)}`} className={styles.tiles}>
        {HEAT_WINDOWS.map((w) => (
          <HeatCell
            key={w.key}
            size="lg"
            label={w.label}
            hits={rates[w.key].hits}
            n={rates[w.key].n}
            active={split.window !== 'all' && w.key === split.window}
          />
        ))}
      </section>

      <div className={styles.columns}>
        <section aria-labelledby={ids.log} className={styles.logCard}>
          <div className={styles.logHead}>
            <h2 id={ids.log} className={styles.h2}>
              Game log vs {side === 'over' ? 'O' : 'U'} {formatLine(line)}
            </h2>
            <p className={styles.summary} aria-live="polite">
              {chartRate.n === 0
                ? 'No games match these splits'
                : `Cleared ${chartRate.hits} of ${chartRate.n}${chartRate.pushes ? ` (${chartRate.pushes} push${chartRate.pushes > 1 ? 'es' : ''})` : ''} · avg ${avg?.toFixed(1)} · median ${med?.toFixed(1)}`}
            </p>
          </div>

          <div className={styles.splits}>
            <Group label="Window">
              {(['l5', 'l10', 'l20', 'all'] as const).map((w) =>
                chip(w === 'all' ? 'All' : w.toUpperCase(), split.window === w, () => patch({ window: w })),
              )}
            </Group>
            <Group label="Venue">
              {(['all', 'home', 'away'] as const).map((v) =>
                chip(v === 'all' ? 'All' : v === 'home' ? 'Home' : 'Away', split.homeAway === v, () => patch({ homeAway: v })),
              )}
            </Group>
            <Group label="Rest">
              {(
                [
                  ['all', 'All'],
                  ['b2b', 'B2B'],
                  ['one', '1 day'],
                  ['twoPlus', '2+ days'],
                ] as const
              ).map(([v, label]) => chip(label, split.rest === v, () => patch({ rest: v })))}
            </Group>
            <Group label="Context">
              {chip(`vs ${opp.abbr}`, split.vsOpponent, () => patch({ vsOpponent: !split.vsOpponent }))}
              {chip('30+ minutes', split.minMinutes === 30, () =>
                patch({ minMinutes: split.minMinutes === 30 ? undefined : 30 }),
              )}
              {chip('Soft defenses', softOn, () => patch({ oppTiers: softOn ? [] : ['bad', 'worst'] }))}
              {chip('Wins', split.result === 'win', () => patch({ result: split.result === 'win' ? 'all' : 'win' }))}
              {chip('Losses', split.result === 'loss', () =>
                patch({ result: split.result === 'loss' ? 'all' : 'loss' }),
              )}
            </Group>

            <div className={styles.group}>
              <label htmlFor={ids.mate} className={styles.groupLabel}>
                Teammate
              </label>
              <div className={styles.chips}>
                <select
                  id={ids.mate}
                  className={styles.select}
                  value={split.teammateId ?? ''}
                  onChange={(e) => patch({ teammateId: e.target.value || undefined })}
                >
                  <option value="">Any lineup</option>
                  {teammates.map((t) => (
                    <option key={t.playerId} value={t.playerId}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <Segmented
                  label="With or without the teammate"
                  className={styles.mateSeg}
                  value={split.teammateMode}
                  options={[
                    { value: 'with', label: 'With' },
                    { value: 'without', label: 'Without' },
                  ]}
                  onChange={(v) => patch({ teammateMode: v })}
                />
              </div>
            </div>

            <details className={styles.more}>
              <summary className={styles.moreSummary}>More splits</summary>
              <div className={styles.moreBody}>
                <Group label="Role">
                  {(
                    [
                      ['all', 'All'],
                      ['starter', 'Starter'],
                      ['bench', 'Bench'],
                    ] as const
                  ).map(([v, label]) => chip(label, split.role === v, () => patch({ role: v })))}
                </Group>
                <Group label="Season">
                  {(
                    [
                      ['all', 'Both'],
                      ['current', 'This season'],
                      ['last', 'Last season'],
                    ] as const
                  ).map(([v, label]) => chip(label, split.season === v, () => patch({ season: v })))}
                </Group>
                <Group label="Opponent defense then">
                  {DVP_TIERS.map((t: DvpTier) =>
                    chip(TIER_LABELS[t], split.oppTiers.includes(t), () =>
                      patch({
                        oppTiers: split.oppTiers.includes(t)
                          ? split.oppTiers.filter((x) => x !== t)
                          : [...split.oppTiers, t],
                      }),
                    ),
                  )}
                </Group>
                <div className={styles.group}>
                  <label htmlFor={ids.mins} className={styles.groupLabel}>
                    Minutes at least
                  </label>
                  <input
                    id={ids.mins}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={60}
                    className={styles.num}
                    value={split.minMinutes ?? ''}
                    onChange={(e) => {
                      const v = e.target.value === '' ? undefined : Number(e.target.value);
                      patch({ minMinutes: v === undefined || !Number.isFinite(v) ? undefined : Math.max(0, Math.min(60, v)) });
                    }}
                  />
                </div>
              </div>
            </details>
            {splitCount > 0 ? (
              <Button variant="ghost" onClick={() => setSplit({ ...DEFAULT_SPLIT, window: split.window })}>
                Clear splits ({splitCount})
              </Button>
            ) : null}
          </div>

          <GameLogChart
            entries={entries}
            line={line}
            side={side}
            statLabel={STAT_WORDS[market]}
            h2hLabel={`vs ${opp.name}`}
            emptyAction={<Button onClick={() => setSplit(DEFAULT_SPLIT)}>Clear splits</Button>}
          />
        </section>

        <aside aria-label="Prices and matchup" className={styles.side}>
          <section aria-labelledby={ids.shop} className={styles.card}>
            <h2 id={ids.shop} className={styles.h3}>
              Line shopping
            </h2>
            {visibleShop.length === 0 ? (
              <p className={styles.muted}>
                No sportsbook prices yet{books.length ? ' for your books' : ''}. Prices arrive with the next odds pull.
              </p>
            ) : (
              <div role="table" aria-label="Prices by sportsbook" className={styles.shop}>
                <div role="row" className={`${styles.shopRow} ${styles.shopHead}`}>
                  <span role="columnheader">Book</span>
                  <span role="columnheader">Line</span>
                  <span role="columnheader" className={styles.right}>
                    Over
                  </span>
                  <span role="columnheader" className={styles.right}>
                    Under
                  </span>
                </div>
                {visibleShop.map((r) => {
                  const cell = (price: number | null, isBest: boolean, s: Side) => (
                    <span role="cell" className={styles.right}>
                      {price === null ? (
                        '—'
                      ) : (
                        <span className={isBest && s === side && r.line === line ? styles.best : undefined}>
                          {formatOdds(price, oddsFormat)}
                          {isBest && s === side && r.line === line ? <span className="sr-only"> (best)</span> : null}
                        </span>
                      )}
                    </span>
                  );
                  return (
                    <div
                      role="row"
                      key={`${r.book}:${r.line}`}
                      className={`${styles.shopRow} ${r.line === line ? styles.shopOn : ''}`}
                    >
                      <span role="cell" className={styles.book} title={BOOK_LABELS[r.book]}>
                        {BOOK_SHORT[r.book]}
                      </span>
                      <span role="cell">{formatLine(r.line)}</span>
                      {cell(r.overPrice, r.isBestOver, 'over')}
                      {cell(r.underPrice, r.isBestUnder, 'under')}
                    </div>
                  );
                })}
              </div>
            )}
            <p className={styles.muted}>
              {fair
                ? `Fair chance of the ${sideWord} ${formatLine(line)} with the vig removed: ${Math.round((side === 'over' ? fair.over : fair.under) * 100)}% (average of ${pairs.length} ${pairs.length === 1 ? 'book' : 'books'}).`
                : `No book posts both sides at ${formatLine(line)}, so there is no fair price.`}
            </p>
          </section>

          <section aria-labelledby={ids.match} className={styles.card}>
            <h2 id={ids.match} className={styles.h3}>
              Matchup
            </h2>
            {dvp ? (
              <div className={styles.matchRow}>
                <DefenseChip tier={dvp.tier} rank={dvp.rank} position={player.position} side={side} />
                <p className={styles.matchText}>
                  {opp.name} allow {dvp.allowedPerGame.toFixed(1)} {STAT_WORDS[market]} per game to{' '}
                  {POSITION_NAMES[player.position].toLowerCase()}s, {ordinal(dvp.rank)} of 30 (1st = toughest).
                </p>
              </div>
            ) : (
              <p className={styles.muted}>Defense-vs-position ranks are not computed yet.</p>
            )}
            <div className={styles.facts}>
              <div className={styles.fact}>
                <span className={styles.factLabel}>Game total</span>
                <span className={styles.factValue}>{game.total === null ? '—' : game.total.toFixed(1)}</span>
              </div>
              <div className={styles.fact}>
                <span className={styles.factLabel}>Spread</span>
                <span className={styles.factValue}>
                  {game.spread === null
                    ? '—'
                    : `${player.teamAbbr} ${(() => {
                        const s = isHome ? game.spread : -game.spread;
                        return `${s > 0 ? '+' : s < 0 ? MINUS : ''}${Math.abs(s).toFixed(1)}`;
                      })()}`}
                </span>
              </div>
            </div>
          </section>

          <section aria-labelledby={ids.inj} className={styles.card}>
            <h2 id={ids.inj} className={styles.h3}>
              Injury report
            </h2>
            {injuries.length === 0 ? (
              <p className={styles.muted}>Nobody on either team is listed.</p>
            ) : (
              <ul className={styles.list}>
                {injuries.map((i) => {
                  const tone = injuryTone(i.status);
                  return (
                    <li key={i.playerId} className={styles.injury}>
                      <span>
                        <strong>{shortName(i.name)}</strong>{' '}
                        <span className={styles.muted}>
                          {teamAbbr(i.teamId)}
                          {i.detail ? ` · ${i.detail}` : ''}
                        </span>
                      </span>
                      {tone ? (
                        <Badge tone={tone}>{STATUS_TEXT[i.status]}</Badge>
                      ) : (
                        <span className={styles.muted}>{STATUS_TEXT[i.status]}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {keyOut && withoutRate && withoutRate.n > 0 ? (
              <p className={styles.muted}>
                Without {shortName(keyOut.name)}, {shortName(player.name)} cleared {sideWord.toLowerCase()}{' '}
                {formatLine(line)} in {withoutRate.hits} of {withoutRate.n} games.
              </p>
            ) : null}
          </section>

          <section aria-labelledby={ids.move} className={styles.card}>
            <h2 id={ids.move} className={styles.h3}>
              Line movement
            </h2>
            {lineMoves.length === 0 ? (
              <p className={styles.muted}>No line history yet.</p>
            ) : (
              <ul className={styles.list}>
                {lineMoves
                  .slice(-8)
                  .reverse()
                  .map((m, i) => {
                    const price = side === 'over' ? m.overPrice : m.underPrice;
                    return (
                      <li key={`${m.book}:${m.capturedAt}:${i}`} className={styles.move}>
                        <span className={styles.muted}>
                          {dateTimeET(m.capturedAt)} ·{' '}
                          {BOOK_SHORT[m.book]}
                        </span>
                        <span className={styles.mono}>{formatLine(m.line)}</span>
                        <span className={`${styles.mono} ${styles.muted}`}>
                          {price === null ? '—' : formatOdds(price, oddsFormat)}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <p className={styles.note}>
        Hit rates leave out games the player did not play; a push is not counted. Splits and the
        alt line recompute everything here from {logs.length} logged games this season and last.
      </p>
    </div>
  );
}
