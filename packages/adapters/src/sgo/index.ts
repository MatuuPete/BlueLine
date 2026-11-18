import type { Market, NormGame } from '@blueline/contracts';
import { addDays, nyDate } from '../dates';
import { fetchJson, query } from '../http';
import type { HttpDeps, OddsProvider } from '../types';
import {
  matchSgoEvent,
  parseSgoGameLines,
  parseSgoPage,
  parseSgoProps,
  type SgoEvent,
} from './parse';

export const SGO_BASE = 'https://api.sportsgameodds.com';
export const SGO_PROVIDER = 'sgo';

/**
 * SportsGameOdds v2. One `/v2/events` pull per slate day serves every game's
 * props and that day's game lines, cached for the provider's lifetime (one job
 * run). Units = events returned, billed on the first pull of the day.
 */
export function createSgoProvider(deps: HttpDeps): OddsProvider {
  const days = new Map<string, Promise<SgoEvent[]>>();

  async function fetchDay(dateYmd: string): Promise<SgoEvent[]> {
    if (!deps.apiKey) throw new Error('SGO_API_KEY is required for ODDS_PROVIDER=sgo');
    // NBA tips fall between noon and 11pm ET, so this UTC window covers one NY day.
    const base: Record<string, string> = {
      leagueID: 'NBA',
      oddsAvailable: 'true',
      startsAfter: `${dateYmd}T10:00:00Z`,
      startsBefore: `${addDays(dateYmd, 1)}T10:00:00Z`,
      limit: '50',
    };
    const out: SgoEvent[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const params = cursor ? { ...base, cursor } : base;
      const { body } = await fetchJson(deps, {
        provider: SGO_PROVIDER,
        endpoint: '/v2/events',
        params,
        url: `${SGO_BASE}/v2/events${query(params)}`,
        headers: { 'x-api-key': deps.apiKey },
      });
      const p = parseSgoPage(body);
      out.push(...p.data);
      if (!p.nextCursor) break;
      cursor = p.nextCursor;
    }
    return out.filter((e) => nyDate(e.status.startsAt) === dateYmd);
  }

  /** The day's events; `units` is the event count on the first pull, else 0. */
  async function eventsFor(dateYmd: string): Promise<{ events: SgoEvent[]; units: number }> {
    const cached = days.get(dateYmd);
    if (cached) return { events: await cached, units: 0 };
    const p = fetchDay(dateYmd);
    days.set(dateYmd, p);
    try {
      const events = await p;
      return { events, units: events.length };
    } catch (err) {
      days.delete(dateYmd);
      throw err;
    }
  }

  return {
    name: SGO_PROVIDER,
    async getPlayerProps(game: NormGame, markets: Market[]) {
      const { events, units } = await eventsFor(game.date);
      const event = matchSgoEvent(events, game);
      return { offers: event ? parseSgoProps(event, game, markets) : [], units };
    },
    async getGameLines(dateYmd: string) {
      const { events, units } = await eventsFor(dateYmd);
      return { lines: events.flatMap(parseSgoGameLines), units };
    },
    estimateUnits(games: number) {
      return games;
    },
  };
}

export * from './parse';
