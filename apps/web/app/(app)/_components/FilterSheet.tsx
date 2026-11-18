'use client';

import type { BoardFilter } from '@blueline/contracts';
import { Button } from '@blueline/ui';
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { resetFilter, type FilterPreset } from '../../../lib/board-presets';
import { FilterControls, type GameOption } from './FilterControls';
import styles from './FilterSheet.module.css';
import { PresetBar } from './PresetBar';

export interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  value: BoardFilter;
  onChange: (next: BoardFilter) => void;
  presets: readonly FilterPreset[];
  /** N in the "Show N props" button. */
  resultCount: number;
  games?: readonly GameOption[];
  onSavePreset?: () => void;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

/** Phone bottom-sheet dialog (spec 7). Focus is trapped; Escape and the scrim close it. */
export function FilterSheet({
  open,
  onClose,
  value,
  onChange,
  presets,
  resultCount,
  games,
  onSavePreset,
}: FilterSheetProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);

  // Move focus in on open, restore it on close, and stop the page scrolling behind the sheet.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    ).filter((n) => n.offsetParent !== null || n === document.activeElement);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) {
      e.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.sheet}
        onKeyDown={onKeyDown}
      >
        <div className={styles.grab} aria-hidden="true" />
        <header className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            Filters
          </h2>
          <Button variant="ghost" onClick={() => onChange(resetFilter(value))}>
            Reset filters
          </Button>
        </header>
        <div className={styles.body}>
          <PresetBar
            value={value}
            onChange={onChange}
            presets={presets}
            onSavePreset={onSavePreset}
          />
          <FilterControls value={value} onChange={onChange} games={games} />
        </div>
        <footer className={styles.foot}>
          <Button size="lg" className={styles.show} onClick={onClose}>
            {`Show ${resultCount} ${resultCount === 1 ? 'prop' : 'props'}`}
          </Button>
        </footer>
      </section>
    </div>
  );
}
