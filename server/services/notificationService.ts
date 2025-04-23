// server/services/notificationService.ts
import { appEvents, NotificationEventTypes } from './eventService'
import { broadcastNotification } from '~/server/ws/notificationServer'
import { prisma } from '~/server/utils/prisma'
import { Notification as PrismaNotification, NotificationType } from '@prisma/client'



type NotificationDataMap = {
  [NotificationEventTypes.BILL_CREATED]: {
    title: string
    message: (order: { orderNumber: string }) => string
    actionPath: (order: { id: string }) => string
  }
  [NotificationEventTypes.EXPENSE_CREATED]: {
    title: string
    message: (expense: { description: string; amount: number }) => string
    actionPath: (expense: { id: string }) => string
  }
  // Add other event types...
}

const notificationTemplates: NotificationDataMap = {
  [NotificationEventTypes.BILL_CREATED]: {
    title: 'New Order Received',
    message: (order) => `Order #${order.orderNumber} created`,
    actionPath: (order) => `/orders/${order.id}`
  },
  [NotificationEventTypes.EXPENSE_CREATED]: {
    title: 'New Expense Submitted',
    message: (expense) => `Expense: ${expense.description} (${expense.amount})`,
    actionPath: (expense) => `/expenses/${expense.id}`
  }
}



export function setupNotificationListeners() {
  appEvents.on(NotificationEventTypes.BILL_CREATED, async (bill) => {
    console.log('Received BILL_CREATED event:', bill)
    await createNotification({
      companyId: bill.companyId,
      type: 'ORDER_RECEIVED',
      title: bill.type === 'BILL' ? 'New Bill Created' : 'New Invoice Generated',
      message: `${bill.type} #${bill.invoiceNumber || 'N/A'} for ${bill.grandTotal}`,
      actionPath: `/bills/${bill.id}`,
      metadata: {
        billId: bill.id,
        amount: bill.grandTotal
      }
    });
  });

  appEvents.on(NotificationEventTypes.EXPENSE_CREATED, async (expense) => {
    const template = notificationTemplates[NotificationEventTypes.EXPENSE_CREATED]
    await createNotification({
      companyId: expense.companyId,
      type: NotificationType.EXPENSE_CREATED,
      title: template.title,
      message: template.message({description:expense.note ?? 'N/A', amount: expense.totalAmount}),
      actionPath: template.actionPath(expense),
      metadata: { expenseId: expense.id }
    })
  })
}

async function createNotification(data: {
    companyId: string
    type: NotificationType
    title: string
    message: string
    actionPath?: string
    metadata?: any
  }): Promise<PrismaNotification> {
    const notification = await prisma.notification.create({ data })
    broadcastNotification(notification)
    return notification
  }
  