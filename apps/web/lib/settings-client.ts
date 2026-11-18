'use client';
// Client helpers for /api/settings. The PUT body is the whole settings object, so read first.
import type { UserSettings } from '@blueline/contracts';
import { applyTheme, type Theme } from './theme';

async function readSettings(): Promise<UserSettings | null> {
  const res = await fetch('/api/settings', { cache: 'no-store' });
  return res.ok ? ((await res.json()) as UserSettings) : null;
}

/** Merge `patch` into the saved settings. Returns the saved settings, or null on failure. */
export async function patchSettings(patch: Partial<UserSettings>): Promise<UserSettings | null> {
  try {
    const current = await readSettings();
    if (!current) return null;
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...current, ...patch }),
    });
    return res.ok ? ((await res.json()) as UserSettings) : null;
  } catch {
    return null;
  }
}

/**
 * The sun/moon toggle and the settings page: apply now, write the cookie (so the server
 * renders it next time, no flash) and, when signed in, save userSettings.theme.
 */
export function chooseTheme(theme: Theme | null, signedIn: boolean): Theme {
  const resolved = applyTheme(theme);
  if (signedIn) void patchSettings({ theme: theme ?? 'system' });
  return resolved;
}
