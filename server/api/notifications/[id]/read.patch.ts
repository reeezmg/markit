// server\api\notifications\[id]\read.patch.ts
import { defineEventHandler, getRouterParam } from 'h3'
import { prisma } from '~/server/utils/prisma'
import { getReadCompanyId } from '~/server/utils/organizationReadScope'

export default defineEventHandler(async (event) => {
  const companyId = await getReadCompanyId(event)
  const id = getRouterParam(event, 'id')
  if (!id) return

  await prisma.notification.updateMany({
    where: { id, companyId },
    data: { read: true }
  })

  return { success: true }
})
