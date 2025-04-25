
// // server/utils/prisma.ts
// import { PrismaClient, Prisma } from '@prisma/client'
// import { appEvents, NotificationEventTypes } from '~/server/services/eventService'

// const base = new PrismaClient()

// export const prisma = base.$extends({
//   model: {
//     bill: {
//       // original is the “base.bill.create” method
//       async create (
//         original: typeof base.bill.create,
//         args: Prisma.BillCreateArgs
//       ) {
//         // run the normal create
//         const bill = await original.call(base, args)
//         // then emit
//         appEvents.emit(NotificationEventTypes.BILL_CREATED, bill)
//         return bill
//       },
//     },
//     expense: {
//       async create (
//         original: typeof base.expense.create,
//         args: Prisma.ExpenseCreateArgs
//       ) {
//         const exp = await original.call(base, args)
//         appEvents.emit(NotificationEventTypes.EXPENSE_CREATED, exp)
//         return exp
//       },
//     },
//   }
// })

// server/utils/prisma.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Add middleware for automatic notification creation
prisma.$use(async (params, next) => {
  const result = await next(params)

  // Handle bill creation
  if (params.model === 'Bill' && params.action === 'create') {
    try {
      await prisma.notification.create({
        data: {
          companyId: result.companyId,
          type: 'ORDER_RECEIVED',
          title: 'New Bill Created',
          message: `Bill #${result.invoiceNumber || 'N/A'} for ${result.grandTotal}`,
          actionPath: `/bills/${result.id}`,
          metadata: {
            billId: result.id,
            amount: result.grandTotal
          }
        }
      })
    } catch (error) {
      console.error('Failed to create notification:', error)
    }
  }

  // Handle expense creation (if needed)
  if (params.model === 'Expense' && params.action === 'create') {
    try {
      await prisma.notification.create({
        data: {
          companyId: result.companyId,
          type: 'EXPENSE_CREATED',
          title: 'New Expense Recorded',
          message: `Expense: ${result.description || 'N/A'} (${result.amount})`,
          actionPath: `/expenses/${result.id}`,
          metadata: {
            expenseId: result.id,
            amount: result.amount
          }
        }
      })
    } catch (error) {
      console.error('Failed to create notification:', error)
    }
  }

  return result
})

export { prisma }