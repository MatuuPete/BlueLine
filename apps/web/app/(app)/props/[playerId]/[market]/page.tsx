import { PropDetailParamsSchema, type Side } from '@blueline/contracts';
import { slateDate } from '@blueline/db/queries/board';
import { getPropDetail } from '@blueline/db/queries/detail';
import { getSettings, listFavorites } from '@blueline/db/queries/user';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb } from '../../../../../lib/db';
import { requireUserId } from '../../../../../lib/require-user';
import { safeDecode } from '../../../../../lib/safe-decode';
import { favKey } from '../../../../../lib/fav-key';
import { PropDetailView } from './PropDetailView';

export const metadata: Metadata = { title: 'Prop detail' };
export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** /props/[playerId]/[market]?gameId=…&side=over|under (spec §6b, §7 prop detail). */
export default async function PropDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string; market: string }>;
  searchParams: Promise<Search>;
}) {
  const userId = await requireUserId();
  const [{ playerId, market }, search] = await Promise.all([params, searchParams]);
  const parsed = PropDetailParamsSchema.safeParse({
    playerId: safeDecode(playerId),
    market: safeDecode(market),
    gameId: one(search.gameId) || undefined,
  });
  if (!parsed.success) notFound();

  const db = await getDb();
  const [detail, favorites, settings] = await Promise.all([
    getPropDetail(db, parsed.data),
    listFavorites(db, userId),
    getSettings(db, userId),
  ]);
  if (!detail) notFound();

  const sideParam = one(search.side);
  const side: Side =
    sideParam === 'under' || sideParam === 'over'
      ? sideParam
      : (detail.metrics[0]?.side ?? 'over');

  return (
    <PropDetailView
      key={`${detail.player.id}:${detail.market}:${detail.game.id}`}
      detail={detail}
      initialSide={side}
      favoriteKeys={favorites.map(favKey)}
      books={settings.books}
      oddsFormat={settings.oddsFormat}
      today={slateDate(new Date())}
    />
  );
}
