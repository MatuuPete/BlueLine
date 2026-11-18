'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { MAX_LEGS, toggleLeg, type SlipLeg } from '../../../lib/slip';

interface SlipState {
  legs: SlipLeg[];
  toggle: (leg: SlipLeg) => void;
  remove: (key: string) => void;
  clear: () => void;
  has: (key: string) => boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Last message for the polite live region (e.g. "Slip is full"). */
  notice: string;
}

const SlipCtx = createContext<SlipState | null>(null);
const STORAGE_KEY = 'blueline.slip.v1';

function load(): SlipLeg[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as SlipLeg[]).slice(0, MAX_LEGS) : [];
  } catch {
    return [];
  }
}

/** The working slip: client state, kept in localStorage until it is saved. */
export function SlipProvider({ children }: { children: ReactNode }) {
  const [legs, setLegs] = useState<SlipLeg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    // Hydrate from storage after mount (the server render has an empty slip).
    setLegs(load());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legs));
    } catch {
      // Private mode: the slip still works for this tab.
    }
  }, [legs, loaded]);

  const toggle = useCallback(
    (leg: SlipLeg) => {
      const next = toggleLeg(legs, leg);
      if (next.length < legs.length) setNotice(`Removed ${leg.playerName} from the slip.`);
      else if (next.length === legs.length && !legs.some((l) => l.key === leg.key || (l.gameId === leg.gameId && l.playerId === leg.playerId && l.market === leg.market)))
        setNotice(`Slip is full: ${MAX_LEGS} legs at most.`);
      else setNotice(`Added ${leg.playerName} to the slip.`);
      setLegs(next);
    },
    [legs],
  );

  const value = useMemo<SlipState>(
    () => ({
      legs,
      toggle,
      remove: (key) => setLegs((prev) => prev.filter((l) => l.key !== key)),
      clear: () => setLegs([]),
      has: (key) => legs.some((l) => l.key === key),
      open,
      setOpen,
      notice,
    }),
    [legs, toggle, open, notice],
  );

  return <SlipCtx.Provider value={value}>{children}</SlipCtx.Provider>;
}

export function useSlip(): SlipState {
  const ctx = useContext(SlipCtx);
  if (!ctx) throw new Error('useSlip must be used inside <SlipProvider>');
  return ctx;
}
