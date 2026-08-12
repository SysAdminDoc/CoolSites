// CoolSites Service Worker — offline-first caching
const CACHE_NAME = 'coolsites-v2.2.0';
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

function markCacheSource(response, source) {
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
      .then(cache => cache.addAll(ASSETS))
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

  // Skip cross-origin requests except favicon APIs
  if (url.origin !== location.origin) {
    // Cache favicon responses (Google/DuckDuckGo)
    if (url.hostname.includes('google.com') ||
        url.hostname.includes('duckduckgo.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
            }
            return response;
          }).catch(() => cached || new Response('', { status: 408 }));
        })
      );
      return;
    }
    return;
  }

  const isData = /\.(json|atom)$/.test(url.pathname);
  const isNavigation = e.request.mode === 'navigate';

  if (!isData && !isNavigation) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }))
    );
    return;
  }

  // Network-first for data and navigations, with an offline shell fallback.
  e.respondWith(
    fetch(e.request).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return isData ? markCacheSource(response, 'network') : response;
    }).catch(() => caches.match(e.request).then(cached => {
      if (cached) return isData ? markCacheSource(cached, 'cache') : cached;
      if (isNavigation) return caches.match('./index.html');
      throw new Error(`No cached response for ${url.pathname}`);
    }))
  );
});
