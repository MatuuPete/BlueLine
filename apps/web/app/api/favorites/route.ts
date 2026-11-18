import { FavoriteInputSchema } from '@blueline/contracts';
import { listFavorites, toggleFavorite } from '@blueline/db/queries/user';
import { authed, json, parseBody } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export const GET = authed(async ({ db, userId }) => json(await listFavorites(db, userId)));

/** Toggles the favorite: `{ favorited: boolean }` says which way it went. */
export const POST = authed(async ({ db, userId }, req: Request) => {
  const parsed = await parseBody(req, FavoriteInputSchema);
  if ('res' in parsed) return parsed.res;
  return json(await toggleFavorite(db, userId, parsed.data));
});
