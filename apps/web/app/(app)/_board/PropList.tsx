'use client';

import type { PropRow, Window } from '@blueline/contracts';
import type { ReactNode } from 'react';
import { BoardRows } from './BoardRows';
import { useFavorites } from './useFavorites';

/** A read-only list of board rows with working favorite and slip buttons. */
export function PropList({
  rows,
  favoriteKeys,
  label,
  empty,
  activeWindow = 'l10',
}: {
  rows: PropRow[];
  favoriteKeys: string[];
  label: string;
  empty?: ReactNode;
  activeWindow?: Window;
}) {
  const favs = useFavorites(favoriteKeys);
  return (
    <>
      {favs.error ? <p role="alert">{favs.error}</p> : null}
      <BoardRows
        rows={rows}
        activeWindow={activeWindow}
        isFavorite={favs.has}
        onToggleFavorite={(r) => void favs.toggle(r)}
        label={label}
        empty={empty}
      />
    </>
  );
}
