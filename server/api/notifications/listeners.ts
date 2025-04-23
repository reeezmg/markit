// server/notifications/listeners.ts
import { notificationEvents, NotificationEventTypes } from './events'
import { prisma , broadcastNotification} from '../../ws/notificationServer'

notificationEvents.on(NotificationEventTypes.ORDER_CREATED, async (order) => {
  const notification = await prisma.notification.create({
    data: {
      companyId: order.companyId,
      type: 'ORDER_RECEIVED',
      title: 'New Order Received',
      message: `Order #${order.orderNumber} has been placed`,
      actionPath: `/orders/${order.id}`
    }
  })
  await broadcastNotification(notification)
})