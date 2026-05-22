const CACHE_NAME = 'nutrisnap-cache-v11';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg'
];

// Встановлення сервіс-воркера та кешування статичних ресурсів
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Активація та видалення старих кешів
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Перехоплення запитів для офлайн роботи
self.addEventListener('fetch', (event) => {
  // Пропускаємо запити до зовнішніх API (наприклад, Gemini API)
  if (event.request.url.includes('googleapis.com')) {
    return;
  }
  
  const url = new URL(event.request.url);
  
  // Для головної сторінки та index.html використовуємо Network-First (мережевий запит з офлайн-фолбеком)
  // Це запобігає ситуації, коли старий cached index.html намагається завантажити старі JS-хеші, яких уже немає на сервері
  if (url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // Для інших ресурсів (JS, CSS, картинки) використовуємо Cache-First з оновленням
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Перевіряємо валідність відповіді перед кешуванням
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        
        return response;
      });
    }).catch(() => {
      // Офлайн фолбек, якщо ресурс не в кеші
      return caches.match('/index.html');
    })
  );
});

