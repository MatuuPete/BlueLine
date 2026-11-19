import { Disclaimer, Logo } from '@blueline/ui';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { signIn } from '../../auth';
import { configuredProviders } from '../../lib/auth-providers';
import { safeCallback } from '../../lib/safe-callback';
import { getUserId } from '../../lib/session';
import { signInErrorMessage } from '../../lib/signin-errors';
import { ProviderButtons } from './ProviderButtons';
import styles from './signin.module.css';

export const metadata: Metadata = { title: 'Sign in · BlueLine' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const redirectTo = safeCallback(params.callbackUrl);
  if (await getUserId()) redirect(redirectTo);

  const error = signInErrorMessage(params.error);
  const providers = configuredProviders();

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
        <ProviderButtons providers={providers} google={google} github={github} />
      </section>
      <Disclaimer className={styles.disclaimer} />
    </main>
  );
}
