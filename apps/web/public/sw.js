/* BlueLine service worker (spec §7 PWA): offline shell, last loaded board readable offline.
 *
 * - Board navigations ("/"): network first; each good response replaces the cached board.
 *   Offline, the last board is served.
 * - Other navigations: network, falling back to the offline page.
 * - Build assets (/_next/static, icons): cache first; they are content-hashed.
 * - API calls and everything else: straight to the network, never cached.
 */
const VERSION = 'blueline-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const OFFLINE_URL = '/offline';
const BOARD_KEY = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([OFFLINE_URL, '/icons/192', '/manifest.webmanifest']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function boardNetworkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(request);
    if (res.ok && res.type === 'basic') await cache.put(BOARD_KEY, res.clone());
    return res;
  } catch {
    return (await cache.match(BOARD_KEY)) || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

async function pageNetworkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL);
    return (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

async function assetCacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(url.pathname === '/' ? boardNetworkFirst(request) : pageNetworkFirst(request));
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(assetCacheFirst(request));
  }
});
