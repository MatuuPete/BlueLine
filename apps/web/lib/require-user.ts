import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SEEN_INTRO_COOKIE } from './intro';
import { getUserId } from './session';

/**
 * R2: server pages need a user. Without one, a first-time visitor sees the intro
 * (/welcome, which leads to sign-in); a returning one goes straight to /signin.
 * Task 13's middleware redirects before this runs.
 */
export async function requireUserId(): Promise<string> {
  const userId = await getUserId();
  if (userId) return userId;
  const seen = (await cookies()).has(SEEN_INTRO_COOKIE);
  redirect(seen ? '/signin' : '/welcome');
}
