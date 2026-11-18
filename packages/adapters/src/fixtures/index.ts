// Fixture providers: replay the recorded files in packages/adapters/fixtures through
// the same parsers the live providers use. They cost 0 units and never fetch.
//
// Dates are remapped so the board is never empty: the recorded "anchor" day
// (manifest.anchorDate, the first upcoming day) is replayed as `deps.fixtureDate`
// (default: today in America/New_York), and every other date and tip time
// shifts by the same number of days.
import type { Market, NormGame } from '@blueline/contracts';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, daysBetween, nyDate, shiftInstant } from '../dates';
import {
  parseInjuries,
  parseRoster,
  parseScoreboard,
  parseSummary,
  parseTeams,
} from '../espn/parse';
import { matchSgoEvent, parseSgoEvents, parseSgoGameLines, parseSgoProps } from '../sgo/parse';
import type { HttpDeps, OddsProvider, StatsProvider } from '../types';

export const FIXTURES_PROVIDER = 'fixtures';

/** Absolute path of packages/adapters/fixtures (path.resolve, not new URL: see db/client.ts). */
export const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');

interface Manifest {
  anchorDate: string;
  finishedDates: string[];
  upcomingDates: string[];
}

async function readJson(rel: string): Promise<unknown> {
  return JSON.parse(await readFile(join(FIXTURES_DIR, rel), 'utf8'));
}

/** Like readJson, but a missing file is `fallback` (a day without fixtures). */
async function readOptional(rel: string, fallback: unknown): Promise<unknown> {
  try {
    return await readJson(rel);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

let manifestP: Promise<Manifest> | undefined;
function manifest(): Promise<Manifest> {
  manifestP ??= readJson('espn/manifest.json') as Promise<Manifest>;
  return manifestP;
}

/** Days to add to recorded dates. */
async function shiftDays(deps: HttpDeps): Promise<number> {
  const { anchorDate } = await manifest();
  return daysBetween(anchorDate, deps.fixtureDate ?? nyDate(new Date()));
}

function shiftGame(g: NormGame, days: number): NormGame {
  return days === 0 ? g : { ...g, date: addDays(g.date, days), tipAt: shiftInstant(g.tipAt, days) };
}

export function createFixtureStatsProvider(deps: HttpDeps): StatsProvider {
  return {
    name: FIXTURES_PROVIDER,
    async getTeams() {
      return parseTeams(await readJson('espn/teams.json'));
    },
    async getRoster(teamExternalId) {
      const body = await readOptional(`espn/rosters/${teamExternalId}.json`, { athletes: [] });
      return parseRoster(body, teamExternalId);
    },
    async getSchedule(dateYmd) {
      const shift = await shiftDays(deps);
      const body = await readOptional(`espn/scoreboard/${addDays(dateYmd, -shift)}.json`, {
        events: [],
      });
      return parseScoreboard(body).map((g) => shiftGame(g, shift));
    },
    async getBoxScore(gameExternalId) {
      const shift = await shiftDays(deps);
      const box = parseSummary(await readJson(`espn/summary/${gameExternalId}.json`));
      return { ...box, game: shiftGame(box.game, shift) };
    },
    async getInjuries() {
      return parseInjuries(await readJson('espn/injuries.json'));
    },
    async listDates() {
      const shift = await shiftDays(deps);
      const m = await manifest();
      return [...m.finishedDates, ...m.upcomingDates].sort().map((d) => addDays(d, shift));
    },
  };
}

export function createFixtureOddsProvider(deps: HttpDeps): OddsProvider {
  const eventsFor = async (recordedDate: string) =>
    parseSgoEvents(await readOptional(`sgo/events/${recordedDate}.json`, { data: [] }));

  return {
    name: FIXTURES_PROVIDER,
    async getPlayerProps(game: NormGame, markets: Market[]) {
      const shift = await shiftDays(deps);
      const recorded = shiftGame(game, -shift);
      const event = matchSgoEvent(await eventsFor(recorded.date), recorded);
      return { offers: event ? parseSgoProps(event, recorded, markets) : [], units: 0 };
    },
    async getGameLines(dateYmd: string) {
      const shift = await shiftDays(deps);
      const events = await eventsFor(addDays(dateYmd, -shift));
      const lines = events
        .flatMap(parseSgoGameLines)
        .map((l) => ({ ...l, tipAt: shiftInstant(l.tipAt, shift) }));
      return { lines, units: 0 };
    },
    estimateUnits() {
      return 0;
    },
  };
}
