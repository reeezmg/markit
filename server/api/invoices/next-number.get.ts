import { prisma } from '~/server/prisma';

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event);

  const company = await prisma.company.findUnique({
    where: { id: session.data.companyId },
    select: { invoiceCounter: true, invoicePrefix: true },
  });

  if (!company) {
    throw createError({ statusCode: 404, statusMessage: 'Company not found' });
  }

  const num = String(company.invoiceCounter).padStart(6, '0');
  const prefix = company.invoicePrefix || 'INV';
  return { invoiceCode: prefix ? `${prefix}-${num}` : num };
});
