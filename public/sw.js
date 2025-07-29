// ✅ Must use compat version and importScripts
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ✅ Re-declare config (same as in main app)
firebase.initializeApp({
  apiKey: "AIzaSyBIdT1rcRgxGuPbIE8o3iHellO306YXWvU",
  authDomain: "markit-e2b0e.firebaseapp.com",
  projectId: "markit-e2b0e",
  storageBucket: "markit-e2b0e.appspot.com",
  messagingSenderId: "1024139443483",
  appId: "1:1024139443483:web:df6200650e2c956c54e7be"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  self.registration.showNotification(payload.data.title, {
    body: payload.data.body,
    icon: '/icons/icon-192.png',
    data: payload.data.url || '/'
  });
});



// // ✅ Handle custom push messages (non-FCM)
// self.addEventListener('push', event => {
//   if (!event.data) return;

//   const data = event.data.json();

//   event.waitUntil(
//     self.registration.showNotification(data.title || '📢 Notification', {
//       body: data.body || '',
//       icon: '/icons/icon-192.png',
//       badge: '/icons/icon-192.png',
//       data: data.url || '/',
//     })
//   );
// });

// ✅ Handle notification click
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

// ✅ Required for TWA
self.addEventListener('fetch', () => {});
