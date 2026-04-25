import { prisma } from '~/server/prisma';

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event);

  const company = await prisma.company.findUnique({
    where: { id: session.data.companyId },
    select: { expenseCounter: true, expensePrefix: true },
  });

  if (!company) {
    throw createError({ statusCode: 404, statusMessage: 'Company not found' });
  }

  const prefix = company.expensePrefix || 'EXP';
  return { expenseNumber: prefix ? `${prefix}-${company.expenseCounter}` : company.expenseCounter };
});
