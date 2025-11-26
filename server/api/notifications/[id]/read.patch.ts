// server\api\notifications\[id]\read.patch.ts
import { defineEventHandler, getRouterParam } from 'h3'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) return

  await prisma.notification.update({
    where: { id },
    data: { read: true }
  })

  return { success: true }
})
