import { UserSettingsSchema } from '@blueline/contracts';
import { getSettings, saveSettings } from '@blueline/db/queries/user';
import { authed, json, parseBody } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export const GET = authed(async ({ db, userId }) => json(await getSettings(db, userId)));

export const PUT = authed(async ({ db, userId }, req: Request) => {
  const parsed = await parseBody(req, UserSettingsSchema);
  if ('res' in parsed) return parsed.res;
  return json(await saveSettings(db, userId, parsed.data));
});
