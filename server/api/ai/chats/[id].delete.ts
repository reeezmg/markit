import { defineEventHandler, createError, getRouterParam } from 'h3'
import { prisma } from '~/server/prisma'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  const userId = session.data?.id as string | undefined

  if (!companyId || !userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Chat ID is required' })
  }

  // Verify ownership before deleting
  const chat = await prisma.aiChat.findFirst({
    where: { id, companyId, userId },
    select: { id: true },
  })

  if (!chat) {
    throw createError({ statusCode: 404, statusMessage: 'Chat not found' })
  }

  await prisma.aiChat.delete({ where: { id } })

  return { success: true }
})
