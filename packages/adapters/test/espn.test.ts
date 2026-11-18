import { INJURY_STATUSES, POSITIONS, STAT_KEYS } from '@blueline/contracts';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEspnProvider } from '../src/espn';
import {
  mapInjuryStatus,
  mapPosition,
  parseInjuries,
  parseRoster,
  parseScoreboard,
  parseSummary,
  parseTeams,
} from '../src/espn/parse';
import { deps, fixture, FIXTURES, recorder, stubFetch } from './helpers';

const summaries = readdirSync(join(FIXTURES, 'espn', 'summary'));

describe('mapPosition', () => {
  it.each([
    ['PG', 'G'],
    ['SG', 'G'],
    ['G', 'G'],
    ['G-F', 'G'],
    ['SF', 'F'],
    ['PF', 'F'],
    ['F', 'F'],
    ['F-C', 'F'],
    ['C', 'C'],
  ])('%s → %s', (espn, ours) => {
    expect(mapPosition(espn)).toBe(ours);
  });

  it('returns null for unknown or missing positions', () => {
    expect(mapPosition(undefined)).toBeNull();
    expect(mapPosition('')).toBeNull();
    expect(mapPosition('ATH')).toBeNull();
  });
});

describe('parseSummary (box scores)', () => {
  it('gives every line the 7 stat keys and minutes, across all recorded games', () => {
    let lines = 0;
    for (const f of summaries) {
      const box = parseSummary(fixture(`espn/summary/${f}`));
      expect(box.game.status).toBe('final');
      for (const l of box.lines) {
        for (const k of [...STAT_KEYS, 'minutes', 'fga', 'fta'] as const) {
          expect(Number.isFinite(l[k]), `${f} ${l.playerName} ${k}`).toBe(true);
        }
        if (l.position !== null) expect(POSITIONS).toContain(l.position);
        lines++;
      }
    }
    expect(lines).toBeGreaterThan(5000);
  });

  it('normalizes a known game (ORL @ BOS, 2026-11-16)', () => {
    const box = parseSummary(fixture('espn/summary/401909994.json'));
    expect(box.game).toEqual({
      externalId: '401909994',
      date: '2026-11-16',
      tipAt: '2026-11-17T00:00:00.000Z',
      season: 2026,
      homeTeamExternalId: '2',
      awayTeamExternalId: '19',
      status: 'final',
      homeScore: 105,
      awayScore: 115,
    });
    const wagner = box.lines.find((l) => l.playerName === 'Franz Wagner');
    expect(wagner).toEqual({
      playerExternalId: '4566434',
      playerName: 'Franz Wagner',
      teamExternalId: '19',
      position: 'F',
      started: true,
      dnp: false,
      minutes: 38,
      pts: 21,
      reb: 8,
      ast: 9,
      fg3m: 0,
      stl: 0,
      blk: 1,
      tov: 4,
      fga: 21,
      fta: 5,
    });
    expect(box.lines.slice(0, 3)).toMatchSnapshot();
  });

  it('detects DNPs: didNotPlay with no stats', () => {
    const box = parseSummary(fixture('espn/summary/401909994.json'));
    const vuc = box.lines.find((l) => l.playerName === 'Nikola Vucevic');
    expect(vuc).toMatchObject({ dnp: true, minutes: 0, pts: 0 });
    expect(box.lines.filter((l) => l.dnp).length).toBeGreaterThan(0);
  });

  it('detects DNPs: a "DNP" comment or zero minutes', () => {
    const body = structuredClone(fixture('espn/summary/401909994.json')) as {
      boxscore: { players: { statistics: { athletes: Record<string, unknown>[] }[] }[] };
    };
    const athletes = body.boxscore.players[0]!.statistics[0]!.athletes;
    athletes[0]!.reason = "DNP-COACH'S DECISION";
    const stats = [...(athletes[1]!.stats as string[])];
    stats[0] = '0';
    athletes[1]!.stats = stats;
    const box = parseSummary(body);
    expect(box.lines[0]).toMatchObject({ dnp: true, minutes: 0 });
    expect(box.lines[1]).toMatchObject({ dnp: true, minutes: 0 });
    expect(box.lines[2]!.dnp).toBe(false);
  });
});

