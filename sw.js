// Service Worker for HPTEnglish Flashcard SRS PWA
const CACHE_NAME = 'hpt-srs-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css'
];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: always network, no cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({ error: 'offline' }), { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // External CDN: stale-while-revalidate
  if (!url.hostname.includes('localhost')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(res => {
          if (res && res.status === 200) {
            const cloned = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, cloned));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Static local files: cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.status === 200) {
          const cloned = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, cloned));
        }
        return res;
      });
    })
  );
});
