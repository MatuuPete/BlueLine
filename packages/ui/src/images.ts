// Player headshots and team logos, hot-linked from ESPN's image CDN through its resizer so a
// 36px avatar downloads ~8 KB instead of the ~200 KB original. Pure and browser-safe.
// The origin must stay in sync with img-src in apps/web/lib/security.ts.

export const IMAGE_ORIGIN = 'https://a.espncdn.com';

/** Request twice the rendered size so images stay sharp on high-density screens. */
const px = (size: number) => Math.max(1, Math.round(size * 2));

/**
 * Square, cropped headshot for a player id of the form `p<espnId>` (apps/worker/src/ids.ts).
 * Null when the id carries no ESPN number; the caller then shows a monogram.
 */
export function headshotUrl(playerId: string, size: number): string | null {
  const m = /^p(\d+)$/.exec(playerId);
  if (!m) return null;
  const s = px(size);
  return `${IMAGE_ORIGIN}/combiner/i?img=/i/headshots/nba/players/full/${m[1]}.png&w=${s}&h=${s}&scale=crop`;
}

/** Team logo from the ESPN abbreviation we store (GS, NY, UTAH, WSH...). */
export function teamLogoUrl(abbr: string, size: number): string | null {
  if (!/^[A-Za-z]{2,4}$/.test(abbr)) return null;
  const s = px(size);
  return `${IMAGE_ORIGIN}/combiner/i?img=/i/teamlogos/nba/500/${abbr.toLowerCase()}.png&w=${s}&h=${s}`;
}
