import { max, propMetrics } from '@blueline/db';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { getDb } from '../../lib/db';
import { requireUserId } from '../../lib/require-user';
import { parseTheme, THEME_COOKIE } from '../../lib/theme';
import { tipTime } from '../../lib/time';
import { AppShell } from './_shell/AppShell';

export const dynamic = 'force-dynamic';

/** "Lines updated 5:42 PM PHT": the newest precompute run, or nothing. */
async function updatedText(): Promise<string | null> {
  try {
    const db = await getDb();
    const [row] = await db.select({ at: max(propMetrics.computedAt) }).from(propMetrics);
    return row?.at ? `Lines updated ${tipTime(new Date(row.at).toISOString())}` : null;
  } catch {
    return null;
  }
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUserId();
  const [jar, updated] = await Promise.all([cookies(), updatedText()]);
  return (
    <AppShell theme={parseTheme(jar.get(THEME_COOKIE)?.value)} signedIn updatedText={updated}>
      {children}
    </AppShell>
  );
}
