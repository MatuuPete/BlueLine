import { authed, json } from '../../../lib/api';
import { loadStatus } from '../../../lib/status-data';

export const dynamic = 'force-dynamic';

export const GET = authed(async ({ db }) => json(await loadStatus(db)));
