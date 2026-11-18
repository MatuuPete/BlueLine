'use client';

import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cx } from '../format';
import styles from './Chip.module.css';

export interface ChipProps extends Omit<
  ComponentPropsWithoutRef<'button'>,
  'onClick' | 'children'
> {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  /** `pill` for filter chips (default); `rounded` for chips laid out in a grid. */
  shape?: 'pill' | 'rounded';
  /** Mono face, for sportsbook codes. */
  mono?: boolean;
}

/** Toggle chip: Duke Blue when pressed, outlined otherwise. */
export function Chip({
  pressed,
  onClick,
  children,
  shape = 'pill',
  mono = false,
  className,
  type = 'button',
  ...rest
}: ChipProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        styles.chip,
        styles[shape],
        mono && styles.mono,
        pressed && styles.on,
        className,
      )}
    >
      {children}
    </button>
  );
}
