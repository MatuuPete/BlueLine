// The Odds API v4 → normalized types (the-odds-api.com/liveapi/guides/v4).
import type { Book, Market, NormGame, NormGameLine, NormPropOffer } from '@blueline/contracts';
import { mapBook, parseAmerican, parseLine } from '../books';
import { nyDate } from '../dates';
import { espnTeamById, findEspnTeam } from '../names';

export interface ToaEvent {
  id: string;
  sport_key?: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

interface ToaOutcome {
  name: string;
  description?: string;
  price: number;
  point?: number;
}

interface ToaEventOdds extends ToaEvent {
  bookmakers?: { key: string; markets?: { key: string; outcomes?: ToaOutcome[] }[] }[];
}

/** Our market → The Odds API player-prop market key. */
export const TOA_MARKET_KEYS: Readonly<Record<Market, string>> = {
  PTS: 'player_points',
  REB: 'player_rebounds',
  AST: 'player_assists',
  '3PM': 'player_threes',
  STL: 'player_steals',
  BLK: 'player_blocks',
  TOV: 'player_turnovers',
  PRA: 'player_points_rebounds_assists',
  PR: 'player_points_rebounds',
  PA: 'player_points_assists',
  RA: 'player_rebounds_assists',
  STOCKS: 'player_blocks_steals',
};

const MARKET_BY_KEY: ReadonlyMap<string, Market> = new Map(
  Object.entries(TOA_MARKET_KEYS).map(([m, k]) => [k, m as Market]),
);

/** The Odds API bookmaker keys that differ from ours. */
const TOA_BOOK_ALIASES: Readonly<Record<string, Book>> = {
  williamhill_us: 'caesars',
  hardrockbet: 'hardrock',
};

export function parseToaEvents(body: unknown): ToaEvent[] {
  return Array.isArray(body) ? (body as ToaEvent[]) : [];
}

/** The Odds API event for an ESPN game: same home/away teams, same slate date. */
export function matchToaEvent(events: ToaEvent[], game: NormGame): ToaEvent | undefined {
  return events.find(
    (e) =>
      findEspnTeam(e.home_team)?.id === game.homeTeamExternalId &&
      findEspnTeam(e.away_team)?.id === game.awayTeamExternalId &&
      nyDate(e.commence_time) === game.date,
  );
}

/**
 * Player props from `/events/{id}/odds`. The Odds API has no player ids, so the
 * player's name doubles as `providerPlayerId`; team is unknown (null).
 */
export function parseToaProps(body: unknown, game: NormGame, markets: Market[]): NormPropOffer[] {
  const ev = body as ToaEventOdds;
  const wanted = new Set(markets);
  type Side = { line: number; price: number | null };
  const acc = new Map<
    string,
    { market: Market; player: string; book: Book; over?: Side; under?: Side }
  >();
  for (const bm of ev.bookmakers ?? []) {
    const book = mapBook(bm.key, TOA_BOOK_ALIASES);
    if (!book) continue;
    for (const mk of bm.markets ?? []) {
      const market = MARKET_BY_KEY.get(mk.key);
      if (!market || !wanted.has(market)) continue;
      for (const o of mk.outcomes ?? []) {
        const side = o.name.toLowerCase();
        const line = parseLine(o.point);
        if ((side !== 'over' && side !== 'under') || !o.description || line === null) continue;
        const key = `${o.description}|${market}|${book}`;
        const e = acc.get(key) ?? { market, player: o.description, book };
        e[side] = { line, price: parseAmerican(o.price) };
        acc.set(key, e);
      }
    }
  }
  const offers: NormPropOffer[] = [];
  for (const { market, player, book, over, under } of acc.values()) {
    const line = over?.line ?? under?.line;
    if (line === undefined) continue;
    const underPrice = under && under.line === line ? under.price : null;
    const overPrice = over?.price ?? null;
    if (overPrice === null && underPrice === null) continue;
    offers.push({
      gameExternalId: game.externalId,
      providerGameId: ev.id,
      providerPlayerId: player,
      playerName: player,
      teamAbbr: null,
      market,
      line,
      overPrice,
      underPrice,
      book,
    });
  }
  return offers;
}

/** Spreads and totals from `/sports/basketball_nba/odds?markets=spreads,totals`. */
export function parseToaGameLines(body: unknown): NormGameLine[] {
  const events = Array.isArray(body) ? (body as ToaEventOdds[]) : [];
  const out: NormGameLine[] = [];
  for (const ev of events) {
    const home = findEspnTeam(ev.home_team);
    const away = findEspnTeam(ev.away_team);
    for (const bm of ev.bookmakers ?? []) {
      const book = mapBook(bm.key, TOA_BOOK_ALIASES);
      if (!book) continue;
      let spread: number | null = null;
      let total: number | null = null;
      for (const mk of bm.markets ?? []) {
        if (mk.key === 'spreads') {
          const o = mk.outcomes?.find((x) => x.name === ev.home_team);
          spread = parseLine(o?.point);
        } else if (mk.key === 'totals') {
          const o = mk.outcomes?.find((x) => x.name.toLowerCase() === 'over');
          total = parseLine(o?.point);
        }
      }
      if (spread === null && total === null) continue;
      out.push({
        providerGameId: ev.id,
        homeTeam: (home && espnTeamById(home.id)?.abbr) ?? ev.home_team,
        awayTeam: (away && espnTeamById(away.id)?.abbr) ?? ev.away_team,
        tipAt: new Date(ev.commence_time).toISOString(),
        book,
        spread,
        total,
      });
    }
  }
  return out;
}
