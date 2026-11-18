import type { GameSummary } from '@blueline/contracts';
import { MINUS } from '@blueline/ui';
import { tipTimeET } from './time';

/** "NYK −3.5 · O/U 224.5" (spread is the home team's). Empty when no game line yet. */
export function gameLine(g: GameSummary): string {
  const parts: string[] = [];
  if (g.spread !== null) {
    const s = g.spread;
    parts.push(`${g.home.abbr} ${s > 0 ? '+' : s < 0 ? MINUS : ''}${Math.abs(s).toFixed(1)}`);
  }
  if (g.total !== null) parts.push(`O/U ${g.total.toFixed(1)}`);
  return parts.join(' · ');
}

/** Tip time, live score or final score. */
export function gameStatus(g: GameSummary): string {
  const score = `${g.away.abbr} ${g.away.score ?? 0}, ${g.home.abbr} ${g.home.score ?? 0}`;
  if (g.status === 'final') return `Final · ${score}`;
  if (g.status === 'in_progress') return `Live · ${score}`;
  if (g.status === 'scheduled') return tipTimeET(g.tipAt);
  return g.status.charAt(0).toUpperCase() + g.status.slice(1);
}
