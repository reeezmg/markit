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

  // 1. Fetch all tokens
  const tokens = await prisma.pushToken.findMany({
    where: {
      companyId,
      deviceId: { not: excludeDeviceId }
    },
    select: { token: true }
  })

  const registrationTokens = tokens.map(t => t.token).filter(Boolean)

  if (!registrationTokens.length) {
    return { success: false, message: 'No devices to notify' }
  }

  // 2. Create OAuth access token
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

  // 3. Send one-by-one (v1 API doesn't support batch)
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
          notification: {
            title,
            body: msgBody
          },
          android: { priority: 'high' },
          webpush: {
            headers: { Urgency: 'high' },
            notification: {
              icon: '/icons/icon-192.png'
            }
          }
        }
      })
    })

    const json = await res.json()
    results.push({ token, status: res.status, response: json })
  }

  return { success: true, sent: results }
})
