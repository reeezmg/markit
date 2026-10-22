// server\api\notifications\index.get.ts
import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '~/server/utils/prisma'
import { getReadCompanyId } from '~/server/utils/organizationReadScope'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const companyId = await getReadCompanyId(event)
  const userId = session.data.id
  
  if (!companyId || typeof companyId !== 'string') {
    return []
  }
  if (!userId || typeof userId !== 'string') {
    return []
  }
  return await prisma.notification.findMany({
      where: {
        companyId,
        NOT: {
          userId: userId
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    })

})
