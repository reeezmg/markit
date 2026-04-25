import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
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

  const client = await pool.connect()
  try {
    const companyUsersRes = await client.query(
      `
      SELECT user_id
      FROM company_users
      WHERE company_id = $1
        AND role = 'admin'
      `,
      [companyId]
    )

    const userIds = companyUsersRes.rows.map((row) => row.user_id).filter(Boolean)
    if (!userIds.length) {
      return { success: false, message: 'No users in company' }
    }

    const tokensRes = excludeDeviceId
      ? await client.query(
          `
          SELECT token
          FROM push_token
          WHERE user_id = ANY($1::text[])
            AND device_id <> $2
          `,
          [userIds, excludeDeviceId]
        )
      : await client.query(
          `
          SELECT token
          FROM push_token
          WHERE user_id = ANY($1::text[])
          `,
          [userIds]
        )

    const registrationTokens = tokensRes.rows
      .map((row) => row.token)
      .filter((token): token is string => Boolean(token))

    if (!registrationTokens.length) {
      return { success: false, message: 'No devices to notify' }
    }

    if (!projectId || !clientEmail || !privateKey) {
      return { success: false, message: 'FCM credentials are not configured' }
    }

    const auth = new GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    })

    const googleClient = await auth.getClient()
    const accessToken = await googleClient.getAccessToken()

    const results = []
    for (const token of registrationTokens) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            data: {
              title,
              body: msgBody,
              url: '/',
            },
            android: { priority: 'high' },
            webpush: {
              headers: { Urgency: 'high' },
            },
          },
        }),
      })

      const json = await res.json()
      results.push({ token, status: res.status, response: json })
    }

    return { success: true, sent: results }
  } catch (error: any) {
    console.error('notifyfcm failed:', error?.message || error)
    return {
      success: false,
      message: error?.message || 'Failed to send notification',
    }
  } finally {
    client.release()
  }
})
