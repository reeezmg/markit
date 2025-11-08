// ===============================
// ✅ Firebase imports
// ===============================
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ===============================
// ✅ Firebase config
// ===============================
firebase.initializeApp({
  apiKey: "AIzaSyBIdT1rcRgxGuPbIE8o3iHellO306YXWvU",
  authDomain: "markit-e2b0e.firebaseapp.com",
  projectId: "markit-e2b0e",
  storageBucket: "markit-e2b0e.appspot.com",
  messagingSenderId: "1024139443483",
  appId: "1:1024139443483:web:df6200650e2c956c54e7be"
});

const messaging = firebase.messaging();

// ===============================
// ✅ Handle background FCM messages
// ===============================
messaging.onBackgroundMessage(payload => {
  console.log('[SW] Background message:', payload);
  self.registration.showNotification(payload.data.title || 'Markit', {
    body: payload.data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: payload.data.url || '/'
  });
});

// ===============================
// ✅ Handle notification clicks
// ===============================
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ===============================
// ✅ Offline caching logic
// ===============================
const CACHE_VERSION = 'v3';
const CACHE_NAME = `markit-${CACHE_VERSION}`;
const OFFLINE_URL = '/nonetwork.html';

// Files you want to precache on install
const PRECACHE_URLS = [
  '/',
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json'
];

// ===============================
// ✅ Install event — cache app shell
// ===============================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing and caching essential assets...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ===============================
// ✅ Activate event — cleanup old caches
// ===============================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new service worker...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// ===============================
// ✅ Fetch event — serve from cache / offline fallback
// ===============================
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful network responses
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_NAME);

        // ✅ Handle navigation requests (HTML pages)
        if (event.request.mode === 'navigate' ||
            event.request.headers.get('accept')?.includes('text/html')) {
          const cachedPage = await cache.match(event.request);
          return cachedPage || cache.match(OFFLINE_URL);
        }

        // ✅ For other files (JS, CSS, images, etc.)
        const cachedAsset = await cache.match(event.request);
        return cachedAsset || cache.match(OFFLINE_URL);
      })
  );
});

// ===============================
// ✅ Optional: log lifecycle changes
// ===============================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
