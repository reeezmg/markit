import { prisma } from '~/server/prisma';

export default eventHandler(async (event) => {
    const session = await useAuthSession(event);

      const res = await prisma.purchaseOrder.create({        
       data:{
            company: {
            connect: { id: session.data.companyId },
                    },
                },
                select: { id: true }
            })


        console.log('res', res);

 

   return res;
});
