'use client';

import { buttonClassName, type ButtonProps } from '@blueline/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** A link styled as the one button family. Usable from server components. */
export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  prefetch,
  children,
}: {
  href: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  prefetch?: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} prefetch={prefetch} className={buttonClassName(variant, size)}>
      {children}
    </Link>
  );
}
