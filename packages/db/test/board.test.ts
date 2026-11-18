import { DEFAULT_BOARD_FILTER, propKey, type BoardFilter } from '@blueline/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, games, players, propMetrics, propOffers, teams, type Db } from '../src/index';
import { pct, queryBoard } from '../src/queries/board';
import { createTestDb } from '../src/testing';

type Metric = typeof propMetrics.$inferInsert;
type Book = NonNullable<Metric['bestBook']>;

let db: Db;

interface Spec {
  id: string; // single letter, also the player id suffix
  game: 'g1' | 'g2' | 'g3';
  team: string;
  opp: string;
  home: boolean;
  pos: 'G' | 'F' | 'C';
  market: Metric['market'];
  side: Metric['side'];
  line: number;
  name: string;
  l10: [number, number]; // rate, n
  l5: number;
  season: [number, number];
  edge: number;
  streak: number;
  price: number | null;
  book: Book | null;
  value: number | null;
  dvp: number;
  tier: NonNullable<Metric['dvpTier']>;
  rest: number;
  b2b: boolean;
  min5: number;
  usage: number;
  starter: boolean;
  inj: Metric['injuryStatus'];
  tmOut: boolean;
  move: number | null;
  extra?: Partial<Metric>;
}

const GAME = {
  g1: { date: '2026-11-18', tip: '2026-11-19T00:00:00Z', total: 228, spread: -6.5 },
  g2: { date: '2026-11-18', tip: '2026-11-19T02:30:00Z', total: 236, spread: 3 },
  g3: { date: '2026-11-19', tip: '2026-11-20T00:00:00Z', total: 218, spread: -12 },
} as const;

