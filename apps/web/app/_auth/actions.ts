'use server';

import { signOut } from '../../auth';

/** Ends the Auth.js session (clears the JWT cookie) and returns to the sign-in page. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/signin' });
}
