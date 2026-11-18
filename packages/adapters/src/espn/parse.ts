// ESPN site API → normalized contracts types. The only code that knows ESPN's JSON.
import type {
  GameStatus,
  InjuryStatus,
  NormBoxLine,
  NormBoxScore,
  NormGame,
  NormInjury,
  NormPlayer,
  NormTeam,
  Position,
} from '@blueline/contracts';
import { INJURY_STATUSES } from '@blueline/contracts';
import { nyDate } from '../dates';

// ---------------------------------------------------------------------------
// Minimal shapes of the ESPN payloads (only the fields we read)
// ---------------------------------------------------------------------------

interface EspnTeamRef {
  id: string;
  abbreviation?: string;
  displayName?: string;
}

interface EspnStatus {
  type?: { name?: string; state?: string; completed?: boolean };
}

interface EspnCompetitor {
  homeAway: 'home' | 'away';
  score?: string | number | { value?: number; displayValue?: string };
  team: EspnTeamRef;
}

interface EspnCompetition {
  id?: string;
  date: string;
  status?: EspnStatus;
  competitors: EspnCompetitor[];
}

interface EspnEvent {
  id: string;
  date: string;
  season?: { year: number };
  status?: EspnStatus;
  competitions: EspnCompetition[];
}

interface EspnScoreboard {
  events?: EspnEvent[];
}

interface EspnBoxAthlete {
  athlete: {
    id: string;
    displayName: string;
    position?: { abbreviation?: string };
  };
  starter?: boolean;
  didNotPlay?: boolean;
  reason?: string;
  stats?: string[];
}

interface EspnSummary {
  header: {
    id: string;
    season?: { year: number };
    competitions: EspnCompetition[];
  };
  boxscore?: {
    players?: {
      team: EspnTeamRef;
      statistics?: { keys?: string[]; names?: string[]; athletes?: EspnBoxAthlete[] }[];
    }[];
  };
}

interface EspnTeamsResponse {
  sports: { leagues: { teams: { team: EspnTeamRef }[] }[] }[];
}

interface EspnRosterAthlete {
  id: string;
  displayName?: string;
  fullName?: string;
  position?: { abbreviation?: string };
  status?: { type?: string };
}

interface EspnRoster {
  athletes?: (EspnRosterAthlete | { items?: EspnRosterAthlete[] })[];
}

interface EspnInjuryEntry {
  status?: string;
  type?: { description?: string };
  shortComment?: string;
  details?: { type?: string; detail?: string; side?: string; returnDate?: string };
  athlete?: {
    displayName?: string;
    team?: { id?: string };
    links?: { href?: string }[];
    headshot?: { href?: string };
  };
}

