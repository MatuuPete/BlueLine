'use client';

import { Disclaimer, IntroScene } from '@blueline/ui';
import { useState } from 'react';
import { chooseTheme } from '../../../lib/settings-client';
import type { Theme } from '../../../lib/theme';
import styles from './welcome.module.css';

export function WelcomeScene({
  initialTheme,
  slate,
  signedIn,
}: {
  initialTheme: Theme;
  slate?: string;
  signedIn: boolean;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [paused, setPaused] = useState(false);
  return (
    <>
      {/* R18: IntroScene renders its own <main>; nothing here wraps it in another. */}
      <IntroScene
        theme={theme}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        onToggleTheme={() => setTheme(chooseTheme(theme === 'dark' ? 'light' : 'dark', signedIn))}
        // A route handler sets the seen_intro cookie; a plain anchor so it is never prefetched.
        enterHref="/welcome/enter"
        slate={slate}
      />
      <div className={styles.legal} data-theme={theme}>
        <Disclaimer />
      </div>
    </>
  );
}
