// Builds hand-made odds fixtures (no API keys exist for recording):
//   fixtures/sgo/events/{date}.json            SportsGameOdds v2 GET /events responses
//   fixtures/theoddsapi/events.json            The Odds API v4 GET /sports/basketball_nba/events
//   fixtures/theoddsapi/event-odds/{id}.json   GET /events/{id}/odds (player props)
//   fixtures/theoddsapi/odds/{date}.json       GET /odds?markets=spreads,totals
//
//   node packages/adapters/scripts/build-odds-fixtures.mjs
//
// Shapes follow sportsgameodds.com/docs (oddID = {statID}-{statEntityID}-{periodID}-
// {betTypeID}-{sideID}, byBookmaker.{book}.{odds,overUnder,spread}) and the-odds-api.com
// v4 docs (bookmakers[].markets[].outcomes[] with name/description/price/point).
// Lines are set from each player's recorded ESPN box scores (last 10 games), so hit
// rates look realistic. A seeded PRNG keeps the output deterministic.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const ESPN = join(ROOT, 'espn');

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
async function save(rel, body) {
  const file = join(ROOT, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(body) + '\n');
}

// mulberry32
let seed = 0x5eed1e;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randId = (n, alphabet) => Array.from({ length: n }, () => pick(alphabet)).join('');
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const manifest = await readJson(join(ESPN, 'manifest.json'));
const teamsBody = await readJson(join(ESPN, 'teams.json'));
const TEAMS = new Map(
  teamsBody.sports[0].leagues[0].teams.map(({ team }) => [
    team.id,
    { id: team.id, abbr: team.abbreviation, name: team.displayName, nickname: team.name },
  ]),
);
// Provider-style names/abbrs differ from ESPN on purpose (adapters must match them).
const PROVIDER_NAME = { LAC: 'Los Angeles Clippers' };
const PROVIDER_ABBR = { GS: 'GSW', NY: 'NYK', UTAH: 'UTA', SA: 'SAS', NO: 'NOP', WSH: 'WAS' };
const providerName = (t) => PROVIDER_NAME[t.abbr] ?? t.name;
const upper = (s) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

// ---------------------------------------------------------------------------
// Player form from this season's recorded box scores
// ---------------------------------------------------------------------------

const games = [];
for (const f of await readdir(join(ESPN, 'summary'))) {
  const s = await readJson(join(ESPN, 'summary', f));
  const comp = s.header.competitions[0];
  if (s.header.season.year !== 2027) continue; // 2026-27 only
  games.push({ date: comp.date, comp, box: s.boxscore.players });
}
games.sort((a, b) => a.date.localeCompare(b.date));

/** playerId → { name, teamId, logs: [{min, pts, ...}] } (latest team wins) */
const players = new Map();
/** teamId → { pf: [], pa: [] } */
const teamForm = new Map();
for (const g of games) {
  for (const c of g.comp.competitors) {
    const opp = g.comp.competitors.find((o) => o !== c);
    const tf = teamForm.get(c.team.id) ?? { pf: [], pa: [] };
    tf.pf.push(Number(c.score));
    tf.pa.push(Number(opp.score));
    teamForm.set(c.team.id, tf);
  }
  for (const tb of g.box) {
    const st = tb.statistics[0];
    const k = (row, key) => row[st.keys.indexOf(key)];
    for (const a of st.athletes) {
      if (a.didNotPlay || !a.stats?.length) continue;
      const row = a.stats;
      const min = Number(k(row, 'minutes'));
      if (!(min > 0)) continue;
      const p = players.get(a.athlete.id) ?? { name: a.athlete.displayName, logs: [] };
      p.teamId = tb.team.id;
      p.logs.push({
        min,
        pts: Number(k(row, 'points')),
        reb: Number(k(row, 'rebounds')),
        ast: Number(k(row, 'assists')),
        fg3m: Number(
          k(row, 'threePointFieldGoalsMade-threePointFieldGoalsAttempted').split('-')[0],
        ),
        stl: Number(k(row, 'steals')),
        blk: Number(k(row, 'blocks')),
        tov: Number(k(row, 'turnovers')),
      });
      players.set(a.athlete.id, p);
    }
  }
}

