import { getReadCompanyIds } from '~/server/utils/organizationReadScope';

export default defineEventHandler(async (event) => {
  const companyIds = await getReadCompanyIds(event);
  const distributors = await prisma.distributor.findMany({
    where: { 
      status: true,
      companies:{
        some:{companyId: { in: companyIds }}
      }
      
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })

  return distributors
})
