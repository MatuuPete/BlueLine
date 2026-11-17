import type { GameStatus, LegResult, Market, Side } from '@blueline/contracts';
import { gradeValue, isPlayed, statValue, type LogLine } from './stats';

/** postponed/canceled -> void; not final -> pending; null box or DNP -> void. */
export function gradeLeg(
  leg: { market: Market; line: number; side: Side },
  box: LogLine | null,
  gameStatus: GameStatus,
): LegResult {
  if (gameStatus === 'postponed' || gameStatus === 'canceled') return 'void';
  if (gameStatus !== 'final') return 'pending';
  if (box === null || !isPlayed(box)) return 'void';
  return gradeValue(statValue(box, leg.market), leg.line, leg.side);
}
