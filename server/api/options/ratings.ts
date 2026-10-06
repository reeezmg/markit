import { getReadCompanyIds } from '~/server/utils/organizationReadScope';

export default defineEventHandler(async (event) => {
  const companyIds = await getReadCompanyIds(event);
  const ratings = await prisma.product.findMany({
     where: { 
      status: true,
      companyId: { in: companyIds },
    },
    select: { rating: true },
    distinct: ['rating'],
    orderBy: { rating: 'asc' }
  })

  return ratings
    .map(r => r.rating)
    .filter(r => r !== null)
    .map(rating => ({ label: rating.toString(), value: rating.toString() }))
})
