import { prisma } from '~/server/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const session = await useAuthSession(event)

  const { items, entriesToDelete, billPoints, billData } = body

  try {
    await prisma.$transaction(async (tx) => {
      /* --------------------------------
         1. Validate bill
      -------------------------------- */
      const bill = await tx.bill.findUnique({
        where: { id: billData.id }
      })
      if (!bill) throw new Error('Bill not found')

      /* --------------------------------
         2. Separate entries
      -------------------------------- */
      const itemsWithId = items.filter(i => i.entryId)
      const itemsWithoutId = items.filter(i => !i.entryId)

      /* --------------------------------
         3. Create new entries
      -------------------------------- */
      for (const item of itemsWithoutId) {
        await tx.entry.create({
          data: {
            company: {
              connect: { id: billData.companyId }
            },
            barcode: item.barcode || undefined,
            qty: item.qty || 1,
            rate: item.rate || 0,
            name: item.name || '',
            discount: item.discount || 0,
            tax: item.tax || 0,
            value: item.value || 0,
            return: item.return || false,

            ...(item.variantId?.trim() && {
              variant: { connect: { id: item.variantId.trim() } }
            }),

            ...(item.category?.[0]?.id?.trim() && {
              category: { connect: { id: item.category[0].id.trim() } }
            }),

            ...(item.id?.trim() && {
              item: { connect: { id: item.id.trim() } }
            }),

            ...(item.userId?.trim() && {
              companyUser: {
                connect: {
                  companyId_userId: {
                    companyId: billData.companyId,
                    userId: item.userId.trim()
                  }
                }
              },
              userName: item.user || ''
            }),

            bill: { connect: { id: billData.id } }
          }
        })
      }

      /* --------------------------------
         4. Update existing entries
      -------------------------------- */
      for (const item of itemsWithId) {
        await tx.entry.update({
          where: { id: item.entryId },
          data: {
             company: {
              connect: { id: billData.companyId }
            },
            barcode: item.barcode || undefined,
            qty: item.qty || 1,
            rate: item.rate || 0,
            name: item.name || '',
            discount: item.discount || 0,
            tax: item.tax || 0,
            value: item.value || 0,
            return: item.return || false,

            ...(item.variantId?.trim() && {
              variant: { connect: { id: item.variantId.trim() } }
            }),

            ...(item.category?.[0]?.id?.trim() && {
              category: { connect: { id: item.category[0].id.trim() } }
            }),

            ...(item.id?.trim() && {
              item: { connect: { id: item.id.trim() } }
            }),

            ...(item.userId?.trim() && {
              companyUser: {
                connect: {
                  companyId_userId: {
                    companyId: billData.companyId,
                    userId: item.userId.trim()
                  }
                }
              },
              userName: item.user || ''
            })
          }
        })
      }

      /* --------------------------------
         5. Stock adjust – new entries
      -------------------------------- */
      for (const item of itemsWithoutId) {
        if (!item.id) continue

        if (item.return) {
          await tx.item.update({
            where: { id: item.id },
            data: {
              soldQty: { decrement: item.qty },
              qty: { increment: item.qty }
            }
          })
        } else {
          await tx.item.update({
            where: { id: item.id },
            data: {
              soldQty: { increment: item.qty },
              qty: { decrement: item.qty }
            }
          })
        }
      }

      /* --------------------------------
         6. Stock adjust – deleted entries
      -------------------------------- */
      for (const item of entriesToDelete) {
        if (!item.itemId) continue

        if (item.return) {
          await tx.item.update({
            where: { id: item.itemId },
            data: {
              soldQty: { increment: item.qty },
              qty: { decrement: item.qty }
            }
          })
        } else {
          await tx.item.update({
            where: { id: item.itemId },
            data: {
              soldQty: { decrement: item.qty },
              qty: { increment: item.qty }
            }
          })
        }
      }

      /* --------------------------------
         7. Delete removed entries
      -------------------------------- */
      const entryIds = entriesToDelete.map(e => e.id).filter(Boolean)
      if (entryIds.length) {
        await tx.entry.deleteMany({
          where: { id: { in: entryIds } }
        })
      }

      /* --------------------------------
         8. Update bill
      -------------------------------- */
      await tx.bill.update({
        where: { id: billData.id },
        data: {
          subtotal: billData.subtotal,
          discount: billData.discount,
          grandTotal: billData.grandTotal,
          redeemedPoints: billData.redeemedPoints,
          couponValue: billData.couponValue,
          paymentMethod: billData.paymentMethod,
          paymentStatus: billData.paymentStatus,
          ...(billData.splitPayments && { splitPayments: billData.splitPayments }),

          ...(billData.clientId
            ? { client: { connect: { id: billData.clientId } } }
            : billData.clientId === ''
              ? { client: { disconnect: true } }
              : {}),

          ...(billData.accountId
            ? { account: { connect: { id: billData.accountId } } }
            : billData.accountId === ''
              ? { account: { disconnect: true } }
              : {}),

          createdAt: billData.date,
          company: { connect: { id: billData.companyId } }
        }
      })

     
    }, {
      maxWait: 10_0000,
      timeout: 15_0000
    })

    return { success: true }

  } catch (error) {
    await session.update({
      billCounter: session.data.billCounter - 1
    })

    return sendError(event, createError({
      statusCode: 500,
      statusMessage: 'Failed to update bill',
      data: {
        message: error.message,
        data: { items, entriesToDelete, billPoints, billData }
      }
    }))
  }
})
