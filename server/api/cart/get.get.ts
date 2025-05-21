
import { prisma } from '~/server/utils/prisma'
export default defineEventHandler(async (event) => {
    const { companyId,clientId } = getQuery(event);
    // const session = await useAuthSession(event);
    // const userId = session.id
  
    const cart = await prisma.cartCompanyClient.findUnique({
      where: {
        clientId_companyId: {
          clientId: clientId?.toString() || '',
          companyId: companyId as string
        }
      },
      include: { cart: true }
    });
  
    return { items: cart?.cart?.items || [] };
  });