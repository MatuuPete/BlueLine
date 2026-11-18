import type { ReactNode } from 'react';
import { cx } from '../format';
import styles from './Disclaimer.module.css';

/** Spec §7 copy rule: every page carries this line. */
export const DISCLAIMER_TEXT =
  'Research only, not betting advice. 21+. Gambling problem? Call 1-800-GAMBLER.';

export interface DisclaimerProps {
  /** Optional page note printed first, e.g. how hit rates are counted. */
  children?: ReactNode;
  className?: string;
}

export function Disclaimer({ children, className }: DisclaimerProps) {
  return (
    <p className={cx(styles.disclaimer, className)}>
      {children ? <>{children} </> : null}
      Research only, not betting advice. 21+. Gambling problem? Call{' '}
      <a href="tel:+18004262537" className={styles.phone}>
        1-800-GAMBLER
      </a>
      .
    </p>
  );
}
