import { prisma } from '~/server/prisma';

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event);

  const company = await prisma.company.findUnique({
    where: { id: session.data.companyId },
    select: { salesOrderCounter: true, salesOrderPrefix: true },
  });

  if (!company) {
    throw createError({ statusCode: 404, statusMessage: 'Company not found' });
  }

  const num = String(company.salesOrderCounter).padStart(5, '0');
  const prefix = company.salesOrderPrefix || 'SO';
  return { orderNumber: prefix ? `${prefix}-${num}` : num };
});
