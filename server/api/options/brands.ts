import { getReadCompanyIds } from '~/server/utils/organizationReadScope';

export default defineEventHandler(async (event) => {
  const companyIds = await getReadCompanyIds(event);
  const brands = await prisma.product.findMany({
    where: { 
      status: true,
      companyId: { in: companyIds },
    },
    select: { brand: true },
    distinct: ['brand'],
    orderBy: { brand: 'asc' }
  })

  return brands
    .map(b => b.brand)
    .filter(Boolean)
    .map(brand => ({ label: brand, value: brand }))
})
