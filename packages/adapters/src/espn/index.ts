import { compactYmd } from '../dates';
import { fetchJson, query } from '../http';
import type { HttpDeps, StatsProvider } from '../types';
import { parseInjuries, parseRoster, parseScoreboard, parseSummary, parseTeams } from './parse';

export const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
export const ESPN_PROVIDER = 'espn';

/** ESPN public site API (no key). Every response is recorded before parsing. */
export function createEspnProvider(deps: HttpDeps): StatsProvider {
  const get = async (endpoint: string, path: string, params: Record<string, string> = {}) =>
    (
      await fetchJson(deps, {
        provider: ESPN_PROVIDER,
        endpoint,
        params,
        url: `${ESPN_BASE}${path}`,
      })
    ).body;

  return {
    name: ESPN_PROVIDER,
    async getTeams() {
      return parseTeams(await get('/teams', '/teams'));
    },
    async getRoster(teamExternalId) {
      const id = encodeURIComponent(teamExternalId);
      return parseRoster(
        await get('/teams/{id}/roster', `/teams/${id}/roster`, { id: teamExternalId }),
        teamExternalId,
      );
    },
    async getSchedule(dateYmd) {
      const dates = compactYmd(dateYmd);
      return parseScoreboard(await get('/scoreboard', `/scoreboard${query({ dates })}`, { dates }));
    },
    async getBoxScore(gameExternalId) {
      const event = gameExternalId;
      return parseSummary(await get('/summary', `/summary${query({ event })}`, { event }));
    },
    async getInjuries() {
      return parseInjuries(await get('/injuries', '/injuries'));
    },
  };
}

export * from './parse';
export { ESPN_TEAMS, type EspnTeamInfo } from './teams';
