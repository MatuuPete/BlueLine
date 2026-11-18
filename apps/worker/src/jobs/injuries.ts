import type { InjuryStatus } from '@blueline/contracts';
import { desc, eq, injuries, inArray, players, type Db } from '@blueline/db';
import type { Job } from '../run-job';
import { chunk, loadTeams } from '../store';

interface Snap {
  playerId: string;
  teamId: string | null;
  status: InjuryStatus;
  detail: string | null;
}

const keyOf = (s: Snap) => `${s.playerId}|${s.status}|${s.detail ?? ''}`;

/** The newest report batch (every row shares one captured_at). */
async function latestBatch(db: Db): Promise<Snap[]> {
  const [last] = await db
    .select({ at: injuries.capturedAt })
    .from(injuries)
    .orderBy(desc(injuries.capturedAt))
    .limit(1);
  if (!last) return [];
  return db
    .select({
      playerId: injuries.playerId,
      teamId: injuries.teamId,
      status: injuries.status,
      detail: injuries.detail,
    })
    .from(injuries)
    .where(eq(injuries.capturedAt, last.at));
}

/**
 * ingest:injuries
 * Snapshots the injury report. Each run that sees a change writes the whole
 * report as one batch sharing `captured_at`, so the newest batch is the current
 * report (a player missing from it is healthy). An unchanged report writes
 * nothing. Players we do not know yet are skipped and listed in meta.unmatched.
 */
export const ingestInjuries: Job = async (ctx) => {
  const report = await ctx.stats.getInjuries();
  const espnIds = [...new Set(report.map((r) => r.playerExternalId))];
  const known = new Map<string, string>();
  for (const part of chunk(espnIds, 500)) {
    const rows = await ctx.db
      .select({ id: players.id, espnId: players.espnId })
      .from(players)
      .where(inArray(players.espnId, part));
    for (const r of rows) if (r.espnId) known.set(r.espnId, r.id);
  }
  const teamsByEspn = await loadTeams(ctx.db);

  const unmatched: string[] = [];
  const snaps = new Map<string, Snap>();
  for (const r of report) {
    const playerId = known.get(r.playerExternalId);
    if (!playerId) {
      unmatched.push(r.playerName);
      continue;
    }
    snaps.set(playerId, {
      playerId,
      teamId: teamsByEspn.get(r.teamExternalId)?.id ?? null,
      status: r.status,
      detail: r.detail,
    });
  }

  const current = [...snaps.values()];
  const previous = new Set((await latestBatch(ctx.db)).map(keyOf));
  const same = previous.size === current.length && current.every((s) => previous.has(keyOf(s)));
  if (same) {
    return { meta: { reported: report.length, inserted: 0, unchanged: true, unmatched } };
  }
  for (const part of chunk(current, 500)) {
    await ctx.db.insert(injuries).values(part.map((s) => ({ ...s, capturedAt: ctx.now })));
  }
  return {
    meta: { reported: report.length, inserted: current.length, unchanged: false, unmatched },
  };
};
