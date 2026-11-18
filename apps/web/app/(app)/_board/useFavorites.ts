'use client';

import type { Market, Side } from '@blueline/contracts';
import { useCallback, useState } from 'react';

export const favKey = (p: { playerId: string; market: Market; side: Side }) =>
  `${p.playerId}:${p.market}:${p.side}`;

/** Favorites with optimistic toggles (POST /api/favorites); reverts when the save fails. */
export function useFavorites(initial: readonly string[]) {
  const [keys, setKeys] = useState<Set<string>>(() => new Set(initial));
  const [error, setError] = useState('');

  const toggle = useCallback(async (p: { playerId: string; market: Market; side: Side }) => {
    const k = favKey(p);
    const flip = (s: Set<string>) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    };
    setKeys(flip);
    setError('');
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: p.playerId, market: p.market, side: p.side }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { favorited } = (await res.json()) as { favorited: boolean };
      setKeys((s) => {
        const next = new Set(s);
        if (favorited) next.add(k);
        else next.delete(k);
        return next;
      });
    } catch {
      setKeys(flip);
      setError('That favorite was not saved. Try again.');
    }
  }, []);

  return { has: (p: { playerId: string; market: Market; side: Side }) => keys.has(favKey(p)), toggle, error };
}