interface EspnInjuries {
  injuries?: { id: string; injuries?: EspnInjuryEntry[] }[];
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

/** ESPN position abbreviation → G/F/C. PG/SG/G/G-F → G; SF/PF/F/F-C → F; C → C. */
export function mapPosition(abbr: string | undefined | null): Position | null {
  if (!abbr) return null;
  const first = abbr.toUpperCase().split(/[-/]/)[0] ?? '';
  if (first === 'PG' || first === 'SG' || first === 'G') return 'G';
  if (first === 'SF' || first === 'PF' || first === 'F') return 'F';
  if (first === 'C') return 'C';
  return null;
}

/** ESPN season year is the year the season ends (2027 = 2026-27); ours is the start year. */
function seasonOf(espnYear: number | undefined, tipAt: string): number {
  if (espnYear) return espnYear - 1;
  // Fallback: seasons start in October.
  const d = new Date(tipAt);
  return d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

function mapGameStatus(status: EspnStatus | undefined): GameStatus {
  const name = status?.type?.name ?? '';
  if (name === 'STATUS_POSTPONED') return 'postponed';
  if (name === 'STATUS_CANCELED' || name === 'STATUS_CANCELLED') return 'canceled';
  const state = status?.type?.state;
  if (state === 'post' || status?.type?.completed) return 'final';
  if (state === 'in') return 'in_progress';
  return 'scheduled';
}

function scoreOf(c: EspnCompetitor | undefined): number | null {
  const s = c?.score;
  if (s === undefined || s === null || s === '') return null;
  const n = typeof s === 'object' ? (s.value ?? Number(s.displayValue)) : Number(s);
  return Number.isFinite(n) ? n : null;
}

/** ESPN's ISO strings omit seconds ("2026-11-18T00:30Z"); normalize them. */
function isoUtc(s: string): string {
  return new Date(s).toISOString();
}

function gameFrom(
  id: string,
  comp: EspnCompetition,
  status: EspnStatus | undefined,
  espnYear: number | undefined,
): NormGame {
  const home = comp.competitors.find((c) => c.homeAway === 'home');
  const away = comp.competitors.find((c) => c.homeAway === 'away');
  if (!home || !away) throw new Error(`ESPN event ${id}: missing home/away competitor`);
  const tipAt = isoUtc(comp.date);
  const st = mapGameStatus(status ?? comp.status);
  const scored = st === 'final' || st === 'in_progress';
  return {
    externalId: id,
    date: nyDate(tipAt),
    tipAt,
    season: seasonOf(espnYear, tipAt),
    homeTeamExternalId: home.team.id,
    awayTeamExternalId: away.team.id,
    status: st,
    homeScore: scored ? scoreOf(home) : null,
    awayScore: scored ? scoreOf(away) : null,
  };
}

/** "38" or "38:12" → minutes as a number; "--" or missing → 0. */
function parseMinutes(s: string | undefined): number {
  if (!s) return 0;
  const [m, sec] = s.split(':');
  const min = Number(m);
  if (!Number.isFinite(min)) return 0;
  const secs = sec === undefined ? 0 : Number(sec);
  return Number.isFinite(secs) ? Math.round((min + secs / 60) * 100) / 100 : min;
}

function int(s: string | undefined): number {
  const n = parseInt(s ?? '', 10);
  return Number.isFinite(n) ? n : 0;
}

/** "8-21" → [8, 21]. */
function madeAttempted(s: string | undefined): [number, number] {
  const [m, a] = (s ?? '').split('-');
  return [int(m), int(a)];
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parseTeams(body: unknown): NormTeam[] {
  const b = body as EspnTeamsResponse;
  const teams = b.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teams.map(({ team }) => ({
    externalId: team.id,
    abbr: team.abbreviation ?? team.id,
    name: team.displayName ?? team.abbreviation ?? team.id,
  }));
}

export function parseRoster(body: unknown, teamExternalId: string): NormPlayer[] {
  const b = body as EspnRoster;
  // NBA rosters are a flat list; some ESPN sports group athletes as { items }.
  const athletes = (b.athletes ?? []).flatMap((a) =>
    'items' in a && Array.isArray(a.items) ? a.items : [a as EspnRosterAthlete],
  );
  return athletes.map((a) => ({
    externalId: a.id,
    name: a.displayName ?? a.fullName ?? a.id,
    teamExternalId,
    // A roster player without a listed position is most often a forward.
    position: mapPosition(a.position?.abbreviation) ?? 'F',
    active: (a.status?.type ?? 'active') === 'active',
  }));
}

export function parseScoreboard(body: unknown): NormGame[] {
  const b = body as EspnScoreboard;
  return (b.events ?? []).flatMap((e) => {
    const comp = e.competitions?.[0];
    if (!comp) return [];
    return [gameFrom(e.id, { ...comp, date: comp.date ?? e.date }, e.status, e.season?.year)];
  });
}

export function parseSummary(body: unknown): NormBoxScore {
  const b = body as EspnSummary;
  const comp = b.header?.competitions?.[0];
  if (!comp) throw new Error('ESPN summary: missing header.competitions');
  const game = gameFrom(b.header.id, comp, comp.status, b.header.season?.year);

  const lines: NormBoxLine[] = [];
  for (const teamBlock of b.boxscore?.players ?? []) {
    const stats = teamBlock.statistics?.[0];
    if (!stats) continue;
    const keys = stats.keys ?? [];
    const col = (row: string[], key: string) => {
      const i = keys.indexOf(key);
      return i >= 0 ? row[i] : undefined;
    };
    for (const a of stats.athletes ?? []) {
      const row = a.stats ?? [];
      const minutes = parseMinutes(col(row, 'minutes'));
      const [, fga] = madeAttempted(col(row, 'fieldGoalsMade-fieldGoalsAttempted'));
      const [fg3m] = madeAttempted(
        col(row, 'threePointFieldGoalsMade-threePointFieldGoalsAttempted'),
      );
      const [, fta] = madeAttempted(col(row, 'freeThrowsMade-freeThrowsAttempted'));
      const dnp =
        Boolean(a.didNotPlay) || row.length === 0 || minutes <= 0 || /DNP/i.test(a.reason ?? '');
      lines.push({
        playerExternalId: a.athlete.id,
        playerName: a.athlete.displayName,
        teamExternalId: teamBlock.team.id,
        position: mapPosition(a.athlete.position?.abbreviation),
        started: Boolean(a.starter),
        dnp,
        minutes: dnp ? 0 : minutes,
        pts: int(col(row, 'points')),
        reb: int(col(row, 'rebounds')),
        ast: int(col(row, 'assists')),
        fg3m,
        stl: int(col(row, 'steals')),
        blk: int(col(row, 'blocks')),
        tov: int(col(row, 'turnovers')),
        fga,
        fta,
      });
    }
  }
  return { game, lines };
}

/** ESPN injury status text → our enum ("Day-To-Day" → 'day-to-day'); unknown → null. */
export function mapInjuryStatus(status: string | undefined): InjuryStatus | null {
  const s = (status ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  return (INJURY_STATUSES as readonly string[]).includes(s) ? (s as InjuryStatus) : null;
}

function athleteIdFromLinks(entry: EspnInjuryEntry): string | null {
  const hrefs = [
    ...(entry.athlete?.links ?? []).map((l) => l.href ?? ''),
    entry.athlete?.headshot?.href ?? '',
  ];
  for (const h of hrefs) {
    const m = /\/id\/(\d+)/.exec(h) ?? /\/players\/full\/(\d+)\./.exec(h);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function parseInjuries(body: unknown): NormInjury[] {
  const b = body as EspnInjuries;
  const out: NormInjury[] = [];
  for (const team of b.injuries ?? []) {
    for (const entry of team.injuries ?? []) {
      const status = mapInjuryStatus(entry.status) ?? mapInjuryStatus(entry.type?.description);
      const id = athleteIdFromLinks(entry);
      if (!status || !id) continue;
      const d = entry.details;
      const detail = d?.type
        ? [
            d.side && d.side !== 'Not Specified' ? d.side : null,
            d.type,
            d.detail ? `(${d.detail})` : null,
          ]
            .filter(Boolean)
            .join(' ')
        : (entry.shortComment ?? null);
      out.push({
        playerExternalId: id,
        playerName: entry.athlete?.displayName ?? id,
        teamExternalId: entry.athlete?.team?.id ?? team.id,
        status,
        detail,
      });
    }
  }
  return out;
}
