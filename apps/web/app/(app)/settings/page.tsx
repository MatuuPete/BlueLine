import { getSettings } from '@blueline/db/queries/user';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getDb } from '../../../lib/db';
import { requireUserId } from '../../../lib/require-user';
import { parseTheme, THEME_COOKIE } from '../../../lib/theme';
import styles from '../_ui/page.module.css';
import { SignOutButton } from '../../_auth/SignOutButton';
import { SettingsForm } from './SettingsForm';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const userId = await requireUserId();
  const [saved, jar] = await Promise.all([getSettings(await getDb(), userId), cookies()]);
  // The cookie is what this browser renders; show that when it is set.
  const settings = { ...saved, theme: parseTheme(jar.get(THEME_COOKIE)?.value) ?? saved.theme };
  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <div className={styles.titleBlock}>
        <h1 className={styles.h1}>Settings</h1>
        <p className={styles.sub}>Theme, odds format, your sportsbooks and the intro.</p>
      </div>
      <SettingsForm initial={settings} />
      <section aria-labelledby="account-heading">
        <h2 id="account-heading" className={styles.sub}>
          Account
        </h2>
        <SignOutButton />
      </section>
    </div>
  );
}
