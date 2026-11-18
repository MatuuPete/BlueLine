import { getStatus } from '@blueline/db/queries/status';
import { authed, json } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export const GET = authed(async ({ db }) => {
  const limit = Number(process.env.ODDS_MONTHLY_BUDGET);
  return json(
    await getStatus(db, {
      provider: process.env.ODDS_PROVIDER ?? 'fixtures',
      limit: Number.isFinite(limit) && limit > 0 ? limit : 500,
    }),
  );
});
