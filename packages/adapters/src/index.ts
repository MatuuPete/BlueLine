// Public API of @blueline/adapters. Only this package knows vendor JSON shapes;
// everything it returns uses the @blueline/contracts Norm* types.
import { createEspnProvider } from './espn';
import { createFixtureOddsProvider, createFixtureStatsProvider } from './fixtures';
import { createSgoProvider } from './sgo';
import { createTheOddsApiProvider } from './theoddsapi';
import type { HttpDeps, OddsProvider, StatsProvider } from './types';

export type { HttpDeps, OddsProvider, RawRecorder, StatsProvider } from './types';
export { addDays, daysBetween, nyDate } from './dates';
export { findEspnTeam, normalizeName } from './names';
export { ESPN_TEAMS, createEspnProvider } from './espn';
export { createSgoProvider } from './sgo';
export { createTheOddsApiProvider } from './theoddsapi';
export { FIXTURES_DIR, createFixtureOddsProvider, createFixtureStatsProvider } from './fixtures';

export const STATS_PROVIDERS = ['espn', 'fixtures'] as const;
export type StatsProviderName = (typeof STATS_PROVIDERS)[number];
export const ODDS_PROVIDERS = ['sgo', 'theoddsapi', 'fixtures'] as const;
export type OddsProviderName = (typeof ODDS_PROVIDERS)[number];

export function createStatsProvider(name: StatsProviderName, deps: HttpDeps): StatsProvider {
  switch (name) {
    case 'espn':
      return createEspnProvider(deps);
    case 'fixtures':
      return createFixtureStatsProvider(deps);
    default:
      throw new Error(`Unknown stats provider "${String(name)}" (expected espn|fixtures)`);
  }
}

export function createOddsProvider(name: OddsProviderName, deps: HttpDeps): OddsProvider {
  switch (name) {
    case 'sgo':
      return createSgoProvider(deps);
    case 'theoddsapi':
      return createTheOddsApiProvider(deps);
    case 'fixtures':
      return createFixtureOddsProvider(deps);
    default:
      throw new Error(`Unknown odds provider "${String(name)}" (expected sgo|theoddsapi|fixtures)`);
  }
}
