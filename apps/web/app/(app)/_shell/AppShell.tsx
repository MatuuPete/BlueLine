'use client';

import { Disclaimer, Logo } from '@blueline/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { Theme } from '../../../lib/theme';
import { BetsIcon, BoardIcon, GamesIcon, GearIcon, SearchIcon, SlipIcon, StarIcon } from './icons';
import styles from './shell.module.css';
import { SlipDrawer } from './SlipDrawer';
import { SlipProvider, useSlip } from './SlipContext';
import { ThemeControl } from './ThemeControl';

const NAV = [
  { href: '/', label: 'Board' },
  { href: '/games', label: 'Games' },
  { href: '/slips', label: 'Slips' },
  { href: '/bets', label: 'Bets' },
  { href: '/favorites', label: 'Favorites' },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/' || pathname.startsWith('/props/');
  return pathname === href || pathname.startsWith(`${href}/`);
}

const legsText = (n: number) => `${n} ${n === 1 ? 'leg' : 'legs'}`;

function SlipButton({ className }: { className: string }) {
  const { legs, setOpen } = useSlip();
  return (
    <button type="button" className={className} onClick={() => setOpen(true)}>
      Slip · {legsText(legs.length)}
    </button>
  );
}

/** Player search: a plain GET form to the board, so it works before hydration too. */
function SearchForm({ id, className }: { id: string; className: string }) {
  return (
    <form action="/" method="get" role="search" className={className}>
      <label htmlFor={id} className="sr-only">
        Search players
      </label>
      <input
        id={id}
        name="q"
        type="search"
        placeholder="Search players"
        maxLength={64}
        autoComplete="off"
        className={styles.searchInput}
      />
    </form>
  );
}

function TopBar({
  theme,
  signedIn,
  updatedText,
}: {
  theme: Theme | null;
  signedIn: boolean;
  updatedText: string | null;
}) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <header className={styles.top}>
      <div className={styles.topInner}>
        <Link href="/welcome" prefetch={false} aria-label="BlueLine intro" className={styles.brand}>
          <Logo size={28} wordmark />
        </Link>
        <nav aria-label="Main" className={styles.nav}>
          {NAV.map((n) => {
            const on = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? 'page' : undefined}
                className={styles.navLink}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className={styles.spacer} />
        <SearchForm id="top-search" className={styles.search} />
        {updatedText ? <span className={styles.updated}>{updatedText}</span> : null}
        <button
          type="button"
          className={styles.phoneSearch}
          aria-label="Search players"
          aria-expanded={searchOpen}
          aria-controls="phone-search-row"
          onClick={() => setSearchOpen((o) => !o)}
        >
          <SearchIcon />
        </button>
        <ThemeControl initialTheme={theme} signedIn={signedIn} />
        <Link
          href="/settings"
          aria-label="Settings"
          aria-current={pathname === '/settings' ? 'page' : undefined}
          className={styles.ctrl}
        >
          <GearIcon />
        </Link>
        <SlipButton className={styles.slipBtn} />
      </div>
      {searchOpen ? (
        <div id="phone-search-row" className={styles.phoneSearchRow}>
          <SearchForm id="phone-search" className={styles.phoneSearchForm} />
        </div>
      ) : null}
    </header>
  );
}

function TabBar() {
  const pathname = usePathname();
  const { legs, setOpen } = useSlip();
  const tab = (href: string, label: string, icon: ReactNode) => {
    const on = isActive(pathname, href);
    return (
      <Link href={href} aria-current={on ? 'page' : undefined} className={styles.tab}>
        {icon}
        {label}
      </Link>
    );
  };
  return (
    <nav aria-label="Main" className={styles.tabBar}>
      {tab('/', 'Board', <BoardIcon />)}
      {tab('/games', 'Games', <GamesIcon />)}
      <button type="button" className={styles.tab} onClick={() => setOpen(true)}>
        <SlipIcon />
        Slip · {legs.length}
        <span className="sr-only">{legs.length === 1 ? ' leg' : ' legs'}</span>
      </button>
      {tab('/bets', 'Bets', <BetsIcon />)}
      {tab('/favorites', 'Favorites', <StarIcon />)}
    </nav>
  );
}

/** The signed-in app frame (spec §7 layout): navy top bar, content, disclaimer, phone tab bar. */
export function AppShell({
  children,
  theme,
  signedIn,
  updatedText,
}: {
  children: ReactNode;
  theme: Theme | null;
  signedIn: boolean;
  updatedText: string | null;
}) {
  return (
    <SlipProvider>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <div className={styles.frame}>
        <TopBar theme={theme} signedIn={signedIn} updatedText={updatedText} />
        <main id="main" className={styles.main}>
          {children}
        </main>
        <footer className={styles.footer}>
          <Disclaimer />
          <Link href="/status" className={styles.footLink}>
            Data status
          </Link>
        </footer>
        <TabBar />
      </div>
      <SlipDrawer />
    </SlipProvider>
  );
}
