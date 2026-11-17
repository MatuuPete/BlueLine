import type { DvpTier } from '@blueline/contracts';

/** Ascending allowed-per-game: lowest allowed = rank 1 (toughest). Ties break by teamId. */
export function dvpRank(rows: { teamId: string; allowedPerGame: number }[]): Map<string, number> {
  const sorted = [...rows].sort((a, b) => {
    if (a.allowedPerGame !== b.allowedPerGame) return a.allowedPerGame - b.allowedPerGame;
    return a.teamId < b.teamId ? -1 : 1;
  });
  const out = new Map<string, number>();
  sorted.forEach((r, i) => out.set(r.teamId, i + 1));
  return out;
}

export function dvpTier(rank: number): DvpTier {
  if (rank <= 6) return 'best';
  if (rank <= 15) return 'good';
  if (rank <= 24) return 'bad';
  return 'worst';
}
