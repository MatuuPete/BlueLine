import type { Market, NormGame } from '@blueline/contracts';
import { addDays, nyDate } from '../dates';
import { fetchJson, query } from '../http';
import type { HttpDeps, OddsProvider } from '../types';
import {
  matchToaEvent,
  parseToaEvents,
  parseToaGameLines,
  parseToaProps,
  TOA_MARKET_KEYS,
  type ToaEvent,
} from './parse';

export const TOA_BASE = 'https://api.the-odds-api.com';
export const TOA_PROVIDER = 'theoddsapi';
const SPORT = '/v4/sports/basketball_nba';
const REGIONS = ['us'];
/** spreads + totals, one region. */
const GAME_LINE_UNITS = 2 * REGIONS.length;

/** Units actually charged: the `x-requests-last` header, else the documented formula. */
function unitsFrom(headers: Headers, fallback: number): number {
  const n = Number(headers.get('x-requests-last'));
  return headers.has('x-requests-last') && Number.isFinite(n) ? n : fallback;
}

/**
 * The Odds API v4. The events list is free and cached per provider; each
 * event-odds pull costs markets × regions units.
 */
export function createTheOddsApiProvider(deps: HttpDeps): OddsProvider {
  let eventsList: Promise<ToaEvent[]> | undefined;

  const key = () => {
    if (!deps.apiKey) throw new Error('THE_ODDS_API_KEY is required for ODDS_PROVIDER=theoddsapi');
    return deps.apiKey;
  };

  /** GET with the key appended to the URL only (never to recorded params). */
  const get = (endpoint: string, path: string, params: Record<string, string>) =>
    fetchJson(deps, {
      provider: TOA_PROVIDER,
      endpoint,
      params,
      url: `${TOA_BASE}${path}${query({ ...params, apiKey: key() })}`,
    });

  function events(): Promise<ToaEvent[]> {
    eventsList ??= get(`${SPORT}/events`, `${SPORT}/events`, {}).then(
      (r) => parseToaEvents(r.body),
      (err: unknown) => {
        eventsList = undefined;
        throw err;
      },
    );
    return eventsList;
  }

  return {
    name: TOA_PROVIDER,
    async getPlayerProps(game: NormGame, markets: Market[]) {
      const event = matchToaEvent(await events(), game);
      if (!event || markets.length === 0) return { offers: [], units: 0 };
      const params = {
        regions: REGIONS.join(','),
        oddsFormat: 'american',
        markets: markets.map((m) => TOA_MARKET_KEYS[m]).join(','),
      };
      const { body, headers } = await get(
        `${SPORT}/events/{id}/odds`,
        `${SPORT}/events/${encodeURIComponent(event.id)}/odds`,
        params,
      );
      return {
        offers: parseToaProps(body, game, markets),
        units: unitsFrom(headers, markets.length * REGIONS.length),
      };
    },
    async getGameLines(dateYmd: string) {
      const params = {
        regions: REGIONS.join(','),
        oddsFormat: 'american',
        markets: 'spreads,totals',
        commenceTimeFrom: `${dateYmd}T10:00:00Z`,
        commenceTimeTo: `${addDays(dateYmd, 1)}T10:00:00Z`,
      };
      const { body, headers } = await get(`${SPORT}/odds`, `${SPORT}/odds`, params);
      const lines = parseToaGameLines(body).filter((l) => nyDate(l.tipAt) === dateYmd);
      return { lines, units: unitsFrom(headers, GAME_LINE_UNITS) };
    },
    estimateUnits(games: number, markets: number) {
      return games * markets * REGIONS.length + GAME_LINE_UNITS;
    },
  };
}

export * from './parse';
