// Sign-out cleanup for the PWA: the service worker caches signed-in pages (board HTML), so
// they must not outlive the session on a shared device.

/** Posted to the controlling service worker; sw.js should drop its caches on it. */
export const SW_SIGN_OUT_MESSAGE = { type: 'SIGN_OUT' } as const;

/** The slice of `window` this needs (injectable for tests). */
export interface ClientCacheEnv {
  caches?: { keys(): Promise<string[]>; delete(key: string): Promise<boolean> };
  serviceWorker?: { controller: { postMessage(message: unknown): void } | null };
}

/** Delete every Cache Storage cache and notify the service worker. Never throws. */
export async function clearClientCaches(env: ClientCacheEnv): Promise<void> {
  try {
    if (env.caches) {
      const keys = await env.caches.keys();
      await Promise.all(keys.map((k) => env.caches!.delete(k)));
    }
  } catch {
    // Cache Storage can be unavailable (private mode, insecure origin). Sign out anyway.
  }
  try {
    env.serviceWorker?.controller?.postMessage(SW_SIGN_OUT_MESSAGE);
  } catch {
    // No controlling worker, or it is gone: nothing to tell.
  }
}
