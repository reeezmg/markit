// server/api/test-notification.ts
// import { Bill, PaymentStatus } from '@prisma/client'
import { appEvents, NotificationEventTypes } from '~/server/services/eventService'

export default defineEventHandler(async () => {

  
    appEvents.emit(NotificationEventTypes.BILL_CREATED, {
        id: 'test-bill-id',
        createdAt: new Date(),
        invoiceNumber: 101,
        subtotal: 1000,
        discount: 0,
        tax: 180,
        grandTotal: 1180,
        deliveryFees: 0,
        paymentStatus: 'unpaid',
        paymentMethod: null,
        transactionId: null,
        notes: 'Test Bill',
        clientId: null,
        companyId: '352eed6c-e8ae-4eec-9630-ca1782785e35',
        addressId: null
      } as any)
      
  
    return { success: true }
  })
  