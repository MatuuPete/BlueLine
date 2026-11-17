import type { Book, GameStatus, InjuryStatus, Market, Position } from './enums';

// Provider-neutral shapes. Only packages/adapters knows vendor JSON; everything
// downstream (worker jobs) consumes these. `externalId` = the stats provider's id (ESPN).

export interface NormTeam {
  externalId: string;
  /** e.g. 'BOS' */
  abbr: string;
  /** e.g. 'Boston Celtics' */
  name: string;
}

export interface NormPlayer {
  externalId: string;
  name: string;
  teamExternalId: string;
  /** PG/SG/G/G-F → G; SF/PF/F/F-C → F; C → C */
  position: Position;
  active: boolean;
}

export interface NormGame {
  externalId: string;
  /** Slate date, YYYY-MM-DD in America/New_York. */
  date: string;
  /** Tip-off, ISO 8601 UTC. */
  tipAt: string;
  /** Season start year: the 2026-27 season is 2026. */
  season: number;
  homeTeamExternalId: string;
  awayTeamExternalId: string;
  status: GameStatus;
  homeScore: number | null;
  awayScore: number | null;
}

export interface NormBoxLine {
  playerExternalId: string;
  playerName: string;
  teamExternalId: string;
  position: Position | null;
  started: boolean;
  /** No minutes, or a "DNP" comment. */
  dnp: boolean;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  fg3m: number;
  stl: number;
  blk: number;
  tov: number;
  fga: number;
  fta: number;
}

export interface NormBoxScore {
  game: NormGame;
  lines: NormBoxLine[];
}

export interface NormInjury {
  playerExternalId: string;
  playerName: string;
  teamExternalId: string;
  status: InjuryStatus;
  detail: string | null;
}

/** One book's two-way offer for a player prop. Prices are American odds. */
export interface NormPropOffer {
  /** The stats provider's game id (from the NormGame passed to getPlayerProps). */
  gameExternalId: string;
  /** The odds provider's own event id. */
  providerGameId: string;
  /** The odds provider's own player id; mapped to ours via provider_aliases. */
  providerPlayerId: string;
  playerName: string;
  /** Player's team abbreviation when the provider gives it. */
  teamAbbr: string | null;
  market: Market;
  line: number;
  overPrice: number | null;
  underPrice: number | null;
  book: Book;
}

/** Game spread/total from one book. `spread` is from the home team's perspective. */
export interface NormGameLine {
  providerGameId: string;
  homeTeam: string;
  awayTeam: string;
  /** ISO 8601 UTC. */
  tipAt: string;
  book: Book;
  spread: number | null;
  total: number | null;
}
