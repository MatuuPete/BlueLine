import { PropDetailParamsSchema } from '@blueline/contracts';
import { getPropDetail } from '@blueline/db/queries/detail';
import { authed, json, notFound, parseInput } from '../../../../../lib/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ playerId: string; market: string }> };

export const GET = authed(async ({ db }, req: Request, ctx: Ctx) => {
  const { playerId, market } = await ctx.params;
  const parsed = parseInput(PropDetailParamsSchema, {
    playerId,
    market,
    gameId: new URL(req.url).searchParams.get('gameId') ?? undefined,
  });
  if ('res' in parsed) return parsed.res;
  const detail = await getPropDetail(db, parsed.data);
  return detail ? json(detail) : notFound();
});
