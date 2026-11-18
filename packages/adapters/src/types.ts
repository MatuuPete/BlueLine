import type {
  Market,
  NormBoxScore,
  NormGame,
  NormGameLine,
  NormInjury,
  NormPlayer,
  NormPropOffer,
  NormTeam,
} from '@blueline/contracts';

/**
 * Persists one raw provider response (the worker writes it to `raw_payloads`).
 * Called once per HTTP response, before that response is parsed. `params` never
 * contains API keys.
 */
export type RawRecorder = (rec: {
  provider: string;
  endpoint: string;
  params: Record<string, unknown>;
  body: unknown;
}) => Promise<void>;

export interface HttpDeps {
  fetch: typeof fetch;
  record: RawRecorder;
  apiKey?: string;
  /**
   * Fixture providers only: the slate date (YYYY-MM-DD) that the recorded
   * "anchor" day is replayed as. Every fixture date and tip time shifts by the
   * same number of days, so the board is never empty. Default: today in
   * America/New_York.
   */
  fixtureDate?: string;
}

export interface StatsProvider {
  readonly name: string;
  getTeams(): Promise<NormTeam[]>;
  getRoster(teamExternalId: string): Promise<NormPlayer[]>;
  /** One slate day (YYYY-MM-DD, America/New_York): the ESPN scoreboard. */
  getSchedule(dateYmd: string): Promise<NormGame[]>;
  /** ESPN summary. */
  getBoxScore(gameExternalId: string): Promise<NormBoxScore>;
  getInjuries(): Promise<NormInjury[]>;
  /**
   * Fixture provider only: every slate date that has recorded games, ascending
   * (already shifted). Live providers leave this undefined.
   */
  listDates?(): Promise<string[]>;
}

export interface OddsProvider {
  readonly name: string;
  getPlayerProps(
    game: NormGame,
    markets: Market[],
  ): Promise<{ offers: NormPropOffer[]; units: number }>;
  /**
   * Spread and total for one slate day. `homeTeam`/`awayTeam` are the stats
   * provider's (ESPN) team abbreviations when the team is recognized, else the
   * odds provider's team name.
   */
  getGameLines(dateYmd: string): Promise<{ lines: NormGameLine[]; units: number }>;
  /**
   * Upper-bound units for pulling `markets` player-prop markets for `games`
   * games plus that day's game lines. The budget guard trims markets until this fits.
   */
  estimateUnits(games: number, markets: number): number;
}
