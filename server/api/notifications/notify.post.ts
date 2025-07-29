// server/api/notifications/notify.post.ts
import { prisma } from '~/server/utils/prisma'
import { broadcastToCompany } from '~/server/ws/server'

const validTypes = ['BILL', 'EXPENSE','ORDER','LOW_STOCK'] as const;
type NotificationType = typeof validTypes[number];



export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!validTypes.includes(body.type as NotificationType)) {
    throw createError({ statusCode: 400,
        statusMessage: 'Invalid notification type'});
  }
  
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
    switch (body.type) {
        case 'BILL':
          notification = await prisma.notification.create({
            data: {
              user:{
                connect:{
                    id: body.userId
                }
              } ,
              company: {
                connect: {
                    id: body.companyId,
                },
            },
              type: 'BILL_CREATED',
              title: 'New Bill Created',
              message: `Bill #${body.invoiceNumber || 'N/A'} for ${body.amount}`,
              actionPath: `/erp/sales/`,
              metadata: {
                invoiceNo: body.invoiceNumber,
                amount: body.amount
              }
            }
          });
          break;
      
        case 'EXPENSE':
          notification = await prisma.notification.create({
            data: {
                user:{
                    connect:{
                        id: body.userId
                    }
                  } ,
                  company: {
                    connect: {
                        id: body.companyId,
                    },
                },
              type: 'EXPENSE_CREATED',
              title: 'New Expense Recorded',
              message: `Expense: ${body.expenseCategory || 'N/A'} Rs:${body.amount} \nNote :${body.Note}`,
              actionPath: `/erp/accounts/`,
              metadata: {
                expenseId: body.id,
                amount: body.amount
              }
            }
          });
          break;

          case 'ORDER':
          notification = await prisma.notification.create({
            data: {
              company: {
                connect: {
                    id: body.companyId,
                },
            },
              type: 'ORDER_RECEIVED',
              title: 'New Order Received',
              message: `ORDER #${body.invoiceNumber || 'N/A'} for ${body.amount}`,
              actionPath: `/erp/sales/`,
              metadata: {
                billId: body.id,
                amount: body.amount
              }
            }
          });
          break;

          case 'LOW_STOCK':
            const variant = await prisma.variant.findUnique({
              where: { id:body.variantId },
              include: { product: true }
            });
            if (!variant) {
              throw createError({
                statusCode: 404,
                statusMessage: 'Variant not found'
              });
            }
        
          
            notification = await prisma.notification.create({
              data: {
                  user:{
                      connect:{
                          id: body.userId
                      }
                    } ,
                    company: {
                      connect: {
                          id: body.companyId,
                      },
                  },
                type: 'INVENTORY_LOW',
                title: 'LOW STOCK',
                message: `Variant : ${variant.name || 'N/A'} is low on stock. Quantity left : ${variant.qty} `,
                actionPath: `/products`,
                metadata: {
                  variantId: variant.id,
                  productId: variant.product.id,
                  productName: variant.product.name,
                  variantName: variant.name
                }
              }
            });
            break;
      
        default:
          throw createError({
            statusCode: 400,
            statusMessage: 'Invalid notification type'
          });
      }

    // Broadcast to connected clients
      await fetch('http://localhost:3004/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        companyId: body.companyId,
        senderId: body.userId,
        notification
      })
    })

    return { success: true, notification }
  } catch (error) {
    console.error('Notification creation failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create notification'
    })
  }
})