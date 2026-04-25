import { prisma } from '~/server/prisma';

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event);

  const company = await prisma.company.findUnique({
    where: { id: session.data.companyId },
    select: { accountCounter: true, accountPrefix: true },
  });

  if (!company) {
    throw createError({ statusCode: 404, statusMessage: 'Company not found' });
  }

  const prefix = company.accountPrefix || 'ACC';
  return { accountNumber: prefix ? `${prefix}-${company.accountCounter}` : company.accountCounter };
});
