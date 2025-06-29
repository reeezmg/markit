import { defineEventHandler, createError } from 'h3'
import { prisma } from '~/server/prisma'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)

  if (!session?.data?.companyId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized: Company ID missing in session',
    })
  }

  const users = await prisma.companyUser.findMany({
    where: {
      companyId: session.data.companyId,
    },
    select: {
      userId: true,
      code: true,
      name: true, // include name if needed
      user: {
        select: {
          email: true,
          image: true,
        },
      },
    },
  })

  if (!users || users.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No users found for this company',
    })
  }

  // Flatten response if needed
  return users.map((u) => ({
    id: u.userId,
    shortCut: u.code,
    name: u.name,
    email: u.user.email,
    image: u.user.image,
  }))
})
