
// import { prisma } from '~/server/utils/prisma'
// export default defineEventHandler(async (event) => {
//     const { companyId,clientId,items } = await readBody(event);

//     const cart = await prisma.cartCompanyClient.findUnique({
//       where: {
//         clientId_companyId: {
//           clientId: clientId,
//           companyId: companyId
//         }
//       }
//     });
  
//     if (!cart) throw createError({ statusCode: 404, message: 'Cart not found' });
  
//     console.log('cart update :',cart)
//     await prisma.cart.update({
//       where: { id: cart.cartId },
//       data: { items }
//     });
  
//     return { success: true };
//   });

import { prisma } from '~/server/utils/prisma';

export default defineEventHandler(async (event) => {
  const { companyId, clientId, items } = await readBody(event);
  
  // Validate input
  if (!companyId || !clientId || !Array.isArray(items)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid request body'
    });
  }

  try {
    // Find or create the cart
    const cart = await prisma.cartCompanyClient.upsert({
      where: {
        clientId_companyId: {
          clientId,
          companyId
        }
      },
      create: {
        client: { connect: { id: clientId } },
        company: { connect: { id: companyId } },
        cart: {
          create: { items }
        }
      },
      update: {
        cart: {
          update: { items }
        }
      },
      include: {
        cart: true
      }
    });

    console.log('Cart updated:', cart);
    return { success: true, cart };
    
  } catch (error) {
    console.error('Failed to update cart:', error);
    throw createError({
      statusCode: 500,
      message: 'Failed to update cart'
    });
  }
});