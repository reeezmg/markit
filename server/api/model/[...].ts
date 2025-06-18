import { enhance } from '@zenstackhq/runtime' 
import { createEventHandler } from '@zenstackhq/server/nuxt';
import { prisma } from '~/server/prisma';
import { UserRole } from '@prisma/client';

export default createEventHandler({
    getPrisma: async (event) => {
        const session = await useAuthSession(event);
        return enhance(
            prisma,
            {
                user: session.data.id
                    ? {
                          id: session.data.id,
                          role: session.data.role as UserRole,
                      }
                    : undefined,
            },
            {
                transactionTimeout: 30000, 
                transactionMaxWait: 30000,
            }
        );
    },
});
