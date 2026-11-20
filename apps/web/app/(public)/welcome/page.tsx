import type { GameSummary } from '@blueline/contracts';
import { slateDate } from '@blueline/db/queries/board';
import { listGames } from '@blueline/db/queries/games';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getDb } from '../../../lib/db';
import { getUserId } from '../../../lib/session';
import { parseTheme, THEME_COOKIE } from '../../../lib/theme';
import { tipClock } from '../../../lib/time';
import { WelcomeScene } from './WelcomeScene';

export const metadata: Metadata = { title: 'Welcome' };
export const dynamic = 'force-dynamic';

function slateText(games: GameSummary[]): string | undefined {
  if (games.length === 0) return undefined;
  const parts = games
    .slice(0, 6)
    .map((g) => `${g.away.abbr} @ ${g.home.abbr} ${tipClock(g.tipAt)}`);
  const more = games.length > 6 ? ` · +${games.length - 6} more` : '';
  return `Today · ${parts.join(' · ')}${more}`;
}

/** Public intro (spec §7). Dark by default; the user's theme cookie wins. */
export default async function WelcomePage() {
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value) ?? 'dark';
  let slate: string | undefined;
  try {
    slate = slateText(await listGames(await getDb(), slateDate(new Date())));
  } catch {
    slate = undefined; // The intro never fails on data.
  }
  const signedIn = (await getUserId()) !== null;
  return <WelcomeScene initialTheme={theme} slate={slate} signedIn={signedIn} />;
}
