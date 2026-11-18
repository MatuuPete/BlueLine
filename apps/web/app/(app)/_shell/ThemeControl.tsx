'use client';

import { ThemeToggle } from '@blueline/ui';
import { useEffect, useState } from 'react';
import { chooseTheme } from '../../../lib/settings-client';
import { currentTheme, type Theme } from '../../../lib/theme';

/** Sun/moon in the top bar: writes the theme cookie and, signed in, userSettings.theme. */
export function ThemeControl({
  initialTheme,
  signedIn,
  className,
}: {
  initialTheme: Theme | null;
  signedIn: boolean;
  className?: string;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme ?? 'light');
  useEffect(() => {
    // No cookie: the pre-paint script chose from prefers-color-scheme; show its choice.
    if (!initialTheme) setTheme(currentTheme());
  }, [initialTheme]);
  return (
    <ThemeToggle
      theme={theme}
      className={className}
      onToggle={() => setTheme(chooseTheme(theme === 'dark' ? 'light' : 'dark', signedIn))}
    />
  );
}
