import { ensureUser } from '@blueline/db/queries/user';
import { getDb } from './db';

export const DEV_USER_ID = 'dev-user';

/**
 * The signed-in user's id, or null. Task 13 swaps the body for Auth.js `auth()`
 * without changing this signature. The dev bypass is ignored in production.
 */
export async function getUserId(): Promise<string | null> {
  if (process.env.AUTH_DEV_BYPASS === '1' && process.env.NODE_ENV !== 'production') {
    await ensureUser(await getDb(), {
      id: DEV_USER_ID,
      email: 'dev@blueline.local',
      name: 'Dev User',
    });
    return DEV_USER_ID;
  }
  return null;
}
