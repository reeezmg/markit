import {
  defineEventHandler,
  getQuery,
  readBody,
  setResponseStatus
} from 'h3'

const VERIFY_TOKEN = 'markit123'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method

  // ✅ VERIFY WEBHOOK (already done, keep it)
  if (method === 'GET') {
    const query = getQuery(event)

    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === VERIFY_TOKEN
    ) {
      return query['hub.challenge']
    }

    setResponseStatus(event, 403)
    return 'Verification failed'
  }

  // ✅ RECEIVE EVENTS (THIS IS THE IMPORTANT PART)
  if (method === 'POST') {
    const body = await readBody(event)

    console.log('📩 FULL WEBHOOK:', JSON.stringify(body, null, 2))

    try {
      const entry = body.entry?.[0]
      const changes = entry?.changes?.[0]
      const value = changes?.value

      // 🔥 MESSAGE DELIVERY STATUS
      if (value?.statuses) {
        for (const status of value.statuses) {
          console.log('📊 STATUS UPDATE:', {
            messageId: status.id,
            status: status.status, // sent, delivered, read, failed
            phone: status.recipient_id,
            time: status.timestamp,
            errors: status.errors || null
          })
        }
      }

      // 🔥 INCOMING USER MESSAGE (optional)
      if (value?.messages) {
        for (const msg of value.messages) {
          console.log('📥 INCOMING MESSAGE:', msg)
        }
      }

      return { received: true }
    } catch (err) {
      console.error('❌ Webhook Error:', err)
      return { error: true }
    }
  }
})