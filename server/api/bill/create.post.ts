import { prisma } from '~/server/prisma';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const session = await useAuthSession(event);
  const {
    payload,
    items,
    returnedItems,
    billPoints,
    clientId,
    companyId,
    userId,
    tokenEntries
  } = body;

   await session.update({
        billCounter:session.data.billCounter + 1,
    });

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Create Bill with Entries
      await tx.bill.create({
        data: payload
      });

      // 2. Update client points (if clientId exists)
      if (clientId) {
        await tx.companyClient.update({
          where: {
            companyId_clientId: {
              companyId,
              clientId
            }
          },
          data: {
            points: { increment: billPoints }
          }
        });
      }

      // 3. Update stock & sold (for normal items)
      for (const item of items) {
        if ((item.barcode && !item.return) || (!item.barcode && item.variantId && !item.return)) {
          if (item.variantId) {
            await tx.variant.update({
              where: { id: item.variantId },
              data: { sold: { increment: item.qty } }
            });
          }

          if (item.id) {
            await tx.item.update({
              where: { id: item.id },
              data: { qty: { decrement: item.qty } }
            });
          }
        }
      }

      // 4. Update returned items (if any)
      for (const item of returnedItems) {
        if (item.variantId) {
          await tx.variant.update({
            where: { id: item.variantId },
            data: { sold: { decrement: item.qty } }
          });
        }

        if (item.id) {
          await tx.item.update({
            where: { id: item.id },
            data: { qty: { increment: item.qty } }
          });
        }
      }

      // 5. Delete token entries
      if (tokenEntries.length > 0) {
        await tx.tokenEntry.deleteMany({
          where: {
            tokenNo: {
              in: tokenEntries.filter((t: string) => t.trim() !== '')
            }
          }
        });
      }

    await tx.companyUser.update({        
        where: {
            companyId_userId: {
            companyId,
            userId,
            },
        },
        data: {
            billCounter: {
            increment: 1,
            },
        },
        });
    },{
  maxWait: 10000, // wait up to 10s to acquire a connection
  timeout: 15000000  // run the transaction for up to 15s
});

    return { success: true };

  } catch (error) {
    console.log('session', session.data.billCounter);
     await session.update({
        billCounter:session.data.billCounter - 1,
    });
   return sendError(event, createError({
      statusCode: 500,
      statusMessage: 'Failed to Create bill',
      data: { 
        message: error.message,
        data:{
              payload,
              items,
              returnedItems,
              billPoints,
              clientId,
              companyId,
              userId,
              tokenEntries
        }
       }
    }))
  }
});
