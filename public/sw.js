const CACHE = 'tareas-v1';
const SHELL = '/';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api')) return;

  if (request.mode === 'navigate') {
    if (url.pathname !== '/') return;
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok && !res.redirected) caches.open(CACHE).then(cache => cache.put(SHELL, res.clone()));
          return res;
        })
        .catch(() => caches.match(SHELL))
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || /\.(png|ico|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        hit =>
          hit ||
          fetch(request).then(res => {
            if (res.ok) caches.open(CACHE).then(cache => cache.put(request, res.clone()));
            return res;
          })
      )
    );
  }
});
