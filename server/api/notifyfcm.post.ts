// ~/server/api/notify-company.ts
import { defineEventHandler, readBody } from 'h3'
import { prisma } from '~/server/utils/prisma'
import { GoogleAuth } from 'google-auth-library'

const projectId = process.env.GOOGLE_PROJECT_ID
const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { companyId, excludeDeviceId, title, body: msgBody } = body

  if (!companyId || !title || !msgBody) {
    throw createError({ statusCode: 400, message: 'Missing required fields' })
  }

  // 1. Get all userIds for the company
  const companyUsers = await prisma.companyUser.findMany({
    where: { 
      companyId,
      role:'admin'
     },
    select: { userId: true }
  })

  const userIds = companyUsers.map(cu => cu.userId)

  if (!userIds.length) {
    return { success: false, message: 'No users in company' }
  }

  // 2. Fetch all push tokens for those users (excluding specific device if needed)
  const tokens = await prisma.pushToken.findMany({
    where: {
      userId: { in: userIds },
      ...(excludeDeviceId && {
        deviceId: { not: excludeDeviceId }
      })
    },
    select: { token: true }
  })

  const registrationTokens = tokens.map(t => t.token).filter(Boolean)

  if (!registrationTokens.length) {
    return { success: false, message: 'No devices to notify' }
  }

  // 3. Create OAuth access token
  const auth = new GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey
    },
    scopes: ['https://www.googleapis.com/auth/firebase.messaging']
  })

  const client = await auth.getClient()
  const accessToken = await client.getAccessToken()

  const results = []

  // 4. Send notifications one-by-one
  for (const token of registrationTokens) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          token,
          data: {
            title,
            body: msgBody,
            url: '/' // optional
          },
          android: { priority: 'high' },
          webpush: {
            headers: { Urgency: 'high' }
          }
        }
      })
    })

    const json = await res.json()
    results.push({ token, status: res.status, response: json })
  }

  return { success: true, sent: results }
})
