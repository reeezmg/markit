const enhancePath = process.env.ENHANCE_PATH!;
const { enhance } = await import(enhancePath);
import { createEventHandler } from '@zenstackhq/server/nuxt';
import { prisma } from '~/server/prisma';
import { UserRole } from '~/prisma/generated/client';

export default createEventHandler({
    getPrisma: async (event) => {
        const session = await useAuthSession(event);
        return enhance(prisma, {
            user: session.data.id ? { 
                id: session.data.id,
                role: session.data.role as UserRole 
            } : undefined,
        });
    },
});