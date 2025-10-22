const CACHE = 'flashoffer-v1';
const RELATIVE_ASSETS = [
  './index.html',
  './offer.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './i18n/en.json',
  './i18n/pl.json',
  './i18n/de.json',
  './i18n/fr.json',
  './i18n/es.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const SW_BASE = self.location.origin + self.location.pathname.replace(/\/[^/]*$/, '/');
const toAbsolute = (path) => new URL(path, SW_BASE).toString();
const ASSET_URLS = RELATIVE_ASSETS.map(toAbsolute);
const FALLBACK_OFFER = toAbsolute('./offer.html');
const FALLBACK_INDEX = toAbsolute('./index.html');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(RELATIVE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const cleanUrl = request.url.split('#')[0];
  if (ASSET_URLS.includes(cleanUrl)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return (await caches.match(FALLBACK_OFFER)) || (await caches.match(FALLBACK_INDEX));
      })
    );
  }
});
