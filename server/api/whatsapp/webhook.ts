import {
  defineEventHandler,
  getQuery,
  readBody,
  setResponseStatus
} from 'h3'

const VERIFY_TOKEN = 'markit123'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method

  // ✅ VERIFY WEBHOOK
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

  // ✅ HANDLE EVENTS
  if (method === 'POST') {
    try {
      const body = await readBody(event)

      console.log('🔥 WEBHOOK HIT')
      console.log('📩 FULL WEBHOOK:', JSON.stringify(body, null, 2))

      const entry = body.entry?.[0]
      const changes = entry?.changes?.[0]
      const value = changes?.value

      // ============================
      // 📥 INCOMING MESSAGE
      // ============================
      if (value?.messages) {
        for (const msg of value.messages) {
          const from = msg.from // user phone

          console.log('📥 INCOMING MESSAGE FROM:', from)

          // 🚀 AUTO REPLY "Hi"
          await $fetch(
            `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: {
                messaging_product: 'whatsapp',
                to: from,
                type: 'text',
                text: {
                  body: 'Please contact store for any queries regarding your Invoice. Thank you for shopping!'
                }
              }
            }
          )

          console.log('✅ Auto reply sent to:', from)
        }
      }

      // ============================
      // 📊 STATUS UPDATES
      // ============================
      if (value?.statuses) {
        for (const status of value.statuses) {
          console.log('📊 STATUS UPDATE:', {
            messageId: status.id,
            status: status.status,
            phone: status.recipient_id,
            time: status.timestamp,
            errors: status.errors || null
          })
        }
      }

      return { received: true }
    } catch (err: any) {
      console.error('❌ Webhook Error:', err?.data || err.message)
      setResponseStatus(event, 500)
      return { error: true }
    }
  }

  setResponseStatus(event, 405)
  return 'Method Not Allowed'
})