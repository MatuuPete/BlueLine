// SportsGameOdds v2 → normalized types.
// oddID = {statID}-{statEntityID}-{periodID}-{betTypeID}-{sideID} (sportsgameodds.com/docs).
import type { Book, Market, NormGame, NormGameLine, NormPropOffer } from '@blueline/contracts';
import { mapBook, parseAmerican, parseLine } from '../books';
import { nyDate } from '../dates';
import { espnTeamById, findEspnTeam } from '../names';

export interface SgoBookQuote {
  odds?: string;
  overUnder?: string;
  spread?: string;
  available?: boolean;
}

export interface SgoOdd {
  oddID: string;
  statID: string;
  statEntityID: string;
  periodID: string;
  betTypeID: string;
  sideID: string;
  playerID?: string;
  bookOverUnder?: string;
  bookSpread?: string;
  byBookmaker?: Record<string, SgoBookQuote>;
}

export interface SgoTeam {
  teamID: string;
  names: { long: string; medium?: string; short?: string };
}

export interface SgoEvent {
  eventID: string;
  leagueID?: string;
  teams: { home: SgoTeam; away: SgoTeam };
  status: { startsAt: string; cancelled?: boolean };
  odds?: Record<string, SgoOdd>;
  players?: Record<string, { playerID: string; teamID?: string; name?: string }>;
}

export interface SgoEventsPage {
  data: SgoEvent[];
  nextCursor: string | null;
}

/** SGO statID → our market. */
export const SGO_STAT_MARKETS: Readonly<Record<string, Market>> = {
  points: 'PTS',
  rebounds: 'REB',
  assists: 'AST',
  threePointersMade: '3PM',
  steals: 'STL',
  blocks: 'BLK',
  turnovers: 'TOV',
  'points+rebounds+assists': 'PRA',
  'points+rebounds': 'PR',
  'points+assists': 'PA',
  'rebounds+assists': 'RA',
  'blocks+steals': 'STOCKS',
};

const SGO_BOOK_ALIASES: Readonly<Record<string, Book>> = { hardrockbet: 'hardrock' };

/**
 * `points-JAYSON_TATUM_1_NBA-game-ou-over` → { market: 'PTS', playerId, side: 'over' }.
 * Only full-game player over/unders; anything else → null.
 */
export function parseOddId(
  oddID: string,
): { market: Market; playerId: string; side: 'over' | 'under' } | null {
  const m = /^(.+?)-(.+)-game-ou-(over|under)$/.exec(oddID);
  if (!m) return null;
  const [, statID, entity, side] = m;
  const market = SGO_STAT_MARKETS[statID!];
  if (!market || ['all', 'home', 'away'].includes(entity!)) return null;
  return { market, playerId: entity!, side: side as 'over' | 'under' };
}

export function parseSgoPage(body: unknown): SgoEventsPage {
  const b = body as Partial<SgoEventsPage>;
  return { data: Array.isArray(b.data) ? b.data : [], nextCursor: b.nextCursor ?? null };
}

export function parseSgoEvents(body: unknown): SgoEvent[] {
  return parseSgoPage(body).data;
}

/** The SGO event for an ESPN game: same home/away teams, same slate date. */
export function matchSgoEvent(events: SgoEvent[], game: NormGame): SgoEvent | undefined {
  return events.find(
    (e) =>
      findEspnTeam(e.teams.home.names.long)?.id === game.homeTeamExternalId &&
      findEspnTeam(e.teams.away.names.long)?.id === game.awayTeamExternalId &&
      nyDate(e.status.startsAt) === game.date,
  );
}

/** 'JAYSON_TATUM_1_NBA' → 'Jayson Tatum' (fallback when `players` lacks the id). */
function nameFromId(playerID: string): string {
  return playerID
    .replace(/_\d+_[A-Z]+$/, '')
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

interface SideQuote {
  line: number;
  price: number | null;
}

/** All requested player props of one event: one offer per (player, market, book). */
export function parseSgoProps(event: SgoEvent, game: NormGame, markets: Market[]): NormPropOffer[] {
  const wanted = new Set(markets);
  const abbrByTeamId: Record<string, string | undefined> = {
    [event.teams.home.teamID]: espnTeamById(game.homeTeamExternalId)?.abbr,
    [event.teams.away.teamID]: espnTeamById(game.awayTeamExternalId)?.abbr,
  };
  const acc = new Map<
    string,
    { market: Market; playerId: string; book: Book; over?: SideQuote; under?: SideQuote }
  >();

  for (const odd of Object.values(event.odds ?? {})) {
    const id = parseOddId(odd.oddID);
    if (!id || !wanted.has(id.market)) continue;
    for (const [bookKey, quote] of Object.entries(odd.byBookmaker ?? {})) {
      const book = mapBook(bookKey, SGO_BOOK_ALIASES);
      if (!book || quote.available === false) continue;
      const line = parseLine(quote.overUnder ?? odd.bookOverUnder);
      if (line === null) continue;
      const key = `${id.playerId}|${id.market}|${book}`;
      const entry = acc.get(key) ?? { market: id.market, playerId: id.playerId, book };
      entry[id.side] = { line, price: parseAmerican(quote.odds) };
      acc.set(key, entry);
    }
  }

  const offers: NormPropOffer[] = [];
  for (const { market, playerId, book, over, under } of acc.values()) {
    const line = over?.line ?? under?.line;
    if (line === undefined) continue;
    // An under quoted at a different line than the over is another prop; keep the over.
    const underPrice = under && under.line === line ? under.price : null;
    const overPrice = over?.price ?? null;
    if (overPrice === null && underPrice === null) continue;
    const player = event.players?.[playerId];
    offers.push({
      gameExternalId: game.externalId,
      providerGameId: event.eventID,
      providerPlayerId: playerId,
      playerName: player?.name ?? nameFromId(playerId),
      teamAbbr: (player?.teamID ? abbrByTeamId[player.teamID] : undefined) ?? null,
      market,
      line,
      overPrice,
      underPrice,
      book,
    });
  }
  return offers;
}

/** Full-game spread (home perspective) and total, per book. */
export function parseSgoGameLines(event: SgoEvent): NormGameLine[] {
  const spreadOdd = event.odds?.['points-home-game-sp-home'];
  const totalOdd = event.odds?.['points-all-game-ou-over'];
  const books = new Map<Book, { spread: number | null; total: number | null }>();
  const slot = (book: Book) => {
    const e = books.get(book) ?? { spread: null, total: null };
    books.set(book, e);
    return e;
  };
  for (const [key, q] of Object.entries(spreadOdd?.byBookmaker ?? {})) {
    const book = mapBook(key, SGO_BOOK_ALIASES);
    if (book && q.available !== false)
      slot(book).spread = parseLine(q.spread ?? spreadOdd?.bookSpread);
  }
  for (const [key, q] of Object.entries(totalOdd?.byBookmaker ?? {})) {
    const book = mapBook(key, SGO_BOOK_ALIASES);
    if (book && q.available !== false)
      slot(book).total = parseLine(q.overUnder ?? totalOdd?.bookOverUnder);
  }
  const team = (t: SgoTeam) => findEspnTeam(t.names.long)?.abbr ?? t.names.long;
  return [...books].map(([book, v]) => ({
    providerGameId: event.eventID,
    homeTeam: team(event.teams.home),
    awayTeam: team(event.teams.away),
    tipAt: new Date(event.status.startsAt).toISOString(),
    book,
    spread: v.spread,
    total: v.total,
  }));
}
