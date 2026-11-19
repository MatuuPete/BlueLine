import { BetFilterSchema } from '@blueline/contracts';
import { betSummary } from '@blueline/db/queries/bets';
import { authed, json, parseInput } from '../../../../lib/api';
import { filterParams } from '../../../../lib/bets';

export const dynamic = 'force-dynamic';

export const GET = authed(async ({ db, userId }, req: Request) => {
  const parsed = parseInput(BetFilterSchema, filterParams(req.url));
  if ('res' in parsed) return parsed.res;
  return json(await betSummary(db, userId, parsed.data));
});
