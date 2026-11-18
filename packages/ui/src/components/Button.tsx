'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { cx } from '../format';
import styles from './Button.module.css';

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  /** primary: filled Duke Blue. secondary: outlined. ghost: text only. */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** md: 44px. lg: 48px (the detail page's "Add to slip"). */
  size?: 'md' | 'lg';
}

/** The one button family (canvas DesignSystem: Add to slip / Save to favorites / Reset filters). */
export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={cx(styles.button, styles[variant], styles[size], className)}
    />
  );
}

/** Class names for links that should look like a Button. */
export function buttonClassName(
  variant: ButtonProps['variant'] = 'primary',
  size: ButtonProps['size'] = 'md',
): string {
  return cx(styles.button, styles[variant], styles[size]);
}
