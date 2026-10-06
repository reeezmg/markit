import { getReadCompanyIds } from '~/server/utils/organizationReadScope';

export default defineEventHandler(async (event) => {
  const companyIds = await getReadCompanyIds(event);
  const categories = await prisma.category.findMany({
    where: { 
      status: true,
      companyId: { in: companyIds },
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })
  return categories
})
