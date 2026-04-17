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

  const chat = await prisma.aiChat.findFirst({
    where: { id, companyId, userId },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      aiMessages: {
        select: {
          id: true,
          role: true,
          content: true,
          toolCalls: true,
          attachments: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!chat) {
    throw createError({ statusCode: 404, statusMessage: 'Chat not found' })
  }

  return { chat }
})
