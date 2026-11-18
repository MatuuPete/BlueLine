// next/font loaders (spec §7 type). Import from "@blueline/ui/fonts" in apps/web only
// (next/font must be compiled by Next), and put `fontVariables` on <html> so the
// --font-display / --font-ui / --font-mono variables reach :root and every component.
import { Archivo, Big_Shoulders, IBM_Plex_Mono } from 'next/font/google';

/** Display: Big Shoulders 700–900, uppercase titles, player names, big hit rates. */
export const fontDisplay = Big_Shoulders({
  subsets: ['latin'],
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-display',
});

/** UI: Archivo 400–700, all interface text. */
export const fontUi = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ui',
});

/** Data: IBM Plex Mono 500–600, lines, odds, fractions. */
export const fontMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
  variable: '--font-mono',
});

/** All three variable classes, for <html className={fontVariables}>. */
export const fontVariables = [fontDisplay.variable, fontUi.variable, fontMono.variable].join(' ');