const SPECS: Spec[] = [
  {
    id: 'a',
    game: 'g1',
    team: 'BOS',
    opp: 'NYK',
    home: true,
    pos: 'G',
    market: 'PTS',
    side: 'over',
    line: 24.5,
    name: 'Alpha Ace',
    l10: [0.9, 10],
    l5: 1,
    season: [0.8, 40],
    edge: 3.2,
    streak: 6,
    price: -110,
    book: 'draftkings',
    value: 0.08,
    dvp: 28,
    tier: 'worst',
    rest: 2,
    b2b: false,
    min5: 34,
    usage: 0.27,
    starter: true,
    inj: null,
    tmOut: true,
    move: 1,
    extra: { rateH2h: 1, nH2h: 3, hitsH2h: 3 },
  },
  {
    id: 'b',
    game: 'g1',
    team: 'BOS',
    opp: 'NYK',
    home: true,
    pos: 'F',
    market: 'REB',
    side: 'over',
    line: 8.5,
    name: 'Bravo Brooks',
    l10: [0.8, 10],
    l5: 0.8,
    season: [0.7, 40],
    edge: 1.5,
    streak: 3,
    price: 120,
    book: 'fanduel',
    value: 0.06,
    dvp: 20,
    tier: 'bad',
    rest: 1,
    b2b: false,
    min5: 30,
    usage: 0.2,
    starter: true,
    inj: 'questionable',
    tmOut: false,
    move: -0.5,
  },
  {
    id: 'c',
    game: 'g1',
    team: 'NYK',
    opp: 'BOS',
    home: false,
    pos: 'C',
    market: 'REB',
    side: 'under',
    line: 10.5,
    name: 'Charlie Cole',
    l10: [0.7, 8],
    l5: 0.6,
    season: [0.65, 30],
    edge: 1,
    streak: 2,
    price: -105,
    book: 'betmgm',
    value: 0.03,
    dvp: 10,
    tier: 'good',
    rest: 0,
    b2b: true,
    min5: 28,
    usage: 0.18,
    starter: false,
    inj: null,
    tmOut: false,
    move: 0,
  },
  {
    id: 'd',
    game: 'g1',
    team: 'NYK',
    opp: 'BOS',
    home: false,
    pos: 'G',
    market: 'AST',
    side: 'over',
    line: 6.5,
    name: 'Delta Dunn',
    l10: [0.6, 10],
    l5: 0.4,
    season: [0.55, 38],
    edge: 0.4,
    streak: 1,
    price: -150,
    book: 'draftkings',
    value: 0.01,
    dvp: 5,
    tier: 'best',
    rest: 3,
    b2b: false,
    min5: 36,
    usage: 0.3,
    starter: true,
    inj: 'probable',
    tmOut: false,
    move: 2,
    extra: { rateLastSeason: 0.9, nLastSeason: 40, hitsLastSeason: 36 },
  },
  {
    id: 'e',
    game: 'g2',
    team: 'LAL',
    opp: 'DEN',
    home: true,
    pos: 'F',
    market: 'PRA',
    side: 'over',
    line: 40.5,
    name: 'Echo Eaton',
    l10: [0.5, 6],
    l5: 0.6,
    season: [0.5, 20],
    edge: -0.5,
    streak: -1,
    price: 150,
    book: 'caesars',
    value: -0.02,
    dvp: 26,
    tier: 'worst',
    rest: 1,
    b2b: false,
    min5: 25,
    usage: 0.15,
    starter: false,
    inj: 'doubtful',
    tmOut: true,
    move: -1.5,
  },
  {
    id: 'f',
    game: 'g2',
    team: 'LAL',
    opp: 'DEN',
    home: true,
    pos: 'G',
    market: '3PM',
    side: 'under',
    line: 2.5,
    name: 'Foxtrot Fox',
    l10: [0.85, 10],
    l5: 0.8,
    season: [0.75, 35],
    edge: 0.9,
    streak: 4,
    price: 100,
    book: 'fanduel',
    value: 0.1,
    dvp: 8,
    tier: 'good',
    rest: 2,
    b2b: false,
    min5: 31,
    usage: 0.22,
    starter: true,
    inj: null,
    tmOut: false,
    move: 0.5,
  },
  {
    id: 'g',
    game: 'g2',
    team: 'DEN',
    opp: 'LAL',
    home: false,
    pos: 'C',
    market: 'PTS',
    side: 'over',
    line: 22.5,
    name: 'Golf Grant',
    l10: [0.75, 9],
    l5: 0.8,
    season: [0.7, 33],
    edge: 2,
    streak: 0,
    price: -120,
    book: 'betmgm',
    value: 0.05,
    dvp: 3,
    tier: 'best',
    rest: 0,
    b2b: true,
    min5: 32,
    usage: 0.25,
    starter: true,
    inj: null,
    tmOut: false,
    move: -1,
  },
  {
    id: 'h',
    game: 'g2',
    team: 'DEN',
    opp: 'LAL',
    home: false,
    pos: 'G',
    market: 'AST',
    side: 'under',
    line: 5.5,
    name: 'Hotel Hart',
    l10: [0.4, 10],
    l5: 0.2,
    season: [0.45, 36],
    edge: -1,
    streak: -3,
    price: -110,
    book: 'draftkings',
    value: -0.06,
    dvp: 15,
    tier: 'bad',
    rest: 1,
    b2b: false,
    min5: 29,
    usage: 0.17,
    starter: false,
    inj: 'day-to-day',
    tmOut: false,
    move: 0,
  },
  {
    id: 'i',
    game: 'g3',
    team: 'MIA',
    opp: 'CHI',
    home: true,
    pos: 'F',
    market: 'PTS',
    side: 'over',
    line: 18.5,
    name: 'India Ivey',
    l10: [0.95, 10],
    l5: 1,
    season: [0.9, 10],
    edge: 4,
    streak: 8,
    price: -200,
    book: 'fanduel',
    value: 0.02,
    dvp: 30,
    tier: 'worst',
    rest: 4,
    b2b: false,
    min5: 35,
    usage: 0.31,
    starter: true,
    inj: null,
    tmOut: false,
    move: 3,
  },
  {
    id: 'j',
    game: 'g3',
    team: 'CHI',
    opp: 'MIA',
    home: false,
    pos: 'G',
    market: 'STL',
    side: 'over',
    line: 1.5,
    name: 'Juliet Jones',
    l10: [0.55, 10],
    l5: 0.6,
    season: [0.5, 25],
    edge: 0.1,
    streak: 1,
    price: null,
    book: null,
    value: null,
    dvp: 12,
    tier: 'good',
    rest: 1,
    b2b: false,
    min5: 24,
    usage: 0.14,
    starter: false,
    inj: null,
    tmOut: false,
    move: null,
  },
  {
    id: 'k',
    game: 'g3',
    team: 'MIA',
    opp: 'CHI',
    home: true,
    pos: 'C',
    market: 'BLK',
    side: 'under',
    line: 1.5,
    name: 'Kilo King',
    l10: [0.7, 7],
    l5: 0.8,
    season: [0.6, 20],
    edge: 0.6,
    streak: 2,
    price: 110,
    book: 'betrivers',
    value: 0.07,
    dvp: 2,
    tier: 'best',
    rest: 0,
    b2b: true,
    min5: 22,
    usage: 0.16,
    starter: false,
    inj: null,
    tmOut: true,
    move: -2,
  },
  {
    id: 'l',
    game: 'g3',
    team: 'CHI',
    opp: 'MIA',
    home: false,
    pos: 'F',
    market: 'TOV',
    side: 'over',
    line: 2.5,
    name: 'Lima Lane',
    l10: [0.3, 10],
    l5: 0.2,
    season: [0.35, 30],
    edge: -2,
    streak: -4,
    price: 200,
    book: 'hardrock',
    value: -0.1,
    dvp: 29,
    tier: 'worst',
    rest: 2,
    b2b: false,
    min5: 27,
    usage: 0.19,
    starter: false,
    inj: 'out',
    tmOut: false,
    move: 0.5,
  },
];

