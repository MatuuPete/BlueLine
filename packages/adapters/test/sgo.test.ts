import { BOOKS, MARKETS, type NormGame } from '@blueline/contracts';
import { describe, expect, it } from 'vitest';
import { parseScoreboard } from '../src/espn/parse';
import { createSgoProvider } from '../src/sgo';
import {
  matchSgoEvent,
  parseOddId,
  parseSgoEvents,
  parseSgoGameLines,
  parseSgoProps,
} from '../src/sgo/parse';
import { deps, fixture, recorder, stubFetch } from './helpers';

const DATE = '2026-11-17';
const events = parseSgoEvents(fixture(`sgo/events/${DATE}.json`));
const games = parseScoreboard(fixture(`espn/scoreboard/${DATE}.json`));
const torNy = games.find((g) => g.externalId === '401910002') as NormGame;

describe('parseOddId', () => {
  it('maps player over/under oddIDs to (market, side)', () => {
    expect(parseOddId('points-JAYSON_TATUM_1_NBA-game-ou-over')).toEqual({
      market: 'PTS',
      playerId: 'JAYSON_TATUM_1_NBA',
      side: 'over',
    });
    expect(parseOddId('points+rebounds+assists-A_B_1_NBA-game-ou-under')).toMatchObject({
      market: 'PRA',
      side: 'under',
    });
    expect(parseOddId('threePointersMade-A_B_1_NBA-game-ou-over')?.market).toBe('3PM');
    expect(parseOddId('blocks+steals-A_B_1_NBA-game-ou-over')?.market).toBe('STOCKS');
  });

  it('ignores team markets, other periods and unknown stats', () => {
    expect(parseOddId('points-home-game-sp-home')).toBeNull();
    expect(parseOddId('points-all-game-ou-over')).toBeNull();
    expect(parseOddId('points-A_B_1_NBA-1h-ou-over')).toBeNull();
    expect(parseOddId('doubleDouble-A_B_1_NBA-game-yn-yes')).toBeNull();
  });
});

describe('parseSgoProps', () => {
  const event = matchSgoEvent(events, torNy);

  it('matches the SGO event to the ESPN game by teams and date', () => {
    expect(event).toBeDefined();
    expect(event!.teams.home.names.long).toBe('Toronto Raptors');
  });

  it('every offer carries line, prices, a known book and market', () => {
    const offers = parseSgoProps(event!, torNy, [...MARKETS]);
    expect(offers.length).toBeGreaterThan(100);
    for (const o of offers) {
      expect(BOOKS).toContain(o.book);
      expect(MARKETS).toContain(o.market);
      expect(typeof o.line).toBe('number');
      expect(Number.isFinite(o.line)).toBe(true);
      expect(typeof o.overPrice).toBe('number');
      expect(typeof o.underPrice).toBe('number');
      expect(o.gameExternalId).toBe('401910002');
      expect(o.providerGameId).toBe(event!.eventID);
      expect(['TOR', 'NY']).toContain(o.teamAbbr);
    }
  });

  it('drops unknown books (bovada) and keeps ≥ 3 books per prop', () => {
    const offers = parseSgoProps(event!, torNy, [...MARKETS]);
    expect(offers.some((o) => (o.book as string) === 'bovada')).toBe(false);
    const books = new Map<string, Set<string>>();
    for (const o of offers) {
      const k = `${o.providerPlayerId}:${o.market}`;
      books.set(k, (books.get(k) ?? new Set()).add(o.book));
    }
    for (const set of books.values()) expect(set.size).toBeGreaterThanOrEqual(3);
  });

  it('only returns the requested markets', () => {
    const offers = parseSgoProps(event!, torNy, ['PTS', 'REB']);
    expect(new Set(offers.map((o) => o.market))).toEqual(new Set(['PTS', 'REB']));
  });

  it('normalizes one player (snapshot)', () => {
    const offers = parseSgoProps(event!, torNy, ['PTS', 'PRA']);
    const first = offers[0]!.providerPlayerId;
    expect(offers.filter((o) => o.providerPlayerId === first)).toMatchSnapshot();
  });
});

describe('parseSgoGameLines', () => {
  it('reads spread (home perspective) and total per book', () => {
    const lines = parseSgoGameLines(events[0]!);
    expect(lines.length).toBe(4);
    for (const l of lines) {
      expect(l.homeTeam).toBe('TOR');
      expect(l.awayTeam).toBe('NY');
      expect(typeof l.spread).toBe('number');
      expect(typeof l.total).toBe('number');
      expect(l.tipAt).toBe('2026-11-18T00:30:00.000Z');
    }
  });
});

describe('createSgoProvider', () => {
  const body = fixture(`sgo/events/${DATE}.json`);

  it('sends the key as a header, records once per page, bills events once per day', async () => {
    const log: string[] = [];
    const { fetch, requests } = stubFetch([{ match: '/v2/events', body }], log);
    const { record, records } = recorder(log);
    const sgo = createSgoProvider(deps({ fetch, record, apiKey: 'k-123' }));

    const first = await sgo.getPlayerProps(torNy, ['PTS']);
    expect(first.units).toBe(5);
    expect(first.offers.length).toBeGreaterThan(0);
    const second = await sgo.getPlayerProps(games[1]!, ['PTS']);
    expect(second.units).toBe(0);
    const lines = await sgo.getGameLines(DATE);
    expect(lines.units).toBe(0);
    expect(lines.lines.length).toBe(20);

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toContain('leagueID=NBA');
    expect(requests[0]!.url).toContain('oddsAvailable=true');
    expect(requests[0]!.url).not.toContain('k-123');
    expect(requests[0]!.headers['x-api-key']).toBe('k-123');
    expect(log).toEqual(['fetch', 'record']);
    expect(records[0]).toMatchObject({ provider: 'sgo', endpoint: '/v2/events' });
    expect(JSON.stringify(records[0]!.params)).not.toContain('k-123');
  });

  it('follows nextCursor pages', async () => {
    const all = (body as { data: unknown[] }).data;
    const { fetch, requests } = stubFetch([
      { match: 'cursor=c2', body: { success: true, data: all.slice(2), nextCursor: null } },
      { match: '/v2/events', body: { success: true, data: all.slice(0, 2), nextCursor: 'c2' } },
    ]);
    const { record, records } = recorder();
    const sgo = createSgoProvider(deps({ fetch, record, apiKey: 'k' }));
    const res = await sgo.getPlayerProps(games[4]!, ['PTS']);
    expect(requests).toHaveLength(2);
    expect(records).toHaveLength(2);
    expect(res.units).toBe(5);
    expect(res.offers.length).toBeGreaterThan(0);
  });

  it('estimates one unit per game regardless of markets', () => {
    const sgo = createSgoProvider(deps());
    expect(sgo.estimateUnits(5, 12)).toBe(5);
    expect(sgo.estimateUnits(5, 1)).toBe(5);
  });
});
