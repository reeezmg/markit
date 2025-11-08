// ✅ Firebase imports
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ✅ Firebase config
firebase.initializeApp({
  apiKey: "AIzaSyBIdT1rcRgxGuPbIE8o3iHellO306YXWvU",
  authDomain: "markit-e2b0e.firebaseapp.com",
  projectId: "markit-e2b0e",
  storageBucket: "markit-e2b0e.appspot.com",
  messagingSenderId: "1024139443483",
  appId: "1:1024139443483:web:df6200650e2c956c54e7be"
});

const messaging = firebase.messaging();

// ✅ Handle background FCM messages
messaging.onBackgroundMessage(payload => {
  self.registration.showNotification(payload.data.title, {
    body: payload.data.body,
    icon: '/icons/icon-192.png',
    data: payload.data.url || '/'
  });
});

// ✅ Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});


// ✅ --- ADD OFFLINE CACHING LOGIC HERE ---

const CACHE_NAME = 'markit-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
  '/',            // 👈 home page or change to your startup page
  OFFLINE_URL,    // 👈 offline page
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json'
];

// ✅ Install event — cache important pages
self.addEventListener('install', (event) => {
  console.log('[SW] Installing and caching app shell...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ✅ Activate event — cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
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

// ✅ Fetch event — respond with cache, fallback to offline
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Optionally cache fresh responses
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((res) => res || caches.match(OFFLINE_URL))
      )
  );
});
