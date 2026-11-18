'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js (PWA offline shell: the last loaded board stays readable offline).
 * Production only, so dev reloads never serve a stale cached board.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Offline support is an enhancement; the app works without it.
    });
  }, []);
  return null;
}
