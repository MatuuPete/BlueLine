import { ensureUser } from '@blueline/db/queries/user';
import { getDb } from './db';
import { isDevBypass } from './dev-bypass';

export const DEV_USER_ID = 'dev-user';

/**
 * The signed-in user's id (Auth.js `session.user.id`, see auth.config.ts), or null.
 * With the dev bypass it is always `dev-user`.
 *
 * Call this in every server action and every server component or route that reads or writes
 * user data, and treat null as "not signed in". proxy.ts is only a first gate: it does not
 * re-check server actions posted to public pages (e.g. /signin, /welcome), so the action
 * itself must authorize.
 */
export async function getUserId(): Promise<string | null> {
  if (isDevBypass()) {
    await ensureUser(await getDb(), {
      id: DEV_USER_ID,
      email: 'dev@blueline.local',
      name: 'Dev User',
    });
    return DEV_USER_ID;
  }
  // Imported lazily so the bypass path never loads Auth.js.
  const { auth } = await import('../auth');
  const session = await auth();
  const id = session?.user?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
