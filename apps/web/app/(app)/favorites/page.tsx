import { and, eq, games, inArray, players, propMetrics } from '@blueline/db';
import { slateDate } from '@blueline/db/queries/board';
import { metricsToPropRow } from '@blueline/db/queries/detail';
import { listFavorites } from '@blueline/db/queries/user';
import { buttonClassName, EmptyState } from '@blueline/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '../../../lib/db';
import { requireUserId } from '../../../lib/require-user';
import { slateLabel } from '../../../lib/time';
import { PropList } from '../_board/PropList';
import { favKey } from '../_board/useFavorites';
import styles from '../_ui/page.module.css';
import { OffSlate } from './OffSlate';

export const metadata: Metadata = { title: 'Favorites' };
export const dynamic = 'force-dynamic';

/** Favorites follow a player/market/side: tonight's matching props, then the rest. */
export default async function FavoritesPage() {
  const userId = await requireUserId();
  const db = await getDb();
  const favorites = await listFavorites(db, userId);
  const today = slateDate(new Date());
  const keys = favorites.map(favKey);
  const ids = [...new Set(favorites.map((f) => f.playerId))];

  const [metricRows, names] = ids.length
    ? await Promise.all([
        db
          .select({ m: propMetrics })
          .from(propMetrics)
          .innerJoin(games, eq(games.id, propMetrics.gameId))
          .where(and(eq(games.date, today), inArray(propMetrics.playerId, ids))),
        db.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, ids)),
      ])
    : [[], []];

  const rows = metricRows
    .map(({ m }) => metricsToPropRow(m))
    .filter((r) => keys.includes(favKey(r)))
    .sort((a, b) => a.tipAt.localeCompare(b.tipAt) || a.playerName.localeCompare(b.playerName));
  const onSlate = new Set(rows.map(favKey));
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  const rest = favorites
    .filter((f) => !onSlate.has(favKey(f)))
    .map((f) => ({ ...f, name: nameOf.get(f.playerId) ?? f.playerId }));

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div className={styles.titleBlock}>
          <h1 className={styles.h1}>Favorites</h1>
          <p className={styles.sub}>
            {favorites.length} saved · {rows.length} on the {slateLabel(today)} slate
          </p>
        </div>
      </div>

      {favorites.length === 0 ? (
        <div className={styles.emptyCard}>
          <EmptyState
            title="No favorites yet"
            hint="Press the star on any prop to follow that player, market and side here."
            action={
              <Link href="/" className={buttonClassName('primary')}>
                Browse the board
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <section aria-labelledby="fav-tonight" className={styles.titleBlock}>
            <h2 id="fav-tonight" className={styles.h2}>
              On today&rsquo;s slate
            </h2>
            <PropList
              rows={rows}
              favoriteKeys={keys}
              label="Your favorite props on today's slate"
              empty={
                <EmptyState
                  title="None of your favorites play today"
                  hint="They show up here on days their team plays and lines are posted."
                  action={
                    <Link href="/games" className={buttonClassName('secondary')}>
                      See the schedule
                    </Link>
                  }
                />
              }
            />
          </section>
          {rest.length > 0 ? (
            <section aria-labelledby="fav-rest" className={styles.titleBlock}>
              <h2 id="fav-rest" className={styles.h2}>
                Not on today&rsquo;s slate
              </h2>
              <OffSlate favorites={rest} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
