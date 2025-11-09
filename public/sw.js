// ===================================================
// ✅ Firebase Imports (Safe)
// ===================================================
try {
  importScripts(
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'
  );

  firebase.initializeApp({
    apiKey: "AIzaSyBIdT1rcRgxGuPbIE8o3iHellO306YXWvU",
    authDomain: "markit-e2b0e.firebaseapp.com",
    projectId: "markit-e2b0e",
    storageBucket: "markit-e2b0e.appspot.com",
    messagingSenderId: "1024139443483",
    appId: "1:1024139443483:web:df6200650e2c956c54e7be"
  });

  const messaging = firebase.messaging();

  // ✅ Handle background messages
  messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background message:', payload);
    self.registration.showNotification(payload.data.title || 'Markit', {
      body: payload.data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: payload.data.url || '/'
    });
  });

} catch (err) {
  console.warn('[SW] Firebase Messaging not initialized:', err);
}

// ===================================================
// ✅ Cache Configuration
// ===================================================
const CACHE_VERSION = 'v4';
const CACHE_NAME = `markit-${CACHE_VERSION}`;
const OFFLINE_URL = '/nonetwork.html';

const PRECACHE_URLS = [
  '/',
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json',
];

// ===================================================
// ✅ Install Event — Cache essential files
// ===================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(PRECACHE_URLS);
        console.log('[SW] Cached essential assets');
      } catch (err) {
        console.warn('[SW] Failed to cache during install:', err);
      }
      self.skipWaiting(); // Activate immediately after install
    })()
  );
});

// ===================================================
// ✅ Activate Event — Cleanup old caches
// ===================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new service worker...');
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim(); // Start controlling open pages
      console.log('[SW] Ready and controlling clients');
    })()
  );
});

// ===================================================
// ✅ Fetch Event — Stale-While-Revalidate + Offline Fallback
// ===================================================
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(event.request);

      // Always try to fetch fresh copy in background
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(async () => {
          // Network failed → use cache or offline page
          if (event.request.mode === 'navigate' ||
              event.request.headers.get('accept')?.includes('text/html')) {
            return cachedResponse || (await cache.match(OFFLINE_URL));
          }
          return cachedResponse || (await cache.match(OFFLINE_URL));
        });

      // Return cached response first (instant load)
      return cachedResponse || fetchPromise;
    })()
  );
});

// ===================================================
// ✅ Notification Click Event
// ===================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
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

// ===================================================
// ✅ Optional: Message Event for SKIP_WAITING
// ===================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