const keyOf = (s: Spec) =>
  propKey({ gameId: s.game, playerId: `p${s.id}`, market: s.market, side: s.side });
/** letter → prop key */
const K: Record<string, string> = Object.fromEntries(SPECS.map((s) => [s.id, keyOf(s)]));
const byKey = new Map(Object.entries(K).map(([letter, key]) => [key, letter]));

const hits = (rate: number, n: number) => Math.round(rate * n);

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(teams).values(
    ['bos', 'nyk', 'lal', 'den', 'mia', 'chi'].map((id) => ({
      id,
      abbr: id.toUpperCase(),
      name: id.toUpperCase(),
    })),
  );
  await db.insert(games).values(
    (['g1', 'g2', 'g3'] as const).map((id, i) => ({
      id,
      season: 2026,
      date: GAME[id].date,
      tipAt: new Date(GAME[id].tip),
      homeTeamId: ['bos', 'lal', 'mia'][i]!,
      awayTeamId: ['nyk', 'den', 'chi'][i]!,
      spread: GAME[id].spread,
      total: GAME[id].total,
    })),
  );
  await db.insert(players).values(
    SPECS.map((s) => ({
      id: `p${s.id}`,
      name: s.name,
      teamId: s.team.toLowerCase(),
      position: s.pos,
    })),
  );
  await db.insert(propMetrics).values(
    SPECS.map((s): Metric => {
      const g = GAME[s.game];
      return {
        propKey: keyOf(s),
        gameId: s.game,
        playerId: `p${s.id}`,
        market: s.market,
        side: s.side,
        line: s.line,
        playerName: s.name,
        position: s.pos,
        teamId: s.team.toLowerCase(),
        teamAbbr: s.team,
        oppTeamId: s.opp.toLowerCase(),
        oppAbbr: s.opp,
        isHome: s.home,
        tipAt: new Date(g.tip),
        recent: [1, 2, 3],
        rateL5: s.l5,
        nL5: 5,
        hitsL5: hits(s.l5, 5),
        rateL10: s.l10[0],
        nL10: s.l10[1],
        hitsL10: hits(...s.l10),
        rateSeason: s.season[0],
        nSeason: s.season[1],
        hitsSeason: hits(...s.season),
        edgeAvg: s.edge,
        streak: s.streak,
        bestPrice: s.price,
        bestBook: s.book,
        value: s.value,
        dvpRank: s.dvp,
        dvpTier: s.tier,
        restDays: s.rest,
        isB2b: s.b2b,
        minutesL5: s.min5,
        usageL10: s.usage,
        isStarter: s.starter,
        injuryStatus: s.inj,
        teammateOut: s.tmOut,
        lineMove: s.move,
        gameTotal: g.total,
        gameSpread: g.spread,
        computedAt: new Date('2026-11-18T14:00:00Z'),
        ...s.extra,
      };
    }),
  );

  // g4: one row with no rate and no sample in any window (rate NULL, n = 0).
  await db.insert(games).values({
    id: 'g4',
    season: 2026,
    date: '2026-11-20',
    tipAt: new Date('2026-11-21T00:00:00Z'),
    homeTeamId: 'bos',
    awayTeamId: 'nyk',
  });
  await db.insert(players).values({ id: 'pm', name: 'Mike Null', teamId: 'bos', position: 'G' });
  await db.insert(propMetrics).values({
    propKey: propKey({ gameId: 'g4', playerId: 'pm', market: 'PTS', side: 'over' }),
    gameId: 'g4',
    playerId: 'pm',
    market: 'PTS',
    side: 'over',
    line: 10.5,
    playerName: 'Mike Null',
    position: 'G',
    teamId: 'bos',
    teamAbbr: 'BOS',
    oppTeamId: 'nyk',
    oppAbbr: 'NYK',
    isHome: true,
    tipAt: new Date('2026-11-21T00:00:00Z'),
  });

  const at = (hhmm: string) => new Date(`2026-11-18T${hhmm}:00Z`);
  const offer = (
    game: string,
    player: string,
    market: Metric['market'],
    line: number,
    book: Book,
    over: number | null,
    under: number | null,
    time: string,
  ) => ({
    gameId: game,
    playerId: player,
    market,
    line,
    book,
    overPrice: over,
    underPrice: under,
    capturedAt: at(time),
  });
  await db.insert(propOffers).values([
    // a: PTS 24.5 over. The dk -105 row is superseded by -110; caesars is on another line.
    offer('g1', 'pa', 'PTS', 24.5, 'draftkings', -105, -115, '12:00'),
    offer('g1', 'pa', 'PTS', 24.5, 'draftkings', -110, -110, '13:00'),
    offer('g1', 'pa', 'PTS', 24.5, 'fanduel', -125, 105, '13:00'),
    offer('g1', 'pa', 'PTS', 24.5, 'betmgm', -115, -105, '13:00'),
    offer('g1', 'pa', 'PTS', 24, 'caesars', -300, 240, '13:00'),
    // b: REB 8.5 over
    offer('g1', 'pb', 'REB', 8.5, 'fanduel', 120, -150, '13:00'),
    offer('g1', 'pb', 'REB', 8.5, 'draftkings', 105, -135, '13:00'),
    // c: REB 10.5 under
    offer('g1', 'pc', 'REB', 10.5, 'betmgm', -125, -105, '13:00'),
    offer('g1', 'pc', 'REB', 10.5, 'draftkings', -105, -115, '13:00'),
    // d: AST 6.5 over, draftkings only
    offer('g1', 'pd', 'AST', 6.5, 'draftkings', -150, 120, '13:00'),
    // e: caesars only
    offer('g2', 'pe', 'PRA', 40.5, 'caesars', 150, -190, '13:00'),
    // f: 3PM 2.5 under
    offer('g2', 'pf', '3PM', 2.5, 'fanduel', -130, 100, '13:00'),
  ]);
});

