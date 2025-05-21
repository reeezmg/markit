
import { prisma } from '~/server/utils/prisma'
export default defineEventHandler(async (event) => {
    const { companyId,clientId,items } = await readBody(event);

    const cart = await prisma.cartCompanyClient.findUnique({
      where: {
        clientId_companyId: {
          clientId: clientId,
          companyId: companyId
        }
      }
    });
  
    if (!cart) throw createError({ statusCode: 404, message: 'Cart not found' });
  
    console.log('cart update :',cart)
    await prisma.cart.update({
      where: { id: cart.cartId },
      data: { items }
    });
  
    return { success: true };
  });