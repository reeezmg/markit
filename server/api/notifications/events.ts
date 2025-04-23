// server/notifications/events.ts
import { EventEmitter } from 'events'

export const notificationEvents = new EventEmitter()

export enum NotificationEventTypes {
  ORDER_CREATED = 'ORDER_CREATED',
  EXPENSE_CREATED = 'EXPENSE_CREATED'
}