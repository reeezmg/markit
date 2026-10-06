import { enhance } from '@zenstackhq/runtime' 
import { createEventHandler } from '@zenstackhq/server/nuxt';
import { prisma } from '~/server/prisma';
import type { UserRole } from '@prisma/client';
import { authorizedCompanyIds } from '~/server/utils/companyRequestScope';
import { scopeOrganizationModelReads } from '~/server/utils/organizationModelScope';

export default createEventHandler({
    getPrisma: async (event) => {
        const session = await useAuthSession(event);
        const client = enhance(
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
                transactionTimeout: 3000000, 
                transactionMaxWait: 3000000,
            }
        );
        return session.data.id
            ? scopeOrganizationModelReads(client, session.data.companyId, await authorizedCompanyIds(event))
            : client;
    },
});
