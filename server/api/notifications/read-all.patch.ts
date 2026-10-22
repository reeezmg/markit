// server\api\notifications\read-all.patch.ts
import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '~/server/utils/prisma'
import { getReadCompanyId } from '~/server/utils/organizationReadScope'

export default defineEventHandler(async (event) => {
  const companyId = await getReadCompanyId(event)
  if (!companyId || typeof companyId !== 'string') return

  await prisma.notification.updateMany({
    where: { companyId, read: false },
    data: { read: true }
  })

  return { success: true }
})
