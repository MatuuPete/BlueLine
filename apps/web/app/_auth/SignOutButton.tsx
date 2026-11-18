'use client';

import { Button, type ButtonProps } from '@blueline/ui';
import { clearClientCaches } from './clear-client-caches';
import { signOutAction } from './actions';

export type SignOutButtonProps = Pick<ButtonProps, 'variant' | 'size' | 'className'>;

/**
 * "Sign out": clears the PWA caches (Cache Storage + a SIGN_OUT message to the service
 * worker) before ending the session, so no signed-in page stays readable offline.
 * Mount it in Settings: `import { SignOutButton } from '@/app/_auth/SignOutButton'`.
 */
export function SignOutButton({ variant = 'secondary', size, className }: SignOutButtonProps) {
  async function signOut() {
    await clearClientCaches({
      caches: 'caches' in window ? window.caches : undefined,
      serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    });
    await signOutAction();
  }
  return (
    <form action={signOut}>
      <Button type="submit" variant={variant} size={size} className={className}>
        Sign out
      </Button>
    </form>
  );
}
