import { defineEventHandler, createError } from 'h3'
import { prisma } from '~/server/prisma'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  const userId = session.data?.id as string | undefined

  if (!companyId || !userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const chat = await prisma.aiChat.create({
    data: { companyId, userId },
    select: { id: true, title: true, updatedAt: true },
  })

  return { chat }
})
