import {
  createFixtureOddsProvider,
  createFixtureStatsProvider,
  type HttpDeps,
  type OddsProvider,
} from '@blueline/adapters';
import type { NormPropOffer } from '@blueline/contracts';
import {
  count,
  games,
  injuries,
  playerGameLogs,
  players,
  propOffers,
  providerAliases,
  rawPayloads,
  teams,
  type Db,
} from '@blueline/db';
import { createTestDb } from '@blueline/db/testing';
import { createRecorder } from '../src/context';
import type { JobContext } from '../src/run-job';

/** The recorded anchor day; tests replay fixtures without a date shift. */
export const ANCHOR = '2026-11-17';
/** Noon ET on the anchor day. */
export const NOON = new Date('2026-11-17T17:00:00Z');

export const noNetwork = (() => {
  throw new Error('network access is not allowed in tests');
}) as unknown as typeof fetch;

export function fixtureDeps(db: Db): HttpDeps {
  return { fetch: noNetwork, record: createRecorder(db), fixtureDate: ANCHOR };
}

export async function makeCtx(over: Partial<JobContext> = {}): Promise<JobContext> {
  const db = over.db ?? (await createTestDb());
  const deps = fixtureDeps(db);
  return {
    db,
    stats: createFixtureStatsProvider(deps),
    odds: createFixtureOddsProvider(deps),
    now: NOON,
    log: () => {},
    oddsMonthlyBudget: 2500,
    ...over,
  };
}

/** Wrap an odds provider, rewriting each game's offers. */
export function mapOffers(
  inner: OddsProvider,
  fn: (offers: NormPropOffer[]) => NormPropOffer[],
): OddsProvider {
  return {
    name: inner.name,
    estimateUnits: (g, m) => inner.estimateUnits(g, m),
    getGameLines: (d) => inner.getGameLines(d),
    async getPlayerProps(game, markets) {
      const res = await inner.getPlayerProps(game, markets);
      return { ...res, offers: fn(res.offers) };
    },
  };
}

export async function counts(db: Db) {
  const [t] = await db.select({ n: count() }).from(teams);
  const [p] = await db.select({ n: count() }).from(players);
  const [g] = await db.select({ n: count() }).from(games);
  const [l] = await db.select({ n: count() }).from(playerGameLogs);
  const [i] = await db.select({ n: count() }).from(injuries);
  const [o] = await db.select({ n: count() }).from(propOffers);
  const [a] = await db.select({ n: count() }).from(providerAliases);
  const [r] = await db.select({ n: count() }).from(rawPayloads);
  return {
    teams: t!.n,
    players: p!.n,
    games: g!.n,
    logs: l!.n,
    injuries: i!.n,
    offers: o!.n,
    aliases: a!.n,
    raw: r!.n,
  };
}
