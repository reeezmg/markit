import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {

const session = await requireAuthSession(event)
const userId = session.data.id
if (!userId) {
  throw createError({ statusCode: 401, statusMessage: 'Not Authorized' })
}

const body = await readBody(event)
const fcmToken = typeof body?.fcmToken === 'string' ? body.fcmToken.trim() : ''
const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : ''
const deviceInfo = body?.deviceInfo

if (!fcmToken || !deviceId) {
  throw createError({ statusCode: 400, statusMessage: 'fcmToken and deviceId are required' })
}

await prisma.pushToken.upsert({
  where: {
    userId_deviceId: {
      userId,
      deviceId
    }
  },
    create: {
      userId,
      token: fcmToken,
      userAgent: typeof deviceInfo?.userAgent === 'string' ? deviceInfo.userAgent : '',
      deviceId
    },
    update: { token: fcmToken },
})

return { success: true }

})
