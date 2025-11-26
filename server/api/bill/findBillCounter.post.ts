import { prisma } from '~/server/prisma';

export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const body = await readBody(event);
    const { companyId, userId } = body;

      const res = await prisma.company.findUnique({        
        where: {
            id: companyId,
        }
        });

        console.log('res', res?.billCounter);

     await session.update({
        billCounter: res?.billCounter,
    });

   return res?.billCounter;
});
