'use client';

import type { CSSProperties } from 'react';
import { cx } from '../format';
import { Logo } from './Logo';
import type { LinkComponent } from './propParts';
import { ThemeToggle } from './ThemeToggle';
import styles from './IntroScene.module.css';

export interface IntroSceneProps {
  /** The intro is dark by default; the app passes the user's theme. */
  theme: 'light' | 'dark';
  paused: boolean;
  onTogglePause: () => void;
  /** Shows the sun/moon control when given. */
  onToggleTheme?: () => void;
  /** Where "Enter the board" goes. */
  enterHref?: string;
  /** Tonight's slate in mono at the bottom, e.g. "Tonight · BOS @ NYK 7:30 · …". */
  slate?: string;
  linkComponent?: LinkComponent;
  className?: string;
}

interface IntroBar {
  up: number;
  down: number;
  delay: string;
  dur: string;
  phase: string;
}

/** Same deterministic wave as the canvas, so server and client render identical bars. */
function buildBars(): IntroBar[] {
  const bars: IntroBar[] = [];
  for (let i = 0; i < 72; i++) {
    const wave = Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.37));
    const size = Math.round(18 + wave * 96);
    const up = Math.sin(i * 2.3 + 1) > -0.3;
    bars.push({
      up: up ? size : 0,
      down: up ? 0 : Math.round(size * 0.7),
      delay: `${(0.15 + Math.abs(i - 36) * 0.018).toFixed(2)}s`,
      dur: `${(3.2 + (i % 5) * 0.55).toFixed(2)}s`,
      phase: `${(-(i * 0.21)).toFixed(2)}s`,
    });
  }
  // Doubled so the -50% stream loop is seamless.
  return [...bars, ...bars];
}

const BARS = buildBars();

/**
 * The /welcome scene (CSS-only motion): the court draws itself in, rings ripple out of
 * the center circle, game-log bars grow out of a glowing line and stream like a ticker,
 * a pulse runs along the line, and a highlight sweeps the outlined "LINE".
 * The pause button stops every loop; reduced-motion users get a still frame.
 */
export function IntroScene({
  theme,
  paused,
  onTogglePause,
  onToggleTheme,
  enterHref = '/',
  slate,
  linkComponent: Link = 'a',
  className,
}: IntroSceneProps) {
  return (
    <div
      className={cx(styles.scene, className)}
      data-theme={theme}
      data-paused={paused ? 'true' : 'false'}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className={styles.courtSvg}
      >
        <circle className={cx(styles.ring, styles.anim)} cx="720" cy="450" r="120" />
        <circle
          className={cx(styles.ring, styles.anim)}
          cx="720"
          cy="450"
          r="120"
          style={{ animationDelay: '1.6s' }}
        />
        <circle
          className={cx(styles.ring, styles.anim)}
          cx="720"
          cy="450"
          r="120"
          style={{ animationDelay: '3.2s' }}
        />
        <g className={styles.court}>
          <line x1="720" y1="0" x2="720" y2="900" />
          <circle cx="720" cy="450" r="170" />
          <circle cx="720" cy="450" r="56" />
          <rect x="-1" y="330" width="230" height="240" />
          <circle cx="229" cy="450" r="90" />
          <path d="M0 120 H170 A330 330 0 0 1 170 780 H0" />
          <rect x="1211" y="330" width="230" height="240" />
          <circle cx="1211" cy="450" r="90" />
          <path d="M1440 120 H1270 A330 330 0 0 0 1270 780 H1440" />
          <rect x="24" y="24" width="1392" height="852" rx="2" />
        </g>
      </svg>

      <header className={styles.header}>
        <Logo size={34} label="BlueLine" />
        {onToggleTheme ? (
          <ThemeToggle theme={theme} onToggle={onToggleTheme} variant="intro" />
        ) : null}
      </header>

      <main className={styles.main}>
        <h1 className={cx(styles.word, styles.rise)}>
          <span className={styles.solid}>Blue</span>
          <span className={cx(styles.outline, styles.shimmer, styles.anim)}>Line</span>
        </h1>

        <div aria-hidden="true" className={styles.lineBox}>
          <div className={styles.mask}>
            <div className={cx(styles.stream, styles.anim)}>
              {BARS.map((bar, i) => {
                const grow: CSSProperties = { animationDelay: bar.delay };
                const breath: CSSProperties = {
                  animationDuration: bar.dur,
                  animationDelay: bar.phase,
                };
                return (
                  <div key={i} className={styles.col} data-intro-bar="">
                    <div className={styles.upHalf}>
                      <div
                        className={cx(styles.grow, styles.growUp)}
                        style={{ ...grow, height: `${bar.up}px` }}
                      >
                        <div className={cx(styles.breath, styles.barUp)} style={breath} />
                      </div>
                    </div>
                    <div className={styles.downHalf}>
                      <div
                        className={cx(styles.grow, styles.growDown)}
                        style={{ ...grow, height: `${bar.down}px` }}
                      >
                        <div className={cx(styles.breath, styles.barDown)} style={breath} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className={styles.rule} />
          <div className={cx(styles.pulse, styles.anim)} />
        </div>

        <div className={cx(styles.below, styles.rise)}>
          <p className={styles.tagline}>NBA player props, read against the line.</p>
          <Link href={enterHref} className={styles.cta}>
            Enter the board
            <svg
              className={styles.arrow}
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12h15M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </main>

      <footer className={styles.footer}>
        {slate ? <p className={styles.slate}>{slate}</p> : <span />}
        <button
          type="button"
          aria-label={paused ? 'Play motion' : 'Pause motion'}
          className={styles.pause}
          onClick={onTogglePause}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d={paused ? 'M4 2.5v11l9-5.5z' : 'M4 2.5h3v11H4zM9 2.5h3v11H9z'}
              fill="currentColor"
            />
          </svg>
        </button>
      </footer>
    </div>
  );
}
