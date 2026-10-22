import { getReadCompanyIds } from '~/server/utils/organizationReadScope';
import { prisma } from '~/server/prisma';

export default defineEventHandler(async (event) => {
  const companyIds = await getReadCompanyIds(event);
  const brands = await prisma.brand.findMany({
    where: { 
      status: true,
      companyId: { in: companyIds },
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })

  return brands.map(brand => ({ label: brand.name, value: brand.id }))
})
