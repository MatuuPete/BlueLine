// Auth.js v5 for route handlers, server components and server actions (Node runtime).
// Google + GitHub OAuth, JWT sessions, no database adapter. Spec §8.
import { users } from '@blueline/db';
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { canSignIn, normalizeEmail, userIdForEmail } from './lib/auth-rules';
import { getDb } from './lib/db';

export interface SignInArgs {
  user: { email?: string | null; name?: string | null };
  account?: { provider: string } | null;
  profile?: Record<string, unknown> | null;
}

/**
 * Only allowlisted, verified emails get in (anyone else sees AccessDenied on /signin).
 * On success the users row is created, or its name refreshed.
 */
export async function signInCallback({ user, account, profile }: SignInArgs): Promise<boolean> {
  const provider = account?.provider ?? '';
  if (!canSignIn({ provider, email: user.email, profile }, process.env.ALLOWED_EMAILS)) {
    return false;
  }
  const email = normalizeEmail(user.email!);
  const id = userIdForEmail(email);
  const name = user.name?.trim() || null;
  const db = await getDb();
  const insert = db.insert(users).values({ id, email, name });
  await (name
    ? insert.onConflictDoUpdate({ target: users.id, set: { name } })
    : insert.onConflictDoNothing());
  return true;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    signIn: ({ user, account, profile }) =>
      signInCallback({ user, account, profile: profile as Record<string, unknown> | undefined }),
  },
});
