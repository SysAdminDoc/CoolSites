// CoolSites Service Worker — offline-first caching
const CACHE_NAME = 'coolsites-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './fonts/outfit-latin.woff2',
  './fonts/outfit-latin-ext.woff2',
  './fonts/jetbrains-mono-latin.woff2',
  './fonts/jetbrains-mono-latin-ext.woff2'
];

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

// Network-first for HTML, cache-first for fonts/favicons
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

  // Network-first for same-origin (HTML)
  e.respondWith(
    fetch(e.request).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return response;
    }).catch(() => caches.match(e.request))
  );
});
