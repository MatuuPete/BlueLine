import { deleteSlip, getSlip } from '@blueline/db/queries/user';
import { authed, json, notFound } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// Another user's slip and a missing slip both answer 404.
export const GET = authed(async ({ db, userId }, _req: Request, ctx: Ctx) => {
  const slip = await getSlip(db, userId, (await ctx.params).id);
  return slip ? json(slip) : notFound();
});

export const DELETE = authed(async ({ db, userId }, _req: Request, ctx: Ctx) =>
  (await deleteSlip(db, userId, (await ctx.params).id)) ? json({ ok: true }) : notFound(),
);
