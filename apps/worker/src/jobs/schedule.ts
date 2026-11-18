import { addDays, nyDate } from '@blueline/adapters';
import { parsePositiveInt, parseYmd } from '../ids';
import type { Job } from '../run-job';
import { ensureTeams, upsertGames, upsertRosterPlayers, upsertTeams } from '../store';

/**
 * ingest:schedule [--date YYYY-MM-DD] [--days N]
 * Teams, then N days of games from --date (default: today, 7 days), then the
 * rosters of every team playing in that window.
 */
export const ingestSchedule: Job = async (ctx, opts) => {
  const start = opts.date ? parseYmd(opts.date) : nyDate(ctx.now);
  const days = opts.days ? parsePositiveInt(opts.days, '--days') : 7;

  const teamCount = await upsertTeams(ctx.db, await ctx.stats.getTeams());
  let gameCount = 0;
  const playing = new Set<string>();
  for (let i = 0; i < days; i++) {
    const games = await ctx.stats.getSchedule(addDays(start, i));
    const map = await ensureTeams(
      ctx,
      games.flatMap((g) => [g.homeTeamExternalId, g.awayTeamExternalId]),
    );
    gameCount += await upsertGames(ctx.db, games, map);
    for (const g of games) playing.add(g.homeTeamExternalId).add(g.awayTeamExternalId);
  }

  const map = await ensureTeams(ctx, playing);
  let playerCount = 0;
  for (const teamEspnId of [...playing].sort()) {
    playerCount += await upsertRosterPlayers(ctx.db, await ctx.stats.getRoster(teamEspnId), map);
  }
  return { meta: { from: start, days, teams: teamCount, games: gameCount, players: playerCount } };
};
