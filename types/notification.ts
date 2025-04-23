// types/notification.ts

export type NotificationType =
  | 'ORDER_RECEIVED'
  | 'PAYMENT_RECEIVED'
  | 'EXPENSE_CREATED'
  | 'INVENTORY_LOW'
  | 'SHIPMENT_SENT'
  | 'SYSTEM_ALERT'

export interface Notification {
  id: string
  companyId: string
  type: NotificationType
  title: string
  message: string
  actionPath?: string
  read: boolean
  createdAt: string
  updatedAt: Date
  metadata?: {
    orderId?: string
    expenseId?: string
    productId?: string
    [key: string]: any
  }
}

export type NotificationGroup = {
  type: NotificationType
  count: number
  latest: Notification
}
