import { slateDate, queryBoard } from '@blueline/db/queries/board';
import { listGames } from '@blueline/db/queries/games';
import { getSettings, listFavorites, listPresets } from '@blueline/db/queries/user';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { filterFromRecord, type SearchParamsRecord } from '../../lib/board-params';
import { getDb } from '../../lib/db';
import { SEEN_INTRO_COOKIE, shouldShowIntro } from '../../lib/intro';
import { requireUserId } from '../../lib/require-user';
import { addDaysYmd } from '../../lib/time';
import { favKey } from '../../lib/fav-key';
import { BoardView } from './_board/BoardView';

export const metadata: Metadata = { title: 'Prop board' };
export const dynamic = 'force-dynamic';

/** The prop board (spec §6a/§7). Server-rendered from queryBoard; filters live in the URL. */
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const userId = await requireUserId();
  const db = await getDb();
  const [jar, settings] = await Promise.all([cookies(), getSettings(db, userId)]);
  if (shouldShowIntro({ seenIntro: jar.has(SEEN_INTRO_COOKIE), skipIntro: settings.skipIntro })) {
    redirect('/welcome');
  }

  // R11: unknown keys stripped, invalid input → default. R31: no date = today's slate (ET).
  const today = slateDate(new Date());
  const urlFilter = filterFromRecord(await searchParams);
  const filter = { ...urlFilter, date: urlFilter.date ?? today };

  const [board, games, favorites, presets] = await Promise.all([
    queryBoard(db, filter),
    listGames(db, filter.date),
    listFavorites(db, userId),
    listPresets(db, userId),
  ]);

  return (
    <Suspense fallback={null}>
      <BoardView
        board={board}
        games={games}
        favoriteKeys={favorites.map(favKey)}
        presets={presets}
        date={filter.date}
        today={today}
        tomorrow={addDaysYmd(today, 1)}
      />
    </Suspense>
  );
}