describe('parseScoreboard', () => {
  it('reads a finished day with scores', () => {
    const games = parseScoreboard(fixture('espn/scoreboard/2026-11-16.json'));
    expect(games).toHaveLength(8);
    for (const g of games) {
      expect(g.status).toBe('final');
      expect(g.date).toBe('2026-11-16');
      expect(g.season).toBe(2026);
      expect(typeof g.homeScore).toBe('number');
    }
  });

  it('reads an upcoming day without scores (snapshot)', () => {
    const games = parseScoreboard(fixture('espn/scoreboard/2026-11-17.json'));
    expect(games).toHaveLength(5);
    for (const g of games) expect(g).toMatchObject({ status: 'scheduled', homeScore: null });
    expect(games).toMatchSnapshot();
  });

  it('maps last season (ESPN year 2026) to season 2025', () => {
    const [g] = parseScoreboard(fixture('espn/scoreboard/2026-04-12.json'));
    expect(g!.season).toBe(2025);
  });
});

describe('teams, rosters, injuries', () => {
  it('parses 30 teams', () => {
    const teams = parseTeams(fixture('espn/teams.json'));
    expect(teams).toHaveLength(30);
    expect(teams).toContainEqual({ externalId: '2', abbr: 'BOS', name: 'Boston Celtics' });
  });

  it('parses a roster with G/F/C positions', () => {
    const roster = parseRoster(fixture('espn/rosters/2.json'), '2');
    expect(roster.length).toBeGreaterThan(10);
    for (const p of roster) {
      expect(POSITIONS).toContain(p.position);
      expect(p.teamExternalId).toBe('2');
    }
    expect(roster.find((p) => p.name === 'Jayson Tatum')).toMatchObject({ position: 'F' });
  });

  it('parses the injury report into our statuses', () => {
    const inj = parseInjuries(fixture('espn/injuries.json'));
    expect(inj.length).toBeGreaterThan(50);
    for (const i of inj) {
      expect(INJURY_STATUSES).toContain(i.status);
      expect(i.playerExternalId).toMatch(/^\d+$/);
    }
    expect(new Set(inj.map((i) => i.status))).toEqual(new Set(['out', 'day-to-day']));
    expect(inj.slice(0, 3)).toMatchSnapshot();
  });

  it('maps injury status text', () => {
    expect(mapInjuryStatus('Day-To-Day')).toBe('day-to-day');
    expect(mapInjuryStatus('Questionable')).toBe('questionable');
    expect(mapInjuryStatus('Suspension')).toBeNull();
  });
});

describe('createEspnProvider', () => {
  it('requests the documented endpoints and records each response', async () => {
    const { fetch, requests } = stubFetch([
      { match: '/scoreboard?dates=20261116', body: fixture('espn/scoreboard/2026-11-16.json') },
      { match: '/summary?event=401909994', body: fixture('espn/summary/401909994.json') },
      { match: '/teams/2/roster', body: fixture('espn/rosters/2.json') },
      { match: '/injuries', body: fixture('espn/injuries.json') },
      { match: /\/teams$/, body: fixture('espn/teams.json') },
    ]);
    const { record, records } = recorder();
    const espn = createEspnProvider(deps({ fetch, record }));

    expect(await espn.getSchedule('2026-11-16')).toHaveLength(8);
    expect((await espn.getBoxScore('401909994')).lines.length).toBeGreaterThan(20);
    expect((await espn.getRoster('2')).length).toBeGreaterThan(10);
    expect((await espn.getInjuries()).length).toBeGreaterThan(50);
    expect(await espn.getTeams()).toHaveLength(30);

    expect(requests.map((r) => r.url)).toEqual([
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261116',
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401909994',
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/2/roster',
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries',
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams',
    ]);
    expect(
      records.map(({ provider, endpoint, params }) => ({ provider, endpoint, params })),
    ).toEqual([
      { provider: 'espn', endpoint: '/scoreboard', params: { dates: '20261116' } },
      { provider: 'espn', endpoint: '/summary', params: { event: '401909994' } },
      { provider: 'espn', endpoint: '/teams/{id}/roster', params: { id: '2' } },
      { provider: 'espn', endpoint: '/injuries', params: {} },
      { provider: 'espn', endpoint: '/teams', params: {} },
    ]);
  });

  it('throws on HTTP errors without recording', async () => {
    const { fetch } = stubFetch([{ match: '/injuries', body: {}, status: 503 }]);
    const { record, records } = recorder();
    const espn = createEspnProvider(deps({ fetch, record }));
    await expect(espn.getInjuries()).rejects.toThrow('espn /injuries: HTTP 503');
    expect(records).toHaveLength(0);
  });
});
