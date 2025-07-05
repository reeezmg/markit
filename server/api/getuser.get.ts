import { prisma } from '~/server/prisma'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const companyId = query.companyId as string
console.log(companyId)
  if (!companyId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing companyId in query',
    })
  }

  const users = await prisma.companyUser.findMany({
    where: {
      companyId,
    },
    select: {
      userId: true,
      code: true,
      name: true,
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

  return users.map((u) => ({
    id: u.userId,
    code: u.code,
    name: u.name,
    email: u.user.email,
    image: u.user.image,
  }))
})
