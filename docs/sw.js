const cacheName = 'web-siren-v0.1.0-rc1';

const assetsToCache = [
  '/',
  '/alvadub.png',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/apple-touch-icon.png',
  '/browserconfig.xml',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/favicon.ico',
  '/index.html',
  '/mstile-144x144.png',
  '/mstile-150x150.png',
  '/mstile-310x150.png',
  '/mstile-310x310.png',
  '/mstile-70x70.png',
  '/safari-pinned-tab.svg',
  '/siren.js',
  '/style.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(cacheName)
      .then(cache => cache.addAll(assetsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.filter(name => name !== cacheName)
            .map(name => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }

        const fetchRequest = event.request.clone();

        return fetch(fetchRequest)
          .then(response => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();

            caches.open(cacheName)
              .then(cache => cache.put(event.request, responseToCache));

            return response;
          });
      })
  );
});
