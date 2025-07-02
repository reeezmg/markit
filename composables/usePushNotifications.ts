// ~/composables/usePushNotifications.ts
import { getToken, onMessage } from 'firebase/messaging'
import { messaging } from './firebase'

export async function usePushNotifications(userId:string, companyId:string) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.warn('Notifications not supported in this browser')
    return
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    console.warn('Notification permission not granted')
    return
  }

  const serviceWorker = await navigator.serviceWorker.ready

  const fcmToken = await getToken(messaging, {
    vapidKey: 'BNxKrA3tmbBLhIMNTd8ghKsYf5nrujaprB0ulxf9_rAx8O8BZuLTEGQiMA_mPyq9yCNnn1g65m-3rqJlMu7d480',
    serviceWorkerRegistration: serviceWorker
  })

  if (!fcmToken) {
    console.warn('Failed to get FCM token')
    return
  }

  // Get or generate device ID
  let deviceId = localStorage.getItem('device_id')
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem('device_id', deviceId)
  }

  // Save token to backend
  try {
    await $fetch('/api/savefcmtoken', {
      method: 'POST',
      body: {
        userId,
        companyId,
        fcmToken,
        deviceId,
        deviceInfo: {
          userAgent: navigator.userAgent
        }
      }
    })
    console.log('✅ FCM token saved to server')
  } catch (err) {
    console.error('❌ Failed to save FCM token:', err)
  }

  // Listen for foreground push
  onMessage(messaging, (payload) => {
    console.log('🔔 Foreground message:', payload)
    if (payload.notification?.title) {
      new Notification(payload.notification.title, {
        body: payload.notification.body,
        icon: '/icons/icon-192.png'
      })
    }
  })
}
