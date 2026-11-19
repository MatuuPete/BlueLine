import { betSummary, listBets, listBooks } from '@blueline/db/queries/bets';
import type { Metadata } from 'next';
import { getDb } from '../../../lib/db';
import { parseBetFilter } from '../../../lib/bets';
import { requireUserId } from '../../../lib/require-user';
import styles from '../_ui/page.module.css';
import { BetsView } from './BetsView';

export const metadata: Metadata = { title: 'Bets' };
export const dynamic = 'force-dynamic';

export default async function BetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requireUserId();
  const filter = parseBetFilter(await searchParams);
  const db = await getDb();
  const summary = await betSummary(db, userId, filter);
  // The list follows the summary's currency so ₱ and $ are never mixed on screen.
  const [bets, books] = await Promise.all([
    listBets(db, userId, { ...filter, currency: summary.currency }),
    listBooks(db, userId),
  ]);
  return (
    <div className={styles.page}>
      <BetsView
        bets={bets}
        summary={summary}
        filter={{ ...filter, currency: summary.currency }}
        books={books}
        year={String(new Date().getFullYear())}
      />
    </div>
  );
}
