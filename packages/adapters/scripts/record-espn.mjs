// Records real ESPN payloads into packages/adapters/fixtures/espn/.
//
//   node packages/adapters/scripts/record-espn.mjs
//
// This is the only code in the repo that fetches on purpose outside a worker job.
// Bulky keys the parsers never read (play-by-play, news, videos, logos, links...)
// are stripped so the fixture set stays small. Everything that remains is the
// verbatim ESPN response.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'espn');

/** The first "upcoming" day; the fixture provider maps it onto "today". */
const ANCHOR_DATE = '2026-11-17';
const UPCOMING_DATES = ['2026-11-17', '2026-11-18'];

function datesBetween(from, to, skip = []) {
  const out = [];
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`);) {
    const ymd = d.toISOString().slice(0, 10);
    if (!skip.includes(ymd)) out.push(ymd);
    d = new Date(d.getTime() + 86_400_000);
  }
  return out;
}

// 2026-27 season so far (no games on 2026-11-03), plus the last 4 days of 2025-26.
const FINISHED_DATES = [
  ...datesBetween('2026-04-09', '2026-04-12'),
  ...datesBetween('2026-10-20', '2026-11-16', ['2026-11-03']),
];

const DROP_KEYS = new Set([
  'links',
  'logos',
  'logo',
  'headshot',
  'uid',
  'guid',
  'alternateIds',
  'headlines',
  'geoBroadcasts',
  'broadcasts',
  'broadcast',
  'tickets',
  'leaders',
  'images',
  'flag',
  'contract',
  'college',
  'birthPlace',
  'draft',
  'experience',
  'injuries',
  'calendar',
  'highlights',
  'contracts',
]);

/** Remove keys the parsers never read. `keep` lists keys exempt at the top level. */
function strip(value, keep = new Set()) {
  if (Array.isArray(value)) return value.map((v) => strip(v));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (DROP_KEYS.has(k) && !keep.has(k)) continue;
      out[k] = strip(v);
    }
    return out;
  }
  return value;
}

async function getJson(path) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${BASE}${path}`);
    if (res.ok) return res.json();
    if (attempt >= 3) throw new Error(`${path}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

async function save(rel, body) {
  const file = join(OUT, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(body) + '\n');
}

async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) await fn(queue.shift());
    }),
  );
}

/** Injury rows carry the athlete id only inside the player-card link, so keep that one link. */
function stripInjury(entry) {
  const { athlete, ...rest } = entry;
  const { notes: _notes, links = [], ...a } = athlete ?? {};
  const card = links.filter((l) => l.rel?.includes('playercard')).slice(0, 1);
  return {
    ...strip(rest),
    athlete: { ...strip(a), links: card.map((l) => ({ rel: l.rel, href: l.href })) },
  };
}

async function recordInjuries() {
  const injuries = await getJson('/injuries');
  // The injuries endpoint's list key is itself called "injuries".
  await save('injuries.json', {
    ...strip(injuries),
    injuries: injuries.injuries.map((t) => ({
      ...strip(t),
      injuries: t.injuries.map(stripInjury),
    })),
  });
}

// `ONLY=injuries node record-espn.mjs` re-records just the injury report.
if (process.env.ONLY === 'injuries') {
  await recordInjuries();
  process.exit(0);
}

const teams = await getJson('/teams');
await save('teams.json', strip(teams));
const teamIds = teams.sports[0].leagues[0].teams.map((t) => t.team.id);

await pool(teamIds, 4, async (id) => {
  await save(`rosters/${id}.json`, strip(await getJson(`/teams/${id}/roster`)));
});

await recordInjuries();

const eventIds = [];
/** Finished dates that actually had completed games. */
const playedDates = [];
for (const ymd of [...FINISHED_DATES, ...UPCOMING_DATES]) {
  const sb = await getJson(`/scoreboard?dates=${ymd.replaceAll('-', '')}`);
  const { leagues: _leagues, ...rest } = sb;
  await save(`scoreboard/${ymd}.json`, strip(rest));
  if (FINISHED_DATES.includes(ymd)) {
    for (const e of sb.events) {
      if (e.competitions[0].status.type.completed) eventIds.push(e.id);
    }
    if (sb.events.some((e) => e.competitions[0].status.type.completed)) playedDates.push(ymd);
  }
  process.stdout.write(`scoreboard ${ymd}: ${sb.events.length} events\n`);
}

const SUMMARY_KEEP = ['header', 'boxscore', 'gameInfo', 'format', 'meta'];
await pool(eventIds, 4, async (id) => {
  const body = await getJson(`/summary?event=${id}`);
  const kept = Object.fromEntries(SUMMARY_KEEP.filter((k) => k in body).map((k) => [k, body[k]]));
  await save(`summary/${id}.json`, strip(kept));
});

await save('manifest.json', {
  source: BASE,
  recordedAt: new Date().toISOString(),
  anchorDate: ANCHOR_DATE,
  finishedDates: playedDates,
  upcomingDates: UPCOMING_DATES,
  summaries: eventIds.length,
});
process.stdout.write(`recorded ${eventIds.length} box scores\n`);
