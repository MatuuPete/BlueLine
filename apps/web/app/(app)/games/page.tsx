import { slateDate } from '@blueline/db/queries/board';
import { listGames } from '@blueline/db/queries/games';
import { buttonClassName, EmptyState } from '@blueline/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '../../../lib/db';
import { requireUserId } from '../../../lib/require-user';
import { gameLine, gameStatus } from '../../../lib/game-format';
import { addDaysYmd, slateLabel } from '../../../lib/time';
import styles from '../_ui/page.module.css';

export const metadata: Metadata = { title: 'Games' };
export const dynamic = 'force-dynamic';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUserId();
  const today = slateDate(new Date());
  const raw = (await searchParams).date;
  const date = typeof raw === 'string' && YMD.test(raw) ? raw : today;
  const games = await listGames(await getDb(), date);
  const dayLink = (d: string) => (d === today ? '/games' : `/games?date=${d}`);

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div className={styles.titleBlock}>
          <h1 className={styles.h1}>Games</h1>
          <p className={styles.sub}>
            {slateLabel(date)} · {games.length} {games.length === 1 ? 'game' : 'games'}
          </p>
        </div>
        <nav aria-label="Change day" className={styles.row}>
          <Link href={dayLink(addDaysYmd(date, -1))} className={buttonClassName('secondary')}>
            Previous day
          </Link>
          {date !== today ? (
            <Link href="/games" className={buttonClassName('ghost')}>
              Today
            </Link>
          ) : null}
          <Link href={dayLink(addDaysYmd(date, 1))} className={buttonClassName('secondary')}>
            Next day
          </Link>
        </nav>
      </div>

      {games.length === 0 ? (
        <div className={styles.emptyCard}>
          <EmptyState
            title="No games on this day"
            hint="Pick another day, or check the data status if games are missing."
            action={
              <Link href={dayLink(addDaysYmd(date, 1))} className={buttonClassName('primary')}>
                Show the next day
              </Link>
            }
          />
        </div>
      ) : (
        <ul className={styles.grid}>
          {games.map((g) => (
            <li key={g.id}>
              <Link href={`/games/${encodeURIComponent(g.id)}`} className={`${styles.card} ${styles.linkCard}`}>
                <span className={`${styles.row} ${styles.spread}`}>
                  <span className={styles.matchup}>
                    {g.away.abbr} @ {g.home.abbr}
                  </span>
                  <span className={styles.muted}>{gameStatus(g)}</span>
                </span>
                <span className={styles.muted}>
                  {g.away.name} at {g.home.name}
                </span>
                <span className={`${styles.row} ${styles.spread}`}>
                  <span className={styles.mono}>{gameLine(g) || 'No game line yet'}</span>
                  <span className={styles.pill}>
                    {g.propCount} {g.propCount === 1 ? 'prop' : 'props'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
