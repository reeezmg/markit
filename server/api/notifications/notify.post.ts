// server/api/notifications/notify.post.ts
import { prisma } from '~/server/utils/prisma'
import { assertCompanyAccess } from '~/server/utils/companyRequestScope'

const validTypes = ['BILL', 'EXPENSE','ORDER','LOW_STOCK'] as const;
type NotificationType = typeof validTypes[number];



export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const body = await readBody(event)
  await assertCompanyAccess(event, body.companyId)
  body.userId = session.data.id

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
            const variant = await prisma.variant.findFirst({
              where: { id: body.variantId, companyId: body.companyId },
              include: { product: true, items: { select: { qty: true } } }
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
                message: `Variant : ${variant.name || 'N/A'} is low on stock. Quantity left : ${variant.items.reduce((sum, item) => sum + (item.qty ?? 0), 0)} `,
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

    return { success: true, notification }
  } catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Notification creation failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create notification'
    })
  }
})
