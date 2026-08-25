// CoolSites Service Worker — offline-first caching
const CACHE_NAME = 'coolsites-v2.4.0';
const ASSETS = [
  './',
  './index.html',
  './collections.html',
  './widget.js',
  './manifest.json',
  './sites.json',
  './categories.json',
  './collections.json',
  './stars.json',
  './favicons.json',
  './feeds/recent.atom',
  './feeds/recent.json',
  './fonts/outfit-latin.woff2',
  './fonts/outfit-latin-ext.woff2',
  './fonts/jetbrains-mono-latin.woff2',
  './fonts/jetbrains-mono-latin-ext.woff2'
];

function offlineResponse() {
  return new Response('Offline and not cached', {
    status: 504,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

function markCacheSource(response, source) {
  // A 204 or 205 has a null body and constructing a Response from it throws.
  if (response.status === 204 || response.status === 205 || response.status === 304) return response;
  const headers = new Headers(response.headers);
  headers.set('X-CoolSites-Cache', source);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// Pre-cache core assets on install
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(ASSETS.map(asset =>
        cache.add(asset).catch(error => console.warn('CoolSites precache skipped', asset, error))
      )))
      .then(() => self.skipWaiting())
  );
});

// Clean old caches on activate
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for data and navigations, cache-first for immutable assets.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Everything the directory needs is same-origin; leave anything else alone.
  if (url.origin !== location.origin) return;

  const isData = /\.(json|atom)$/.test(url.pathname);
  const isNavigation = e.request.mode === 'navigate';

  if (!isData && !isNavigation) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(e.request, clone))
            .catch(() => {});
        }
        return response;
      }).catch(() => offlineResponse()))
    );
    return;
  }

  // Network-first for data and navigations, with an offline shell fallback.
  e.respondWith(
    fetch(e.request).then(response => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME)
          .then(cache => cache.put(e.request, clone))
          .catch(() => {});
      }
      return isData ? markCacheSource(response, 'network') : response;
    }).catch(() => caches.match(e.request).then(async cached => {
      if (cached) return isData ? markCacheSource(cached, 'cache') : cached;
      if (isNavigation) {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      return offlineResponse();
    }))
  );
});