const injuries = await readJson(join(ESPN, 'injuries.json'));
const outIds = new Set();
for (const t of injuries.injuries) {
  for (const e of t.injuries) {
    if (e.status !== 'Out') continue;
    const m = /\/id\/(\d+)/.exec(e.athlete.links?.[0]?.href ?? '');
    if (m) outIds.add(m[1]);
  }
}

const avg = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(xs.length, 1);

function rotation(teamId) {
  return [...players.entries()]
    .filter(([id, p]) => p.teamId === teamId && !outIds.has(id) && p.logs.length >= 3)
    .map(([id, p]) => ({ id, ...p, minAvg: avg(p.logs.slice(-10).map((l) => l.min)) }))
    .filter((p) => p.minAvg >= 20)
    .sort((a, b) => b.minAvg - a.minAvg)
    .slice(0, 8);
}

// ---------------------------------------------------------------------------
// Lines and prices
// ---------------------------------------------------------------------------

const MARKETS = [
  // [ours, SGO statID, Odds API key, components]
  ['PTS', 'points', 'player_points', ['pts']],
  ['REB', 'rebounds', 'player_rebounds', ['reb']],
  ['AST', 'assists', 'player_assists', ['ast']],
  ['3PM', 'threePointersMade', 'player_threes', ['fg3m']],
  ['STL', 'steals', 'player_steals', ['stl']],
  ['BLK', 'blocks', 'player_blocks', ['blk']],
  ['TOV', 'turnovers', 'player_turnovers', ['tov']],
  ['PRA', 'points+rebounds+assists', 'player_points_rebounds_assists', ['pts', 'reb', 'ast']],
  ['PR', 'points+rebounds', 'player_points_rebounds', ['pts', 'reb']],
  ['PA', 'points+assists', 'player_points_assists', ['pts', 'ast']],
  ['RA', 'rebounds+assists', 'player_rebounds_assists', ['reb', 'ast']],
  ['STOCKS', 'blocks+steals', 'player_blocks_steals', ['stl', 'blk']],
];
const MINOR = new Set(['STL', 'BLK', 'TOV', 'STOCKS']);

/** Main (modal) line: last-10 average rounded to the nearest x.5. */
function mainLine(p, comps) {
  const a = avg(p.logs.slice(-10).map((l) => comps.reduce((s, c) => s + l[c], 0)));
  return Math.max(0.5, Math.round(a - 0.5) + 0.5);
}

function american(prob) {
  const x = prob >= 0.5 ? (-100 * prob) / (1 - prob) : (100 * (1 - prob)) / prob;
  let r = Math.round(x / 5) * 5;
  if (Math.abs(r) < 100) r = r < 0 ? -100 : 100;
  if (r === -100) r = 100;
  return r;
}

/** Two-way prices with ~4.5% hold around a fair over probability. */
function prices(pOver) {
  return { over: american(pOver * 1.045), under: american((1 - pOver) * 1.045) };
}

/** One book's quote: occasionally half a point off the main line, priced around it. */
function quote(line) {
  const r = rand();
  const l = r < 0.15 && line > 0.5 ? line - 0.5 : r > 0.85 ? line + 0.5 : line;
  const shift = (line - l) * 0.08; // a lower line makes the over likelier
  const pOver = Math.min(0.72, Math.max(0.3, 0.5 + shift + (rand() - 0.5) * 0.1));
  return { line: l, ...prices(pOver) };
}

const fmtOdds = (x) => (x > 0 ? `+${x}` : `${x}`);
const roundHalf = (x) => Math.round(x * 2) / 2;

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const SGO_MAIN_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'caesars', 'bovada'];
const SGO_MINOR_BOOKS = ['draftkings', 'fanduel', 'caesars'];
const TOA_BOOKS = [
  ['draftkings', 'DraftKings'],
  ['fanduel', 'FanDuel'],
  ['betmgm', 'BetMGM'],
  ['williamhill_us', 'Caesars'],
  ['bovada', 'Bovada'],
];

