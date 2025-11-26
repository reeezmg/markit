import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const { companyId, clientId } = getQuery(event)
  
  if (!companyId || !clientId) {
    throw createError({ statusCode: 400, message: 'Missing parameters' })
  }

  const likeRecord = await prisma.likeCompanyClient.findUnique({
    where: {
      clientId_companyId: {
        clientId: clientId.toString(),
        companyId: companyId.toString()
      }
    },
    include: { 
      like: {
        select: {
          variantIds: true
        }
      } 
    }
  })

  // Return empty array if no likes exist
  return { items: likeRecord?.like?.variantIds || [] }
})