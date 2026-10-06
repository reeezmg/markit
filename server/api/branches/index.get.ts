import { prisma } from '~/server/prisma';

export default eventHandler(async (event) => {
  const session = await requireAuthSession(event);
  const company = await prisma.company.findUnique({
    where: { id: session.data.companyId },
    select: {
      id: true, name: true, isHeadOffice: true, parentCompanyId: true,
      branches: {
        select: { id: true, name: true, status: true, phone: true, address: { select: { city: true, state: true } } },
        orderBy: { name: 'asc' },
      },
    },
  });
  if (!company) throw createError({ statusCode: 404, statusMessage: 'Company not found' });
  return company;
});
