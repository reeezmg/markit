// server\api\notifications\read-all.patch.ts
import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const { companyId } = getQuery(event)
  if (!companyId || typeof companyId !== 'string') return

  await prisma.notification.updateMany({
    where: { companyId, read: false },
    data: { read: true }
  })

  return { success: true }
})
