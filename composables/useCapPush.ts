import { PushNotifications } from '@capacitor/push-notifications'

async function registerPush(userId: string) {
  const permStatus = await PushNotifications.requestPermissions()
  if (permStatus.receive !== 'granted') return

  await PushNotifications.register()

  PushNotifications.addListener('registration', async (token) => {
    console.log('FCM Token:', token.value)

    const deviceId = localStorage.getItem('deviceId') || crypto.randomUUID()
    localStorage.setItem('deviceId', deviceId)

    await $fetch('/api/devices', {
      method: 'POST',
      body: {
        userId,
        deviceId,
        token: token.value,
        userAgent: navigator.userAgent,
      },
    })
  })
}
