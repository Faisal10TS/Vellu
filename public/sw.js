// Vellu Service Worker — offline shell caching.
//
// Deliberately narrow: it only ever touches SAME-ORIGIN GET requests. The
// previous version cached every GET 200 it saw, which included cross-origin
// Supabase REST/auth responses — so a network blip could hand a stale API
// payload back to supabase-js as if it were fresh. API responses must come
// from the network or fail honestly.
//
// Bump CACHE_NAME on any change here: `activate` deletes every cache whose
// name doesn't match, which is how a poisoned cache gets cleared from
// already-installed clients.
const CACHE_NAME = 'vellu-v2';

// Install — cache the app shell.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/', '/owner']).catch(() => {}))
  );
  self.skipWaiting();
});

// Activate — drop every older cache (including the over-eager 'vellu-v1').
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch — network-first for same-origin GETs, cache only as an offline
// fallback. Anything else (cross-origin, POST, auth, API) is left entirely
// alone so the browser handles it natively.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;   // never touch Supabase et al
  if (url.pathname.startsWith('/api/')) return;      // our own serverless routes

  event.respondWith((async () => {
    try {
      const response = await fetch(req);
      // Only cache real, complete same-origin responses. `basic` excludes
      // opaque/CORS results; a 206 partial would corrupt the cache.
      if (response && response.status === 200 && response.type === 'basic') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
      }
      return response;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      // A navigation with nothing cached still has to render something — fall
      // back to the app shell so the SPA can boot and show its own login/error
      // state. NEVER resolve to undefined: respondWith(undefined) becomes a
      // hard NetworkError with no browser fallback, which is how a transient
      // blip turned into a permanently blank screen.
      if (req.mode === 'navigate') {
        const shell = await caches.match('/');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
