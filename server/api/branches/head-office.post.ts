import { prisma } from '~/server/prisma';

export default eventHandler(async (event) => {
  const session = await requireAuthSession(event);
  if (session.data.role !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Admin access required' });
  const membership = await prisma.companyUser.findUnique({
    where: { companyId_userId: { companyId: session.data.companyId, userId: session.data.id } },
  });
  if (!membership || membership.role !== 'admin' || !membership.status || membership.deleted) {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' });
  }
  const result = await prisma.company.updateMany({
    where: { id: session.data.companyId, parentCompanyId: null },
    data: { isHeadOffice: true },
  });
  if (!result.count) throw createError({ statusCode: 409, statusMessage: 'A branch cannot become a head office' });
  return { isHeadOffice: true };
});
