import { prisma } from '~/server/prisma';

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event);

  const company = await prisma.company.findUnique({
    where: { id: session.data.companyId },
    select: { clientCounter: true, clientPrefix: true },
  });

  if (!company) {
    throw createError({ statusCode: 404, statusMessage: 'Company not found' });
  }

  const prefix = company.clientPrefix || 'CL';
  return { clientNumber: prefix ? `${prefix}-${company.clientCounter}` : company.clientCounter };
});
