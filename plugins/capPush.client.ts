// plugins/push.client.ts
import { PushNotifications } from '@capacitor/push-notifications'
import { useRouter } from 'vue-router'

export default defineNuxtPlugin(() => {
  if (!process.client) return

  const router = useRouter()

  // User taps a push notification (app in background or killed → opens app)
  PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
    console.log('🔔 Notification tapped:', notification)

    const route = notification.notification?.data?.route
    if (route) {
      router.push(route)
    }
  })


})
