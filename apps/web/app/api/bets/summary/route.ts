import { BetFilterSchema } from '@blueline/contracts';
import { betSummary } from '@blueline/db/queries/bets';
import { authed, json, parseInput } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

export const GET = authed(async ({ db, userId }, req: Request) => {
  const parsed = parseInput(
    BetFilterSchema,
    Object.fromEntries(new URL(req.url).searchParams.entries()),
  );
  if ('res' in parsed) return parsed.res;
  return json(await betSummary(db, userId, parsed.data));
});
