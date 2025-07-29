export const NOTIFICATION_TYPES = [
  'ORDER_RECEIVED',
  'BILL_CREATED',
  'PAYMENT_RECEIVED',
  'EXPENSE_CREATED',
  'INVENTORY_LOW',
  'SHIPMENT_SENT',
  'SYSTEM_ALERT'
] as const;

export type NotificationType = typeof NOTIFICATION_TYPES[number];
export type NotificationFilter = NotificationType | 'all' | 'unread';

export interface AppNotification {
  id: string
  companyId: string
  userId?: string
  clientId?: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  actionPath?: string
  metadata?: Record<string, any>
  createdAt: Date | string
}

export type NotificationConfig = {
  icon: string
  color: string
  label: string
}

export type NotificationConfigs = Record<NotificationType, NotificationConfig> & {
  [key: string]: NotificationConfig
}