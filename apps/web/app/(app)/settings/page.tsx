import { getSettings } from '@blueline/db/queries/user';
import type { Metadata } from 'next';
import { getDb } from '../../../lib/db';
import { requireUserId } from '../../../lib/require-user';
import styles from '../_ui/page.module.css';
import { SettingsForm } from './SettingsForm';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const userId = await requireUserId();
  const settings = await getSettings(await getDb(), userId);
  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <div className={styles.titleBlock}>
        <h1 className={styles.h1}>Settings</h1>
        <p className={styles.sub}>Theme, odds format, your sportsbooks and the intro.</p>
      </div>
      <SettingsForm initial={settings} />
    </div>
  );
}
