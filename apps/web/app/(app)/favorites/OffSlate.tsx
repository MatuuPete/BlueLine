'use client';

import { MARKET_LABELS, type FavoriteDTO } from '@blueline/contracts';
import { Button } from '@blueline/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from '../_ui/page.module.css';
import own from './favorites.module.css';

/** Favorites without a prop today: open the player's next game or remove them. */
export function OffSlate({ favorites }: { favorites: Array<FavoriteDTO & { name: string }> }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const remove = async (f: FavoriteDTO) => {
    setError('');
    const res = await fetch('/api/favorites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: f.playerId, market: f.market, side: f.side }),
    }).catch(() => null);
    if (!res?.ok) setError('That favorite was not removed. Try again.');
    else router.refresh();
  };
  return (
    <>
      {error ? <p role="alert">{error}</p> : null}
      <ul className={own.list}>
        {favorites.map((f) => (
          <li key={`${f.playerId}:${f.market}:${f.side}`} className={own.item}>
            <Link
              href={`/props/${encodeURIComponent(f.playerId)}/${encodeURIComponent(f.market)}?side=${f.side}`}
              className={own.name}
            >
              {f.name}
            </Link>
            <span className={styles.muted}>
              {f.side === 'over' ? 'Over' : 'Under'} · {MARKET_LABELS[f.market]}
            </span>
            <Button
              variant="ghost"
              onClick={() => void remove(f)}
              aria-label={`Remove ${f.name} ${f.market} ${f.side} from favorites`}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
