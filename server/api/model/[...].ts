import { createEventHandler } from '@zenstackhq/server/nuxt';
import { prisma } from '~/server/prisma';
import { UserRole } from '@prisma/client';
import { useAuthSession } from '~/server/auth'; // Assuming this is defined in your project

export default createEventHandler({
    getPrisma: async (event) => {
        const session = await useAuthSession(event);

        // ✅ Dynamic import moved inside the async context
        const { enhance } = await import(process.env.ENHANCE_PATH || '@zenstackhq/runtime');

        return enhance(
            prisma,
            session.data.id
                ? {
                      user: {
                          id: session.data.id,
                          role: session.data.role as UserRole,
                      },
                  }
                : undefined,
            {
                transactionTimeout: 30000,
                transactionMaxWait: 30000,
            }
        );
    },
});
