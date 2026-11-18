import { BOOKS, MARKETS, type NormGame } from '@blueline/contracts';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseScoreboard } from '../src/espn/parse';
import { createTheOddsApiProvider } from '../src/theoddsapi';
import {
  matchToaEvent,
  parseToaEvents,
  parseToaGameLines,
  parseToaProps,
  TOA_MARKET_KEYS,
} from '../src/theoddsapi/parse';
import { deps, fixture, FIXTURES, recorder, stubFetch } from './helpers';

const DATE = '2026-11-17';
const games = parseScoreboard(fixture(`espn/scoreboard/${DATE}.json`));
const events = parseToaEvents(fixture('theoddsapi/events.json'));
const oddsFiles = readdirSync(join(FIXTURES, 'theoddsapi', 'event-odds'));

function gameWithProps(): { game: NormGame; body: unknown; id: string } {
  for (const game of games) {
    const ev = matchToaEvent(events, game);
    if (ev && oddsFiles.includes(`${ev.id}.json`)) {
      return { game, body: fixture(`theoddsapi/event-odds/${ev.id}.json`), id: ev.id };
    }
  }
  throw new Error('no fixture game with props');
}

describe('The Odds API parsers', () => {
  it('has hand-built props for at least 4 games', () => {
    expect(oddsFiles.length).toBeGreaterThanOrEqual(4);
    const matched = games.filter((g) => {
      const ev = matchToaEvent(events, g);
      return ev && oddsFiles.includes(`${ev.id}.json`);
    });
    expect(matched.length).toBeGreaterThanOrEqual(4);
  });

  it('maps every market key to one of ours', () => {
    expect(Object.keys(TOA_MARKET_KEYS).sort()).toEqual([...MARKETS].sort());
  });

  it('every offer carries line, prices, book and market; unknown books are dropped', () => {
    const { game, body, id } = gameWithProps();
    const offers = parseToaProps(body, game, [...MARKETS]);
    expect(offers.length).toBeGreaterThan(100);
    for (const o of offers) {
      expect(BOOKS).toContain(o.book);
      expect(MARKETS).toContain(o.market);
      expect(Number.isFinite(o.line)).toBe(true);
      expect(typeof o.overPrice).toBe('number');
      expect(typeof o.underPrice).toBe('number');
      expect(o.providerGameId).toBe(id);
      expect(o.gameExternalId).toBe(game.externalId);
      expect(o.providerPlayerId).toBe(o.playerName);
    }
    const books = new Set(offers.map((o) => o.book));
    expect(books).toEqual(new Set(['draftkings', 'fanduel', 'betmgm', 'caesars']));
  });

  it('filters to the requested markets (snapshot of one player)', () => {
    const { game, body } = gameWithProps();
    const offers = parseToaProps(body, game, ['PTS', 'STOCKS']);
    expect(new Set(offers.map((o) => o.market))).toEqual(new Set(['PTS', 'STOCKS']));
    const name = offers[0]!.playerName;
    expect(offers.filter((o) => o.playerName === name)).toMatchSnapshot();
  });

  it('reads game lines with the spread from the home side', () => {
    const lines = parseToaGameLines(fixture(`theoddsapi/odds/${DATE}.json`));
    expect(lines).toHaveLength(5 * 4);
    const first = lines[0]!;
    expect(first.homeTeam).toBe('TOR');
    expect(first.awayTeam).toBe('NY');
    expect(typeof first.spread).toBe('number');
    expect(typeof first.total).toBe('number');
  });
});

describe('createTheOddsApiProvider', () => {
  it('bills x-requests-last, records each response, never records the key', async () => {
    const { game, body, id } = gameWithProps();
    const log: string[] = [];
    const { fetch, requests } = stubFetch(
      [
        { match: `/events/${id}/odds`, body, headers: { 'x-requests-last': '3' } },
        { match: '/sports/basketball_nba/events?', body: fixture('theoddsapi/events.json') },
      ],
      log,
    );
    const { record, records } = recorder(log);
    const toa = createTheOddsApiProvider(deps({ fetch, record, apiKey: 'secret-key' }));

    const res = await toa.getPlayerProps(game, ['PTS', 'REB', 'AST']);
    expect(res.units).toBe(3);
    expect(new Set(res.offers.map((o) => o.market))).toEqual(new Set(['PTS', 'REB', 'AST']));
    expect(log).toEqual(['fetch', 'record', 'fetch', 'record']);
    expect(requests[1]!.url).toContain('regions=us');
    expect(requests[1]!.url).toContain('oddsFormat=american');
    expect(requests[1]!.url).toContain('markets=player_points%2Cplayer_rebounds%2Cplayer_assists');
    expect(requests[1]!.url).toContain('apiKey=secret-key');
    expect(JSON.stringify(records)).not.toContain('secret-key');
    expect(records.map((r) => r.endpoint)).toEqual([
      '/v4/sports/basketball_nba/events',
      '/v4/sports/basketball_nba/events/{id}/odds',
    ]);

    // The events list is fetched once per provider.
    await toa.getPlayerProps(game, ['PTS']);
    expect(requests.filter((r) => r.url.includes('/events?'))).toHaveLength(1);
  });

  it('falls back to markets × regions when x-requests-last is missing', async () => {
    const { game, body, id } = gameWithProps();
    const { fetch } = stubFetch([
      { match: `/events/${id}/odds`, body },
      { match: '/sports/basketball_nba/events?', body: fixture('theoddsapi/events.json') },
    ]);
    const toa = createTheOddsApiProvider(deps({ fetch, apiKey: 'k' }));
    expect((await toa.getPlayerProps(game, ['PTS', 'REB'])).units).toBe(2);
  });

  it('returns no offers and 0 units for a game the provider does not list', async () => {
    const { fetch } = stubFetch([{ match: '/sports/basketball_nba/events?', body: [] }]);
    const toa = createTheOddsApiProvider(deps({ fetch, apiKey: 'k' }));
    expect(await toa.getPlayerProps(games[0]!, ['PTS'])).toEqual({ offers: [], units: 0 });
  });

  it('pulls game lines for one day', async () => {
    const { fetch, requests } = stubFetch([
      {
        match: '/sports/basketball_nba/odds',
        body: fixture(`theoddsapi/odds/${DATE}.json`),
        headers: { 'x-requests-last': '2' },
      },
    ]);
    const toa = createTheOddsApiProvider(deps({ fetch, apiKey: 'k' }));
    const res = await toa.getGameLines(DATE);
    expect(res.units).toBe(2);
    expect(res.lines).toHaveLength(20);
    expect(requests[0]!.url).toContain('markets=spreads%2Ctotals');
  });

  it('estimates games × markets plus the game-lines pull', () => {
    const toa = createTheOddsApiProvider(deps());
    expect(toa.estimateUnits(4, 3)).toBe(14);
  });
});
