import { prisma } from '~/server/prisma';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const session = await useAuthSession(event);
  const {
    items,
    returnedItems,
    companyId,
  } = body;



  try {
    await prisma.$transaction(async (tx) => {
      
      // 1. Update stock & sold (for normal items)
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

      // 2. Update returned items (if any)
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
    },{
  maxWait: 1000000, // wait up to 10s to acquire a connection
  timeout: 150000000  // run the transaction for up to 15s
});

    return { success: true };

  } catch (error) {
   return sendError(event, createError({
      statusCode: 500,
      statusMessage: 'Failed to Create bill',
      data: { 
        message: error.message,
        data:{
              items,
              returnedItems,
              companyId,
        }
       }
    }))
  }
});
