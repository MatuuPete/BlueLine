import { Button } from '@blueline/ui';
import type { ConfiguredProviders } from '../../lib/auth-providers';
import styles from './signin.module.css';

type ServerAction = () => void | Promise<void>;

/**
 * One button per configured provider, or a clear "not configured" message when there are
 * none (the app can be deployed before any OAuth client exists).
 */
export function ProviderButtons({
  providers,
  google,
  github,
}: {
  providers: ConfiguredProviders;
  google: ServerAction;
  github: ServerAction;
}) {
  if (!providers.google && !providers.github) {
    return (
      <p role="status" className={styles.lead}>
        Sign-in isn&apos;t configured yet. See docs/DEPLOY.md to add Google or GitHub sign-in.
      </p>
    );
  }
  return (
    <>
      {providers.google ? (
        <form action={google}>
          <Button type="submit" size="lg" className={styles.button}>
            Continue with Google
          </Button>
        </form>
      ) : null}
      {providers.github ? (
        <form action={github}>
          <Button
            type="submit"
            size="lg"
            variant={providers.google ? 'secondary' : 'primary'}
            className={styles.button}
          >
            Continue with GitHub
          </Button>
        </form>
      ) : null}
    </>
  );
}
