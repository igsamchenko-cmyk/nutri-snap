const CACHE_PREFIX = 'nutrisnap-cache-';
const CACHE_NAME = CACHE_PREFIX + 'v77';
const BASE_PATH = '/nutri-snap';
const BASE_URL = BASE_PATH + '/';
const APP_SHELL_URL = BASE_URL + 'index.html';
const STATIC_ASSETS = [
  BASE_URL,
  APP_SHELL_URL,
  BASE_URL + 'manifest.json',
  BASE_URL + 'favicon.svg',
  BASE_URL + 'icon-192.png',
  BASE_URL + 'icon-512.png',
  BASE_URL + 'apple-touch-icon.png'
];

async function precacheApplication() {
  const cache = await caches.open(CACHE_NAME);
  const shellResponse = await fetch(APP_SHELL_URL, { cache: 'reload' });
  if (!shellResponse.ok) throw new Error('App shell request failed');

  const html = await shellResponse.clone().text();
  const discoveredAssets = [];
  const assetPattern = /(?:src|href)=["']([^"']+)["']/g;
  let match;
  while ((match = assetPattern.exec(html)) !== null) {
    const assetUrl = new URL(match[1], self.location.origin);
    if (assetUrl.origin === self.location.origin && assetUrl.pathname.startsWith(BASE_URL)) {
      discoveredAssets.push(assetUrl.href);
    }
  }

  const urls = [...new Set([...STATIC_ASSETS, ...discoveredAssets])];
  const results = await Promise.allSettled(urls.map(async url => {
    const response = url === APP_SHELL_URL ? shellResponse.clone() : await fetch(url, { cache: 'reload' });
    if (!response.ok) throw new Error('Precache request failed');
    await cache.put(url, response);
  }));

  if (!results.some(result => result.status === 'fulfilled')) {
    throw new Error('No application assets could be cached');
  }
}

self.addEventListener('install', event => {
  event.waitUntil(precacheApplication());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(cacheName => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
        .map(cacheName => caches.delete(cacheName))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isAppRequest = requestUrl.origin === self.location.origin
    && requestUrl.pathname.startsWith(BASE_URL);
  if (!isAppRequest) return;

  const isNavigation = event.request.mode === 'navigate';
  const isAppShell = requestUrl.pathname === BASE_URL || requestUrl.pathname === APP_SHELL_URL;

  if (isNavigation || isAppShell) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          await cache.put(APP_SHELL_URL, response.clone());
          return response;
        }
        return await cache.match(APP_SHELL_URL) || response;
      } catch {
        return await cache.match(event.request) || cache.match(APP_SHELL_URL);
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(event.request);
    if (cachedResponse) return cachedResponse;

    const response = await fetch(event.request);
    if (response.ok && response.type === 'basic') {
      await cache.put(event.request, response.clone());
    }
    return response;
  })());
});
