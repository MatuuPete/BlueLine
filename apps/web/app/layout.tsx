import '@blueline/ui/tokens.css';
import './globals.css';
import { fontVariables } from '@blueline/ui/fonts';
import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import { parseTheme, THEME_COOKIE, THEME_SCRIPT } from '../lib/theme';
import { ServiceWorker } from './_sw/ServiceWorker';

export const metadata: Metadata = {
  title: { default: 'BlueLine', template: '%s · BlueLine' },
  description: 'NBA player props, read against the line. Research only, not betting advice.',
  applicationName: 'BlueLine',
  appleWebApp: { capable: true, title: 'BlueLine', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Matches --chrome in each theme (manifest colors cannot read CSS variables).
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#012169' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0f10' },
  ],
};

/**
 * The pre-paint theme script. Task 13's CSP middleware passes its nonce in the
 * `x-nonce` request header; the script is static, so a hash also works.
 */
function ThemeScript({ nonce }: { nonce?: string }) {
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [jar, hdrs] = await Promise.all([cookies(), headers()]);
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const nonce = hdrs.get('x-nonce') ?? undefined;

  return (
    <html
      lang="en"
      className={fontVariables}
      data-theme={theme ?? undefined}
      // Without a cookie the script below sets data-theme before React hydrates.
      suppressHydrationWarning
    >
      <head>{theme ? null : <ThemeScript nonce={nonce} />}</head>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
