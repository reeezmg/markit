// server\api\notifications\index.get.ts
import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const { companyId } = getQuery(event)
  if (!companyId || typeof companyId !== 'string') {
    return []
  }

  return await prisma.notification.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: 50
  })
})