const toaEvents = [];
let toaPropGames = 0;
let sgoEventCount = 0;
let sgoOfferCount = 0;

for (const date of manifest.upcomingDates) {
  const sb = await readJson(join(ESPN, 'scoreboard', `${date}.json`));
  const sgoEvents = [];
  for (const e of sb.events) {
    const comp = e.competitions[0];
    const startsAt = new Date(comp.date).toISOString();
    const home = TEAMS.get(comp.competitors.find((c) => c.homeAway === 'home').team.id);
    const away = TEAMS.get(comp.competitors.find((c) => c.homeAway === 'away').team.id);
    const sides = { home, away };

    // Game lines
    const hf = teamForm.get(home.id);
    const af = teamForm.get(away.id);
    const net = (f) => avg(f.pf) - avg(f.pa);
    const spread = roundHalf(-((net(hf) - net(af)) / 2 + 2));
    const total = roundHalf((avg(hf.pf) + avg(af.pf) + avg(hf.pa) + avg(af.pa)) / 2);

    // ---------------- SportsGameOdds event
    const sgoTeamId = (t) => `${upper(providerName(t))}_NBA`;
    const sgoPlayers = {};
    const odds = {};
    const addOdd = (oddID, statID, entity, betTypeID, sideID, byBookmaker, playerID) => {
      odds[oddID] = {
        oddID,
        opposingOddID: oddID.replace(
          /-(over|under|home|away)$/,
          (m) => ({ '-over': '-under', '-under': '-over', '-home': '-away', '-away': '-home' })[m],
        ),
        marketName: `${statID} ${betTypeID}`,
        statID,
        statEntityID: entity,
        periodID: 'game',
        betTypeID,
        sideID,
        ...(playerID ? { playerID } : {}),
        started: false,
        ended: false,
        cancelled: false,
        bookOddsAvailable: true,
        fairOddsAvailable: true,
        byBookmaker,
      };
    };
    const now = '2026-11-17T15:00:00.000Z';
    const spreadBooks = {};
    const spreadBooksAway = {};
    const totalOver = {};
    const totalUnder = {};
    for (const b of ['draftkings', 'fanduel', 'betmgm', 'caesars']) {
      const sp = spread + (rand() < 0.2 ? 0.5 : 0);
      const to = total + (rand() < 0.2 ? -0.5 : 0);
      spreadBooks[b] = { odds: '-110', spread: String(sp), available: true, lastUpdatedAt: now };
      spreadBooksAway[b] = {
        odds: '-110',
        spread: String(-sp),
        available: true,
        lastUpdatedAt: now,
      };
      totalOver[b] = { odds: '-110', overUnder: String(to), available: true, lastUpdatedAt: now };
      totalUnder[b] = { odds: '-110', overUnder: String(to), available: true, lastUpdatedAt: now };
    }
    addOdd('points-home-game-sp-home', 'points', 'home', 'sp', 'home', spreadBooks);
    addOdd('points-away-game-sp-away', 'points', 'away', 'sp', 'away', spreadBooksAway);
    addOdd('points-all-game-ou-over', 'points', 'all', 'ou', 'over', totalOver);
    addOdd('points-all-game-ou-under', 'points', 'all', 'ou', 'under', totalUnder);

    for (const side of ['home', 'away']) {
      const team = sides[side];
      for (const p of rotation(team.id)) {
        // SGO tends to drop punctuation ("Jr." → "Jr")
        const name = p.name.replace(/\./g, '');
        const playerID = `${upper(name)}_1_NBA`;
        sgoPlayers[playerID] = {
          playerID,
          teamID: sgoTeamId(team),
          firstName: name.split(' ')[0],
          lastName: name.split(' ').slice(1).join(' '),
          name,
        };
        for (const [ours, statID, , comps] of MARKETS) {
          const line = mainLine(p, comps);
          const over = {};
          const under = {};
          for (const b of MINOR.has(ours) ? SGO_MINOR_BOOKS : SGO_MAIN_BOOKS) {
            const q = quote(line);
            over[b] = { odds: fmtOdds(q.over), overUnder: String(q.line), available: true };
            under[b] = { odds: fmtOdds(q.under), overUnder: String(q.line), available: true };
            sgoOfferCount++;
          }
          addOdd(
            `${statID}-${playerID}-game-ou-over`,
            statID,
            playerID,
            'ou',
            'over',
            over,
            playerID,
          );
          addOdd(
            `${statID}-${playerID}-game-ou-under`,
            statID,
            playerID,
            'ou',
            'under',
            under,
            playerID,
          );
        }
      }
    }

    const sgoTeam = (t, side) => ({
      teamID: sgoTeamId(t),
      names: { long: providerName(t), medium: t.nickname, short: PROVIDER_ABBR[t.abbr] ?? t.abbr },
      statEntityID: side,
    });
    sgoEvents.push({
      eventID: randId(20, ALNUM),
      sportID: 'BASKETBALL',
      leagueID: 'NBA',
      type: 'match',
      teams: { home: sgoTeam(home, 'home'), away: sgoTeam(away, 'away') },
      status: {
        started: false,
        completed: false,
        cancelled: false,
        ended: false,
        live: false,
        delayed: false,
        displayShort: '',
        displayLong: 'Upcoming',
        oddsPresent: true,
        oddsAvailable: true,
        finalized: false,
        startsAt,
      },
      odds,
      players: sgoPlayers,
    });

    // ---------------- The Odds API event
    const toaId = randId(32, '0123456789abcdef');
    const toaEvent = {
      id: toaId,
      sport_key: 'basketball_nba',
      sport_title: 'NBA',
      commence_time: startsAt.replace('.000Z', 'Z'),
      home_team: providerName(home),
      away_team: providerName(away),
    };
    toaEvents.push({ date, event: toaEvent, spread, total });

    // Player props for the first four games of the anchor day
    if (date === manifest.anchorDate && toaPropGames < 4) {
      toaPropGames++;
      const roster = [...rotation(home.id), ...rotation(away.id)];
      const bookmakers = TOA_BOOKS.map(([key, title]) => ({
        key,
        title,
        last_update: '2026-11-17T15:00:00Z',
        markets: MARKETS.map(([ours, , toaKey, comps]) => ({
          key: toaKey,
          last_update: '2026-11-17T15:00:00Z',
          outcomes: roster.flatMap((p) => {
            const q = quote(mainLine(p, comps));
            if (MINOR.has(ours) && key === 'betmgm') return [];
            return [
              { name: 'Over', description: p.name, price: q.over, point: q.line },
              { name: 'Under', description: p.name, price: q.under, point: q.line },
            ];
          }),
        })),
      }));
      await save(`theoddsapi/event-odds/${toaId}.json`, { ...toaEvent, bookmakers });
    }
  }
  sgoEventCount += sgoEvents.length;
  await save(`sgo/events/${date}.json`, { success: true, data: sgoEvents, nextCursor: null });
}

await save(
  'theoddsapi/events.json',
  toaEvents.map((t) => t.event),
);
for (const date of manifest.upcomingDates) {
  const body = toaEvents
    .filter((t) => t.date === date)
    .map(({ event, spread, total }) => ({
      ...event,
      bookmakers: TOA_BOOKS.slice(0, 4).map(([key, title]) => ({
        key,
        title,
        last_update: '2026-11-17T15:00:00Z',
        markets: [
          {
            key: 'spreads',
            last_update: '2026-11-17T15:00:00Z',
            outcomes: [
              { name: event.home_team, price: -110, point: spread },
              { name: event.away_team, price: -110, point: -spread },
            ],
          },
          {
            key: 'totals',
            last_update: '2026-11-17T15:00:00Z',
            outcomes: [
              { name: 'Over', price: -110, point: total },
              { name: 'Under', price: -110, point: total },
            ],
          },
        ],
      })),
    }));
  await save(`theoddsapi/odds/${date}.json`, body);
}

process.stdout.write(
  `SGO: ${sgoEventCount} events, ${sgoOfferCount} book quotes; Odds API: ${toaEvents.length} events, ${toaPropGames} with props\n`,
);
