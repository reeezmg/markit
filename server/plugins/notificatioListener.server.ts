// server\plugins\notificatioListener.server.ts
import { setupNotificationListeners } from '~/server/services/notificationService'

export default defineNitroPlugin(() => {
  setupNotificationListeners()
})
