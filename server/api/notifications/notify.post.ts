// server/api/notifications/notify.post.ts
import { prisma } from '~/server/utils/prisma'
import { broadcastToCompany } from '~/server/ws/server'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  
  // Validate required fields
  if (!body.type || !body.companyId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required fields'
    })
  }

  // Create notification based on type
  let notification
  try {
    if (body.type === 'BILL') {
      notification = await prisma.notification.create({
        data: {
          companyId: body.companyId,
          type: 'ORDER_RECEIVED',
          title: 'New Bill Created',
          message: `Bill #${body.invoiceNumber || 'N/A'} for ${body.amount}`,
          actionPath: `/bills/${body.id}`,
          metadata: {
            billId: body.id,
            amount: body.amount
          }
        }
      })
    } 
    else if (body.type === 'EXPENSE') {
      notification = await prisma.notification.create({
        data: {
          companyId: body.companyId,
          type: 'EXPENSE_CREATED',
          title: 'New Expense Recorded',
          message: `Expense: ${body.description || 'N/A'} (${body.amount})`,
          actionPath: `/expenses/${body.id}`,
          metadata: {
            expenseId: body.id,
            amount: body.amount
          }
        }
      })
    } else {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid notification type'
      })
    }

    // Broadcast to connected clients
    broadcastToCompany(body.companyId, notification)

    return { success: true, notification }
  } catch (error) {
    console.error('Notification creation failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create notification'
    })
  }
})