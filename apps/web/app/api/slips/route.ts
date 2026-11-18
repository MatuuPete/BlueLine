import { CreateSlipInputSchema } from '@blueline/contracts';
import { createSlip, listSlips } from '@blueline/db/queries/user';
import { authed, errorResponse, json, parseBody } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export const GET = authed(async ({ db, userId }) => json(await listSlips(db, userId)));

export const POST = authed(async ({ db, userId }, req: Request) => {
  const parsed = await parseBody(req, CreateSlipInputSchema);
  if ('res' in parsed) return parsed.res;
  try {
    return json(await createSlip(db, userId, parsed.data), 201);
  } catch (err) {
    // An unknown gameId/playerId violates a foreign key: bad input, not a crash.
    const msg = String((err as { cause?: unknown }).cause ?? err);
    if ((err as { code?: string }).code === '23503' || /foreign key/i.test(msg)) {
      return errorResponse(400, 'invalid_request', { legs: ['unknown game or player'] });
    }
    throw err;
  }
});