afterAll(async () => {
  await closeDb(db);
});

const base: BoardFilter = { ...DEFAULT_BOARD_FILTER, date: '2026-11-18' };
const q = async (patch: Partial<BoardFilter> = {}, opts?: Parameters<typeof queryBoard>[2]) =>
  queryBoard(db, { ...base, ...patch }, opts);
/** Letters of the returned rows, in order. */
const ids = async (patch: Partial<BoardFilter> = {}) =>
  (await q(patch)).rows.map((r) => byKey.get(r.propKey)!);
/** Letters of the returned rows, order-insensitive (sorted). */
const set = async (patch: Partial<BoardFilter> = {}) => (await ids(patch)).sort();

describe('pct helper (R10)', () => {
  it('converts 0..100 filter percentages to 0..1 column fractions', () => {
    expect(pct(70)).toBeCloseTo(0.7, 12);
    expect(pct(0)).toBe(0);
    expect(pct(100)).toBe(1);
  });
});

describe('scope filters', () => {
  it('defaults to the slate date given and returns that date only', async () => {
    expect(await set()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  });
  it('date picks another slate', async () => {
    expect(await set({ date: '2026-11-19' })).toEqual(['i', 'j', 'k', 'l']);
  });
  it('undefined date means today in America/New_York', async () => {
    const late = await queryBoard(
      db,
      { ...DEFAULT_BOARD_FILTER },
      { now: new Date('2026-11-19T03:00:00Z') }, // 10pm ET on the 18th
    );
    expect(late.rows).toHaveLength(8);
    const next = await queryBoard(
      db,
      { ...DEFAULT_BOARD_FILTER },
      { now: new Date('2026-11-19T15:00:00Z') },
    );
    expect(next.rows).toHaveLength(4);
  });
  it('games', async () => {
    expect(await set({ games: ['g2'] })).toEqual(['e', 'f', 'g', 'h']);
  });
  it('teams', async () => {
    expect(await set({ teams: ['NYK'] })).toEqual(['c', 'd']);
    expect(await set({ teams: ['BOS', 'DEN'] })).toEqual(['a', 'b', 'g', 'h']);
  });
  it('positions', async () => {
    expect(await set({ positions: ['C'] })).toEqual(['c', 'g']);
    expect(await set({ positions: ['F'] })).toEqual(['b', 'e']);
  });
  it('q is a case-insensitive substring; wildcards are literal', async () => {
    expect(await set({ q: 'FOX' })).toEqual(['f']);
    expect(await set({ q: 'char' })).toEqual(['c']);
    expect(await set({ q: '%' })).toEqual([]);
    expect(await set({ q: '_' })).toEqual([]);
  });
});

describe('market filters', () => {
  it('markets', async () => {
    expect(await set({ markets: ['REB', 'AST'] })).toEqual(['b', 'c', 'd', 'h']);
    expect(await set({ markets: ['PTS'] })).toEqual(['a', 'g']);
  });
  it('side', async () => {
    expect(await set({ side: 'under' })).toEqual(['c', 'f', 'h']);
    expect(await set({ side: 'over' })).toEqual(['a', 'b', 'd', 'e', 'g']);
    expect(await set({ side: 'both' })).toHaveLength(8);
  });
});

describe('performance filters', () => {
  it('minHitRate on the l10 window (percent, boundary inclusive)', async () => {
    expect(await set({ minHitRate: 80 })).toEqual(['a', 'b', 'f']);
  });
  it('minHitRate follows `window`', async () => {
    expect(await set({ window: 'l5', minHitRate: 80 })).toEqual(['a', 'b', 'f', 'g']);
    expect(await set({ window: 'season', minHitRate: 75 })).toEqual(['a', 'f']);
    expect(await set({ window: 'h2h', minHitRate: 100 })).toEqual(['a']);
    expect(await set({ window: 'lastSeason', minHitRate: 90 })).toEqual(['d']);
  });
  it('minGames uses the window sample size', async () => {
    expect(await set({ minGames: 10 })).toEqual(['a', 'b', 'd', 'f', 'h']);
    expect(await set({ window: 'season', minGames: 36 })).toEqual(['a', 'b', 'd', 'h']);
  });
  it('minStreak', async () => {
    expect(await set({ minStreak: 3 })).toEqual(['a', 'b', 'f']);
  });
  it('minEdge', async () => {
    expect(await set({ minEdge: 2 })).toEqual(['a', 'g']);
  });
});

describe('price filters', () => {
  it('oddsMin', async () => {
    expect(await set({ oddsMin: 100 })).toEqual(['b', 'e', 'f']);
  });
  it('oddsMax', async () => {
    expect(await set({ oddsMax: -110 })).toEqual(['a', 'd', 'g', 'h']);
  });
  it('oddsMin and oddsMax together', async () => {
    expect(await set({ oddsMin: -120, oddsMax: -105 })).toEqual(['a', 'c', 'g', 'h']);
  });
  it('bestPriceOnly drops rows with no price', async () => {
    expect(await set({ date: '2026-11-19', bestPriceOnly: true })).toEqual(['i', 'k', 'l']);
    expect(await set({ date: '2026-11-19' })).toEqual(['i', 'j', 'k', 'l']);
  });
  it('minValue (percentage points)', async () => {
    expect(await set({ minValue: 5 })).toEqual(['a', 'b', 'f', 'g']);
  });
});

describe('books filter', () => {
  it('recomputes the best price from latest offers at the main line', async () => {
    const r = await q({ books: ['draftkings'] });
    expect(r.rows.map((x) => [byKey.get(x.propKey), x.bestPrice, x.bestBook])).toEqual([
      ['a', -110, 'draftkings'], // latest dk row, not the superseded -105
      ['b', 105, 'draftkings'],
      ['c', -115, 'draftkings'], // under side price
      ['d', -150, 'draftkings'],
    ]);
  });
  it('picks the best across the chosen books and excludes rows with none', async () => {
    const r = await q({ books: ['fanduel'] });
    expect(r.rows.map((x) => [byKey.get(x.propKey), x.bestPrice, x.bestBook])).toEqual([
      ['a', -125, 'fanduel'],
      ['f', 100, 'fanduel'],
      ['b', 120, 'fanduel'],
    ]);
    const two = await q({ books: ['draftkings', 'betmgm'] });
    expect(two.rows.map((x) => [byKey.get(x.propKey), x.bestPrice, x.bestBook])).toEqual([
      ['a', -110, 'draftkings'],
      ['b', 105, 'draftkings'],
      ['c', -105, 'betmgm'],
      ['d', -150, 'draftkings'],
    ]);
    expect(r.total).toBe(3);
  });
  it('odds filters use the recomputed price, not the stored best', async () => {
    // Stored best prices would let b (+120), e (+150) and f (+100) through.
    expect(await ids({ books: ['draftkings'], oddsMin: 100 })).toEqual(['b']);
  });
  it('sorting by odds uses the recomputed price', async () => {
    expect(await ids({ books: ['draftkings', 'betmgm'], sort: 'odds' })).toEqual([
      'b',
      'c',
      'a',
      'd',
    ]);
  });
});

describe('matchup filters', () => {
  it('dvpTiers', async () => {
    expect(await set({ dvpTiers: ['worst'] })).toEqual(['a', 'e']);
    expect(await set({ dvpTiers: ['best', 'good'] })).toEqual(['c', 'd', 'f', 'g']);
  });
  it('dvpRankMin / dvpRankMax', async () => {
    expect(await set({ dvpRankMin: 20 })).toEqual(['a', 'b', 'e']);
    expect(await set({ dvpRankMax: 8 })).toEqual(['d', 'f', 'g']);
    expect(await set({ dvpRankMin: 5, dvpRankMax: 10 })).toEqual(['c', 'd', 'f']);
  });
});

describe('situation filters', () => {
  it('homeAway', async () => {
    expect(await set({ homeAway: 'home' })).toEqual(['a', 'b', 'e', 'f']);
    expect(await set({ homeAway: 'away' })).toEqual(['c', 'd', 'g', 'h']);
  });
  it('b2bOnly', async () => {
    expect(await set({ b2bOnly: true })).toEqual(['c', 'g']);
  });
  it('restDaysMin / restDaysMax', async () => {
    expect(await set({ restDaysMin: 2 })).toEqual(['a', 'd', 'f']);
    expect(await set({ restDaysMax: 1 })).toEqual(['b', 'c', 'e', 'g', 'h']);
  });
  it('totalMin / totalMax', async () => {
    expect(await set({ totalMin: 230 })).toEqual(['e', 'f', 'g', 'h']);
    expect(await set({ totalMax: 230 })).toEqual(['a', 'b', 'c', 'd']);
  });
  it('absSpreadMax uses |spread|', async () => {
    expect(await set({ absSpreadMax: 5 })).toEqual(['e', 'f', 'g', 'h']);
    expect(await set({ absSpreadMax: 6.5 })).toHaveLength(8);
  });
});

describe('role filters', () => {
  it('minMinutes', async () => {
    expect(await set({ minMinutes: 33 })).toEqual(['a', 'd']);
  });
  it('minUsage (percent)', async () => {
    expect(await set({ minUsage: 25 })).toEqual(['a', 'd', 'g']);
  });
  it('starterOnly', async () => {
    expect(await set({ starterOnly: true })).toEqual(['a', 'b', 'd', 'f', 'g']);
  });
});

describe('health filters', () => {
  it('excludeQuestionable keeps null and probable', async () => {
    expect(await set({ excludeQuestionable: true })).toEqual(['a', 'c', 'd', 'f', 'g']);
  });
  it('teammateOutOnly', async () => {
    expect(await set({ teammateOutOnly: true })).toEqual(['a', 'e']);
  });
});

describe('market move filters', () => {
  it('minLineMove with direction', async () => {
    expect(await set({ minLineMove: 1 })).toEqual(['a', 'd', 'e', 'g']);
    expect(await set({ minLineMove: 1, lineMoveDir: 'up' })).toEqual(['a', 'd']);
    expect(await set({ minLineMove: 1, lineMoveDir: 'down' })).toEqual(['e', 'g']);
  });
});

describe('sorting', () => {
  it('hitRate follows the window, both directions', async () => {
    expect(await ids({ sort: 'hitRate' })).toEqual(['a', 'f', 'b', 'g', 'c', 'd', 'e', 'h']);
    expect(await ids({ sort: 'hitRate', dir: 'asc' })).toEqual([
      'h',
      'e',
      'd',
      'c',
      'g',
      'b',
      'f',
      'a',
    ]);
  });
  it('ties break on prop_key ascending', async () => {
    // l5: a 1.0; b, f, g 0.8; c, e 0.6; d 0.4; h 0.2
    expect(await ids({ window: 'l5' })).toEqual(['a', 'b', 'f', 'g', 'c', 'e', 'd', 'h']);
    expect(await ids({ window: 'l5', dir: 'asc' })).toEqual([
      'h',
      'd',
      'c',
      'e',
      'b',
      'f',
      'g',
      'a',
    ]);
  });
  it('edge', async () => {
    expect(await ids({ sort: 'edge' })).toEqual(['a', 'g', 'b', 'c', 'f', 'd', 'e', 'h']);
  });
  it('value', async () => {
    expect(await ids({ sort: 'value' })).toEqual(['f', 'a', 'b', 'g', 'c', 'd', 'e', 'h']);
  });
  it('odds', async () => {
    expect(await ids({ sort: 'odds' })).toEqual(['e', 'b', 'f', 'c', 'a', 'h', 'g', 'd']);
  });
  it('lineMove', async () => {
    expect(await ids({ sort: 'lineMove' })).toEqual(['d', 'a', 'f', 'c', 'h', 'b', 'g', 'e']);
  });
  it('streak', async () => {
    expect(await ids({ sort: 'streak' })).toEqual(['a', 'f', 'b', 'c', 'd', 'g', 'e', 'h']);
  });
  it('tipAt', async () => {
    expect(await ids({ sort: 'tipAt', dir: 'asc' })).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
    ]);
    expect(await ids({ sort: 'tipAt', dir: 'desc' })).toEqual([
      'e',
      'f',
      'g',
      'h',
      'a',
      'b',
      'c',
      'd',
    ]);
  });
  it('nulls sort last in both directions', async () => {
    expect(await ids({ date: '2026-11-19', sort: 'value' })).toEqual(['k', 'i', 'l', 'j']);
    expect(await ids({ date: '2026-11-19', sort: 'value', dir: 'asc' })).toEqual([
      'l',
      'i',
      'k',
      'j',
    ]);
  });
});

