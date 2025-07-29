import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {

const { fcmToken, userId, companyId, deviceId, deviceInfo } = await readBody(event)

if (!fcmToken || !userId || !deviceId) {
  throw createError({ statusCode: 400, message: 'Missing required fields' })
}

// Check if user+device exists
const existing = await prisma.pushToken.findUnique({
  where: {
    userId_deviceId: {
      userId,
      deviceId
    }
  }
})

if (!existing) {
  await prisma.pushToken.create({
    data: {
      userId,
      token: fcmToken,
      userAgent: deviceInfo?.userAgent || '',
      deviceId
    }
  })
} else if (existing.token !== fcmToken) {
  await prisma.pushToken.update({
    where: { id: existing.id },
    data: { token: fcmToken }
  })
}

})
