/* NeoBank PWA service worker — performance-tuned caching strategies.
 *
 * Strategies:
 *  - Static build assets (/assets/*, hashed by Vite): cache-first, immutable
 *  - App shell (/, index.html, manifest): stale-while-revalidate
 *  - API calls (/api/*): network-only with timeout — NEVER cache banking data
 *  - Fonts/CDN: stale-while-revalidate with 7-day expiry
 */
const VERSION = 'neobank-v2.0.0';
const STATIC_CACHE = `${VERSION}-static`;
const SHELL_CACHE = `${VERSION}-shell`;
const CDN_CACHE = `${VERSION}-cdn`;

const API_TIMEOUT_MS = 8000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(['/', '/index.html', '/manifest.json', '/favicon.ico']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function networkWithTimeout(request, timeoutMs) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
  ]);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // API: network-only (never serve stale financial data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      networkWithTimeout(event.request, API_TIMEOUT_MS).catch(() =>
        new Response(JSON.stringify({ error: 'offline', message: 'You appear to be offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Hashed Vite assets: cache-first (content-addressed, safe to cache forever)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
      )
    );
    return;
  }

  // Fonts / CDN: stale-while-revalidate
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.open(CDN_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const network = fetch(event.request).then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // App shell: stale-while-revalidate
  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request).then((response) => {
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      }).catch(() => cached || caches.match('/index.html'));
      return cached || network;
    })
  );
});
