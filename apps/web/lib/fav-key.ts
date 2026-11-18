import type { Market, Side } from '@blueline/contracts';

/** Favorites follow a player/market/side across games. */
export const favKey = (p: { playerId: string; market: Market; side: Side }): string =>
  `${p.playerId}:${p.market}:${p.side}`;
