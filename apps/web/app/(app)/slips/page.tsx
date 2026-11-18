import { listSlips } from '@blueline/db/queries/user';
import type { Metadata } from 'next';
import { getDb } from '../../../lib/db';
import { requireUserId } from '../../../lib/require-user';
import styles from '../_ui/page.module.css';
import { SlipsView } from './SlipsView';

export const metadata: Metadata = { title: 'Slips' };
export const dynamic = 'force-dynamic';

export default async function SlipsPage() {
  const userId = await requireUserId();
  const slips = await listSlips(await getDb(), userId);
  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <div className={styles.head}>
        <div className={styles.titleBlock}>
          <h1 className={styles.h1}>Slips</h1>
          <p className={styles.sub}>
            {slips.length} saved {slips.length === 1 ? 'slip' : 'slips'} · legs are graded after the
            box scores land
          </p>
        </div>
      </div>
      <SlipsView slips={slips} />
    </div>
  );
}