describe('paging and response shape', () => {
  it('pages with pageSize and reports total', async () => {
    const p1 = await q({ page: 1 }, { pageSize: 3 });
    expect(p1.rows.map((r) => byKey.get(r.propKey))).toEqual(['a', 'f', 'b']);
    expect(p1).toMatchObject({ total: 8, page: 1, pageSize: 3 });
    const p2 = await q({ page: 2 }, { pageSize: 3 });
    expect(p2.rows.map((r) => byKey.get(r.propKey))).toEqual(['g', 'c', 'd']);
    const p3 = await q({ page: 3 }, { pageSize: 3 });
    expect(p3.rows.map((r) => byKey.get(r.propKey))).toEqual(['e', 'h']);
    const p4 = await q({ page: 4 }, { pageSize: 3 });
    expect(p4.rows).toEqual([]);
    expect(p4.total).toBe(8);
  });
  it('clamps pageSize to 1..200, default 50', async () => {
    expect((await q()).pageSize).toBe(50);
    expect((await q({}, { pageSize: 999 })).pageSize).toBe(200);
    expect((await q({}, { pageSize: 0 })).pageSize).toBe(1);
  });
  it('maps a row to PropRow', async () => {
    const r = (await q()).rows[0]!;
    expect(r).toMatchObject({
      propKey: K.a,
      gameId: 'g1',
      playerId: 'pa',
      playerName: 'Alpha Ace',
      teamAbbr: 'BOS',
      oppAbbr: 'NYK',
      market: 'PTS',
      side: 'over',
      line: 24.5,
      bestPrice: -110,
      bestBook: 'draftkings',
      tipAt: '2026-11-19T00:00:00.000Z',
      computedAt: '2026-11-18T14:00:00.000Z',
      recent: [1, 2, 3],
      streak: 6,
      teammateOut: true,
    });
    expect(r.rates.l10).toEqual({ hits: 9, n: 10, rate: 0.9 });
    expect(r.rates.h2h).toEqual({ hits: 3, n: 3, rate: 1 });
    expect(r.rates.l20).toEqual({ hits: 0, n: 0, rate: null });
    expect(r.impliedProbNoVig).toBeNull();
  });
  it('echoes the filter and the slate computedAt; empty result is fine', async () => {
    const r = await q({ date: '2030-01-01' });
    expect(r).toMatchObject({ rows: [], total: 0, computedAt: null });
    expect(r.filter.date).toBe('2030-01-01');
    expect((await q()).computedAt).toBe('2026-11-18T14:00:00.000Z');
  });
});

describe('rows with a NULL rate and n = 0', () => {
  it('appear without a hit-rate filter but are excluded by any minHitRate', async () => {
    expect((await q({ date: '2026-11-20' })).rows).toHaveLength(1);
    expect((await q({ date: '2026-11-20', minHitRate: 1 })).rows).toEqual([]);
    expect((await q({ date: '2026-11-20', minHitRate: 0 })).rows).toEqual([]);
    expect((await q({ date: '2026-11-20', window: 'season', minHitRate: 1 })).rows).toEqual([]);
  });
  it('are excluded by minGames', async () => {
    expect((await q({ date: '2026-11-20', minGames: 1 })).rows).toEqual([]);
  });
});

describe('combined filters', () => {
  it('AND-s every condition', async () => {
    expect(
      await set({ side: 'over', minHitRate: 60, starterOnly: true, excludeQuestionable: true }),
    ).toEqual(['a', 'd', 'g']);
  });
});
