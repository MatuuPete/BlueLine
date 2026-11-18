import { DEFAULT_BOARD_FILTER } from '@blueline/contracts';
import { queryBoard, slateDate } from '@blueline/db/queries/board';
import { getGameSummary } from '@blueline/db/queries/games';
import { listFavorites } from '@blueline/db/queries/user';
import { buttonClassName, EmptyState } from '@blueline/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '../../../../lib/db';
import { gameLine, gameStatus } from '../../../../lib/game-format';
import { requireUserId } from '../../../../lib/require-user';
import { slateLabel } from '../../../../lib/time';
import { PropList } from '../../_board/PropList';
import { favKey } from '../../_board/useFavorites';
import styles from '../../_ui/page.module.css';

export const metadata: Metadata = { title: 'Game' };
export const dynamic = 'force-dynamic';

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const id = decodeURIComponent((await params).id);
  if (id.length === 0 || id.length > 64) notFound();
  const db = await getDb();
  const game = await getGameSummary(db, id);
  if (!game) notFound();
  const [board, favorites] = await Promise.all([
    queryBoard(db, { ...DEFAULT_BOARD_FILTER, date: game.date, games: [game.id] }, { pageSize: 200 }),
    listFavorites(db, userId),
  ]);
  const line = gameLine(game);

  return (
    <div className={styles.page}>
      <nav aria-label="Breadcrumb" className={styles.muted}>
        <Link href="/games">Games</Link> <span aria-hidden="true">/</span>{' '}
        <span aria-current="page">
          {game.away.abbr} @ {game.home.abbr}
        </span>
      </nav>
      <div className={styles.head}>
        <div className={styles.titleBlock}>
          <h1 className={styles.h1}>
            {game.away.abbr} @ {game.home.abbr}
          </h1>
          <p className={styles.sub}>
            {game.away.name} at {game.home.name} · {slateLabel(game.date)} · {gameStatus(game)}
            {line ? ` · ${line}` : ''}
          </p>
        </div>
        <Link
          href={`/?games=${encodeURIComponent(game.id)}${game.date !== slateDate(new Date()) ? `&date=${game.date}` : ''}`}
          className={buttonClassName('secondary')}
        >
          Filter the board to this game
        </Link>
      </div>
      <PropList
        rows={board.rows}
        favoriteKeys={favorites.map(favKey)}
        label={`Player props for ${game.away.abbr} at ${game.home.abbr}`}
        empty={
          <EmptyState
            title="No props for this game yet"
            hint="Lines appear after the odds and precompute jobs run."
            action={
              <Link href="/games" className={buttonClassName('primary')}>
                Back to games
              </Link>
            }
          />
        }
      />
      {board.total > board.rows.length ? (
        <p className={styles.muted}>
          Showing {board.rows.length} of {board.total}. Filter the board to this game to see the rest.
        </p>
      ) : null}
    </div>
  );
}
