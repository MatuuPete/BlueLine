'use client';

import { useCallback, useState } from 'react';
import { cx } from '../format';
import { teamLogoUrl } from '../images';
import styles from './Avatar.module.css';

export interface AvatarProps {
  /** Image URL (headshotUrl / teamLogoUrl), or null to show the fallback. */
  src: string | null;
  /** Shown when there is no image or it fails to load: a monogram or a team abbreviation. */
  fallback: string;
  /** Rendered width and height in px. */
  size: number;
  /** headshot: cropped into a tinted frame. logo: fitted, no frame. */
  variant?: 'headshot' | 'logo';
  /** circle (lists) or rounded square (the prop page header). */
  shape?: 'circle' | 'rounded';
  className?: string;
}

/**
 * A player headshot or team logo. Decorative: the name or abbreviation always sits next to it.
 * A missing image (no ESPN id, a 404, a blocked request) degrades to the fallback text, never
 * to a broken-image icon.
 */
export function Avatar({
  src,
  fallback,
  size,
  variant = 'headshot',
  shape = 'circle',
  className,
}: AvatarProps) {
  // Remember which src failed, so a new src (a reused row) gets a fresh try.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src !== null && failedSrc !== src;

  // An image that failed before hydration never fires React's onError; catch it on mount.
  // currentSrc stays '' until the browser has actually requested the image, so a lazy image
  // that simply has not started loading (some browsers report it as complete) is left alone.
  const checkAlreadyFailed = useCallback(
    (img: HTMLImageElement | null) => {
      if (img && src && img.complete && img.currentSrc !== '' && img.naturalWidth === 0)
        setFailedSrc(src);
    },
    [src],
  );

  return (
    <span
      aria-hidden="true"
      data-state={showImage ? 'image' : 'fallback'}
      data-variant={variant}
      className={cx(styles.frame, styles[variant], styles[shape], className)}
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.4)) }}
    >
      {showImage ? (
        <img
          key={src}
          ref={checkAlreadyFailed}
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className={styles.img}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        fallback
      )}
    </span>
  );
}

/** Team logo from its ESPN abbreviation; the abbreviation itself when the logo is missing. */
export function TeamLogo({
  abbr,
  size,
  className,
}: {
  abbr: string;
  size: number;
  className?: string;
}) {
  return (
    <Avatar
      src={teamLogoUrl(abbr, size)}
      fallback={abbr}
      size={size}
      variant="logo"
      className={className}
    />
  );
}
