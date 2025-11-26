
import { prisma } from '~/server/utils/prisma'
// export default defineEventHandler(async (event) => {
//     const { companyId,clientId } = getQuery(event);
//     // const session = await useAuthSession(event);
//     // const userId = session.id
  
//     const cart = await prisma.cartCompanyClient.findUnique({
//       where: {
//         clientId_companyId: {
//           clientId: clientId?.toString() || '',
//           companyId: companyId as string
//         }
//       },
//       include: { cart: true }
//     });
  
//     return { items: cart?.cart?.items || [] };
//   });

  // ~/server/api/cart/get.get.ts
export default defineEventHandler(async (event) => {
  const { companyId, clientId } = getQuery(event);
  
  if (!companyId || !clientId) {
    throw createError({ statusCode: 400, message: 'Missing parameters' });
  }

  const cart = await prisma.cartCompanyClient.findUnique({
    where: {
      clientId_companyId: {
        clientId: clientId.toString(),
        companyId: companyId.toString()
      }
    },
    include: { cart: true }
  });

  // Return empty array if no cart exists
  return { items: cart?.cart?.items || [] };
});