'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './menu.module.css';

export interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/**
 * Button + menu (WAI-ARIA menu button). The list is portalled to <body> and positioned with
 * `position: fixed`, so a scrolling table never clips it. It flips above the button near the
 * bottom edge and closes on scroll or resize rather than drifting away from its button.
 */
export function ActionMenu({
  label,
  ariaLabel,
  items,
  className,
  triggerData,
}: {
  label: ReactNode;
  ariaLabel?: string;
  items: MenuItem[];
  className?: string;
  /** Hook for finding the button again (to return focus after the row re-renders). */
  triggerData?: string;
}) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const focusAt = useRef<'first' | 'last'>('first');

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setPos(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const enabled = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ??
        [],
    );

  useLayoutEffect(() => {
    if (!open) return;
    const t = triggerRef.current;
    const m = menuRef.current;
    if (!t || !m) return;
    const r = t.getBoundingClientRect();
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8 && r.top - h - 4 >= 8) top = r.top - h - 4;
    setPos({ top, left });
    const list = enabled();
    (focusAt.current === 'last' ? list[list.length - 1] : list[0])?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const n = e.target as Node;
      if (menuRef.current?.contains(n) || triggerRef.current?.contains(n)) return;
      close(false);
    };
    const dismiss = () => close(false);
    document.addEventListener('pointerdown', away);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open, close]);

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusAt.current = e.key === 'ArrowUp' ? 'last' : 'first';
      setOpen(true);
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = enabled();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      close(true);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        data-menu-trigger={triggerData}
        onClick={() => {
          focusAt.current = 'first';
          if (open) close(false);
          else setOpen(true);
        }}
        onKeyDown={onTriggerKey}
      >
        {label}
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={ariaLabel}
              className={styles.menu}
              style={{
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
                visibility: pos ? 'visible' : 'hidden',
              }}
              onKeyDown={onMenuKey}
            >
              {items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={it.disabled}
                  className={`${styles.item} ${it.danger ? styles.danger : ''}`}
                  onClick={() => {
                    close(true);
                    it.onSelect();
                  }}
                >
                  {it.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
