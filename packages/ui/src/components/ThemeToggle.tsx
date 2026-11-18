'use client';

import { cx } from '../format';
import styles from './ThemeToggle.module.css';

export interface ThemeToggleProps {
  theme: 'light' | 'dark';
  onToggle: () => void;
  /** `chrome`: the navy top bar. `intro`: the round control on /welcome. */
  variant?: 'chrome' | 'intro';
  className?: string;
}

/** Sun/moon button. Shows the sun in dark mode (go light) and the moon in light mode. */
export function ThemeToggle({ theme, onToggle, variant = 'chrome', className }: ThemeToggleProps) {
  const dark = theme === 'dark';
  const icon = variant === 'intro' ? 20 : 18;
  return (
    <button
      type="button"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cx(styles.toggle, styles[variant], className)}
      onClick={onToggle}
    >
      {dark ? (
        <svg
          width={icon}
          height={icon}
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </svg>
      ) : (
        <svg
          width={icon}
          height={icon}
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        >
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  );
}
