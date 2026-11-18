import { Button, Disclaimer, Logo } from '@blueline/ui';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { signIn } from '../../auth';
import { getUserId } from '../../lib/session';
import styles from './signin.module.css';

export const metadata: Metadata = { title: 'Sign in · BlueLine' };

const ERRORS: Record<string, string> = {
  AccessDenied: "This email isn't on the BlueLine allowlist.",
};
const GENERIC_ERROR = 'Sign-in failed. Please try again.';

/** Only same-site relative paths; anything else (absolute, protocol-relative) goes home. */
function safeCallback(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return '/';
  if (v === '/signin' || v.startsWith('/signin?') || v.startsWith('/api/')) return '/';
  return v;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const redirectTo = safeCallback(params.callbackUrl);
  if (await getUserId()) redirect(redirectTo);

  const code = Array.isArray(params.error) ? params.error[0] : params.error;
  const error = code ? (ERRORS[code] ?? GENERIC_ERROR) : null;

  async function google() {
    'use server';
    await signIn('google', { redirectTo });
  }
  async function github() {
    'use server';
    await signIn('github', { redirectTo });
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="signin-title">
        <Logo size={34} wordmark />
        <h1 id="signin-title" className={styles.title}>
          Sign in
        </h1>
        <p className={styles.lead}>BlueLine is private. Sign in with an approved account.</p>
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        <form action={google}>
          <Button type="submit" size="lg" className={styles.button}>
            Continue with Google
          </Button>
        </form>
        <form action={github}>
          <Button type="submit" size="lg" variant="secondary" className={styles.button}>
            Continue with GitHub
          </Button>
        </form>
      </section>
      <Disclaimer className={styles.disclaimer} />
    </main>
  );
}
