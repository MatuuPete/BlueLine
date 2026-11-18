// The recorder must run once per fetch and before the response is parsed
// (raw payloads first, spec §3 rule 3). The parse modules are wrapped with spies
// that log into the same call log as the stub fetch and recorder.
import { describe, expect, it, vi } from 'vitest';
import type * as EspnParse from '../src/espn/parse';
import type * as SgoParse from '../src/sgo/parse';
import type * as ToaParse from '../src/theoddsapi/parse';
import { fixture, recorder, stubFetch, deps } from './helpers';

const log: string[] = [];

vi.mock('../src/espn/parse', async (importOriginal) => {
  const m = await importOriginal<typeof EspnParse>();
  return {
    ...m,
    parseScoreboard: (b: unknown) => {
      log.push('parse');
      return m.parseScoreboard(b);
    },
  };
});

vi.mock('../src/sgo/parse', async (importOriginal) => {
  const m = await importOriginal<typeof SgoParse>();
  return {
    ...m,
    parseSgoPage: (b: unknown) => {
      log.push('parse');
      return m.parseSgoPage(b);
    },
  };
});

vi.mock('../src/theoddsapi/parse', async (importOriginal) => {
  const m = await importOriginal<typeof ToaParse>();
  return {
    ...m,
    parseToaGameLines: (b: unknown) => {
      log.push('parse');
      return m.parseToaGameLines(b);
    },
  };
});

const { createEspnProvider } = await import('../src/espn');
const { createSgoProvider } = await import('../src/sgo');
const { createTheOddsApiProvider } = await import('../src/theoddsapi');

describe('raw payloads are recorded once per fetch, before parsing', () => {
  it('ESPN', async () => {
    log.length = 0;
    const { fetch } = stubFetch(
      [{ match: '/scoreboard', body: fixture('espn/scoreboard/2026-11-16.json') }],
      log,
    );
    const { record, records } = recorder(log);
    await createEspnProvider(deps({ fetch, record })).getSchedule('2026-11-16');
    expect(log).toEqual(['fetch', 'record', 'parse']);
    expect(records[0]!.body).toEqual(fixture('espn/scoreboard/2026-11-16.json'));
  });

  it('SportsGameOdds', async () => {
    log.length = 0;
    const { fetch } = stubFetch(
      [{ match: '/v2/events', body: fixture('sgo/events/2026-11-17.json') }],
      log,
    );
    const { record } = recorder(log);
    await createSgoProvider(deps({ fetch, record, apiKey: 'k' })).getGameLines('2026-11-17');
    expect(log).toEqual(['fetch', 'record', 'parse']);
  });

  it('The Odds API', async () => {
    log.length = 0;
    const { fetch } = stubFetch(
      [{ match: '/odds', body: fixture('theoddsapi/odds/2026-11-17.json') }],
      log,
    );
    const { record } = recorder(log);
    await createTheOddsApiProvider(deps({ fetch, record, apiKey: 'k' })).getGameLines('2026-11-17');
    expect(log).toEqual(['fetch', 'record', 'parse']);
  });

  it('a failing recorder stops the pipeline before parsing', async () => {
    log.length = 0;
    const { fetch } = stubFetch(
      [{ match: '/scoreboard', body: fixture('espn/scoreboard/2026-11-16.json') }],
      log,
    );
    const record = vi.fn(async () => {
      log.push('record');
      throw new Error('db down');
    });
    await expect(
      createEspnProvider(deps({ fetch, record })).getSchedule('2026-11-16'),
    ).rejects.toThrow('db down');
    expect(log).toEqual(['fetch', 'record']);
  });
});
