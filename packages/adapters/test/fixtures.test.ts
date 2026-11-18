import { MARKETS } from '@blueline/contracts';
import { describe, expect, it, vi } from 'vitest';
import { addDays, nyDate } from '../src/dates';
import {
  parseInjuries,
  parseRoster,
  parseScoreboard,
  parseSummary,
  parseTeams,
} from '../src/espn/parse';
import { createFixtureOddsProvider, createFixtureStatsProvider } from '../src/fixtures';
import { createOddsProvider, createStatsProvider } from '../src/index';
import { matchSgoEvent, parseSgoEvents, parseSgoProps } from '../src/sgo/parse';
import { deps, fixture } from './helpers';

const ANCHOR = '2026-11-17';

function strictDeps(fixtureDate?: string) {
  const record = vi.fn(async () => {});
  return { d: deps({ record, fixtureDate }), record };
}

describe('fixture stats provider, replayed as recorded (no shift)', () => {
  const { d, record } = strictDeps(ANCHOR);
  const stats = createFixtureStatsProvider(d);

  it('replays the recorded files through the ESPN parsers', async () => {
    expect(stats.name).toBe('fixtures');
    expect(await stats.getSchedule(ANCHOR)).toEqual(
      parseScoreboard(fixture(`espn/scoreboard/${ANCHOR}.json`)),
    );
    expect(await stats.getBoxScore('401909994')).toEqual(
      parseSummary(fixture('espn/summary/401909994.json')),
    );
    expect(await stats.getTeams()).toEqual(parseTeams(fixture('espn/teams.json')));
    expect(await stats.getRoster('2')).toEqual(parseRoster(fixture('espn/rosters/2.json'), '2'));
    expect(await stats.getInjuries()).toEqual(parseInjuries(fixture('espn/injuries.json')));
    expect(record).not.toHaveBeenCalled();
  });

  it('returns no games for a day without fixtures', async () => {
    expect(await stats.getSchedule('2026-11-03')).toEqual([]);
  });

  it('lists ≥ 30 finished fixture days plus the upcoming days', async () => {
    const dates = await stats.listDates!();
    expect(dates).toEqual([...dates].sort());
    expect(dates.filter((x) => x < ANCHOR).length).toBeGreaterThanOrEqual(30);
    expect(dates).toContain(ANCHOR);
    expect(dates).toContain('2026-11-18');
  });
});

describe('fixture stats provider, shifted onto another "today"', () => {
  const TODAY = '2026-12-01';
  const SHIFT = 14;
  const stats = createFixtureStatsProvider(strictDeps(TODAY).d);

  it('maps the anchor day onto today, shifting dates and tip times', async () => {
    const recorded = parseScoreboard(fixture(`espn/scoreboard/${ANCHOR}.json`));
    const games = await stats.getSchedule(TODAY);
    expect(games).toHaveLength(recorded.length);
    for (const [i, g] of games.entries()) {
      const r = recorded[i]!;
      expect(g.externalId).toBe(r.externalId);
      expect(g.date).toBe(TODAY);
      expect(Date.parse(g.tipAt) - Date.parse(r.tipAt)).toBe(SHIFT * 86_400_000);
      expect(g.status).toBe('scheduled');
    }
    expect(await stats.getSchedule(ANCHOR)).toEqual([]);
  });

  it('shifts box-score games the same way', async () => {
    const box = await stats.getBoxScore('401909994');
    expect(box.game.date).toBe(addDays('2026-11-16', SHIFT));
    expect(box.lines).toEqual(parseSummary(fixture('espn/summary/401909994.json')).lines);
  });

  it('lists shifted dates', async () => {
    const dates = await stats.listDates!();
    expect(dates).toContain(TODAY);
    expect(dates).toContain(addDays(TODAY, 1));
    expect(dates.at(-1)).toBe(addDays(TODAY, 1));
  });
});

describe('fixture stats provider defaults to today (America/New_York)', () => {
  it('replays the anchor day as today', async () => {
    const stats = createFixtureStatsProvider(deps());
    const today = nyDate(new Date());
    const games = await stats.getSchedule(today);
    expect(games.length).toBe(5);
    expect(games.every((g) => g.date === today)).toBe(true);
  });
});

describe('fixture odds provider', () => {
  const TODAY = '2026-12-01';
  const { d, record } = strictDeps(TODAY);
  const stats = createFixtureStatsProvider(d);
  const odds = createFixtureOddsProvider(d);

  it('replays SGO fixtures for shifted games, at 0 units', async () => {
    const games = await stats.getSchedule(TODAY);
    expect(games.length).toBeGreaterThanOrEqual(4);
    for (const g of games) {
      const res = await odds.getPlayerProps(g, [...MARKETS]);
      expect(res.units).toBe(0);
      expect(res.offers.length).toBeGreaterThan(0);
      expect(res.offers.every((o) => o.gameExternalId === g.externalId)).toBe(true);
      expect(new Set(res.offers.map((o) => o.book)).size).toBeGreaterThanOrEqual(3);
    }
    // Same parser output as reading the file directly
    const recorded = parseScoreboard(fixture(`espn/scoreboard/${ANCHOR}.json`))[0]!;
    const event = matchSgoEvent(parseSgoEvents(fixture(`sgo/events/${ANCHOR}.json`)), recorded)!;
    expect((await odds.getPlayerProps(games[0]!, ['PTS'])).offers).toEqual(
      parseSgoProps(event, recorded, ['PTS']),
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('replays game lines with shifted tip times', async () => {
    const res = await odds.getGameLines(TODAY);
    expect(res.units).toBe(0);
    expect(res.lines.length).toBe(20);
    for (const l of res.lines) expect(nyDate(l.tipAt)).toBe(TODAY);
    expect((await odds.getGameLines('2026-10-01')).lines).toEqual([]);
  });

  it('costs nothing', () => {
    expect(odds.estimateUnits(10, 12)).toBe(0);
  });
});

describe('provider factories', () => {
  it('create each provider by name', () => {
    const d = deps();
    expect(createStatsProvider('espn', d).name).toBe('espn');
    expect(createStatsProvider('fixtures', d).name).toBe('fixtures');
    expect(createOddsProvider('sgo', d).name).toBe('sgo');
    expect(createOddsProvider('theoddsapi', d).name).toBe('theoddsapi');
    expect(createOddsProvider('fixtures', d).name).toBe('fixtures');
  });

  it('reject unknown names', () => {
    expect(() => createStatsProvider('nba' as 'espn', deps())).toThrow(/Unknown stats provider/);
    expect(() => createOddsProvider('x' as 'sgo', deps())).toThrow(/Unknown odds provider/);
  });
});
