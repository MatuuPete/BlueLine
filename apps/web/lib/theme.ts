// Theme cookie (spec §7): the server renders <html data-theme> from it, so there is no flash.
import { ONE_YEAR_SECONDS } from './intro';

export type Theme = 'light' | 'dark';
export const THEME_COOKIE = 'theme';

export function parseTheme(value: string | undefined | null): Theme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

/** document.cookie string. `null` clears it (back to the system preference). */
export function themeCookie(theme: Theme | null): string {
  return theme
    ? `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`
    : `${THEME_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Runs before first paint when there is no theme cookie: follows prefers-color-scheme.
 * Static text (no interpolation), so a CSP nonce or hash covers it.
 */
export const THEME_SCRIPT =
  "(function(){try{var d=document.documentElement;if(!d.dataset.theme){d.dataset.theme=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}}catch(e){}})();";

/** Client: apply a theme now and remember it. */
export function applyTheme(theme: Theme | null): Theme {
  const root = document.documentElement;
  const resolved: Theme =
    theme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.dataset.theme = resolved;
  document.cookie = themeCookie(theme);
  return resolved;
}

/** Client: the theme currently on <html>. */
export function currentTheme(): Theme {
  return parseTheme(document.documentElement.dataset.theme) ?? 'light';
}
