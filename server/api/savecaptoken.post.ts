import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {

const { token, userId, companyId, deviceId, deviceInfo } = await readBody(event)

if (!token || !userId || !deviceId) {
  throw createError({ statusCode: 400, message: 'Missing required fields' })
}

// Check if user+device exists
const existing = await prisma.capPushToken.findUnique({
  where: {
    userId_deviceId: {
      userId,
      deviceId
    }
  }
})

if (!existing) {
  await prisma.capPushToken.create({
    data: {
      userId,
      token: token,
      userAgent: deviceInfo?.userAgent || '',
      deviceId
    }
  })
} else if (existing.token !== token) {
  await prisma.capPushToken.update({
    where: { id: existing.id },
    data: { token: token }
  })
}

})
