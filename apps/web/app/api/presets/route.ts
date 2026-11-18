import { SavePresetInputSchema } from '@blueline/contracts';
import { deletePreset, listPresets, savePreset } from '@blueline/db/queries/user';
import { authed, json, notFound, parseBody, parseInput, uuidParser } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export const GET = authed(async ({ db, userId }) => json(await listPresets(db, userId)));

/** Saves a preset; an existing name is overwritten. */
export const POST = authed(async ({ db, userId }, req: Request) => {
  const parsed = await parseBody(req, SavePresetInputSchema);
  if ('res' in parsed) return parsed.res;
  return json(await savePreset(db, userId, parsed.data), 201);
});

/** DELETE /api/presets?id=<uuid>. Another user's preset and a missing one both answer 404. */
export const DELETE = authed(async ({ db, userId }, req: Request) => {
  const parsed = parseInput(uuidParser, new URL(req.url).searchParams.get('id'));
  if ('res' in parsed) return parsed.res;
  return (await deletePreset(db, userId, parsed.data)) ? json({ ok: true }) : notFound();
});
