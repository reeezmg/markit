// server\api\notifications\index.get.ts
import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const { companyId,userId } = getQuery(event)
  
  if (!companyId || typeof companyId !== 'string') {
    return []
  }
  if (!userId || typeof userId !== 'string') {
    return []
  }
console.log(userId)
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
