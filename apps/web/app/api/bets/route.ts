import { BetFilterSchema, BetInputSchema } from '@blueline/contracts';
import { BetValidationError, createBet, listBets } from '@blueline/db/queries/bets';
import { authed, errorResponse, json, parseBody, parseInput } from '../../../lib/api';
import { filterParams } from '../../../lib/bets';

export const dynamic = 'force-dynamic';

export const GET = authed(async ({ db, userId }, req: Request) => {
  const parsed = parseInput(BetFilterSchema, filterParams(req.url));
  if ('res' in parsed) return parsed.res;
  return json(await listBets(db, userId, parsed.data));
});

export const POST = authed(async ({ db, userId }, req: Request) => {
  const parsed = await parseBody(req, BetInputSchema);
  if ('res' in parsed) return parsed.res;
  try {
    return json(await createBet(db, userId, parsed.data), 201);
  } catch (err) {
    if (err instanceof BetValidationError) return errorResponse(400, 'invalid_request', err.fields);
    throw err;
  }
});
