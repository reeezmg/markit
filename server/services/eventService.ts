

// // server/services/eventService.ts
// import { EventEmitter } from 'events'
// import { Bill, Expense, NotificationType } from '@prisma/client'

// // Reuse enum values from Prisma, but keep dev-friendly keys
// export const NotificationEventTypes = {
//   BILL_CREATED: NotificationType.ORDER_RECEIVED,
//   EXPENSE_CREATED: NotificationType.EXPENSE_CREATED,
//   PAYMENT_RECEIVED: NotificationType.PAYMENT_RECEIVED,
//   INVENTORY_LOW: NotificationType.INVENTORY_LOW
// } as const

// export type NotificationEventTypes = typeof NotificationEventTypes[keyof typeof NotificationEventTypes]

// interface EventPayloads {
//   ORDER_RECEIVED: Bill
//   EXPENSE_CREATED: Expense
//   PAYMENT_RECEIVED: { orderId: string; amount: number }
//   INVENTORY_LOW: { productId: string; currentStock: number }
// }

// type EventKeys = keyof EventPayloads

// class AppEventEmitter {
//   private emitter = new EventEmitter()

//   emit<T extends NotificationEventTypes>(event: T, payload: EventPayloads[T]): boolean {
//     return this.emitter.emit(event, payload)
//   }

//   on<T extends NotificationEventTypes>(event: T, listener: (payload: EventPayloads[T]) => void): this {
//     this.emitter.on(event, listener)
//     return this
//   }

//   removeListener<T extends EventKeys>(event: T, listener: (...args: any[]) => void): this {
//     this.emitter.removeListener(event, listener)
//     return this
//   }
// }

// export const appEvents = new AppEventEmitter()


// server/services/eventService.ts
import { EventEmitter } from 'events'
// import type { Bill, Expense } from '@prisma/client'

export enum NotificationEventTypes {
  BILL_CREATED = 'BILL_CREATED',
  EXPENSE_CREATED = 'EXPENSE_CREATED'
}

interface EventPayloads {
  [NotificationEventTypes.BILL_CREATED]: {
    id: string
    companyId: string
    type: string | null
    invoiceNumber: number | null
    grandTotal: number | null
  }
  [NotificationEventTypes.EXPENSE_CREATED]: {
    id: string
    companyId: string
    totalAmount: number
    note: string | null
  }
}

export const appEvents = new EventEmitter() as {
  emit<T extends NotificationEventTypes>(event: T, payload: EventPayloads[T]): boolean
  on<T extends NotificationEventTypes>(event: T, listener: (payload: EventPayloads[T]) => void): void
}