import { BetUpdateSchema } from '@blueline/contracts';
import { BetValidationError, deleteBet, getBet, updateBet } from '@blueline/db/queries/bets';
import { authed, errorResponse, json, notFound, parseBody } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// Another user's bet and a missing bet both answer 404.
export const GET = authed(async ({ db, userId }, _req: Request, ctx: Ctx) => {
  const bet = await getBet(db, userId, (await ctx.params).id);
  return bet ? json(bet) : notFound();
});

export const PATCH = authed(async ({ db, userId }, req: Request, ctx: Ctx) => {
  const parsed = await parseBody(req, BetUpdateSchema);
  if ('res' in parsed) return parsed.res;
  try {
    const bet = await updateBet(db, userId, (await ctx.params).id, parsed.data);
    return bet ? json(bet) : notFound();
  } catch (err) {
    if (err instanceof BetValidationError) return errorResponse(400, 'invalid_request', err.fields);
    throw err;
  }
});

export const DELETE = authed(async ({ db, userId }, _req: Request, ctx: Ctx) =>
  (await deleteBet(db, userId, (await ctx.params).id)) ? json({ ok: true }) : notFound(),
);
