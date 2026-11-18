import { BoardFilterSchema } from '@blueline/contracts';
import { listGames } from '@blueline/db/queries/games';
import { authed, json, parseInput } from '../../../lib/api';

export const dynamic = 'force-dynamic';

/** Today's slate date in America/New_York as YYYY-MM-DD. */
function todayEt(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export const GET = authed(async ({ db }, req: Request) => {
  const date = new URL(req.url).searchParams.get('date') ?? todayEt();
  const parsed = parseInput(BoardFilterSchema.shape.date.unwrap(), date);
  if ('res' in parsed) return parsed.res;
  return json(await listGames(db, parsed.data));
});
