import { PushNotifications } from '@capacitor/push-notifications'
import { v4 as uuidv4 } from 'uuid'   

export async function registerPush(userId: string) {
  const permStatus = await PushNotifications.requestPermissions()
  if (permStatus.receive !== 'granted') return
  console.log('Push permission granted')

  await PushNotifications.register()

  PushNotifications.addListener('registration', async (token) => {
    console.log('FCM Token:', token.value)

    // ✅ use uuidv4 instead of crypto.randomUUID
    const deviceId = localStorage.getItem('deviceId') || uuidv4()
    localStorage.setItem('deviceId', deviceId)

    await $fetch('/api/savecaptoken', {
      method: 'POST',
      body: {
        userId,
        deviceId,
        token: token.value,
        deviceInfo: {
          userAgent: navigator.userAgent,
        },
      },
    })
  })
}
