import {
  defineEventHandler,
  getQuery,
  readBody,
  setResponseStatus
} from 'h3'

const VERIFY_TOKEN = 'markit123'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method

  // ✅ VERIFY WEBHOOK (Meta setup step)
  if (method === 'GET') {
    const query = getQuery(event)

    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === VERIFY_TOKEN
    ) {
      console.log('✅ WEBHOOK VERIFIED')
      return query['hub.challenge']
    }

    console.log('❌ VERIFICATION FAILED')
    setResponseStatus(event, 403)
    return 'Verification failed'
  }

  // ✅ RECEIVE EVENTS (MAIN LOGIC)
  if (method === 'POST') {
    console.log('🔥 WEBHOOK HIT') // 👈 VERY IMPORTANT DEBUG

    try {
      const body = await readBody(event)

      console.log('📩 FULL WEBHOOK PAYLOAD:')
      console.log(JSON.stringify(body, null, 2))

      const entry = body?.entry?.[0]
      const changes = entry?.changes?.[0]
      const value = changes?.value

      // ================================
      // 📊 MESSAGE DELIVERY STATUS
      // ================================
      if (value?.statuses) {
        for (const status of value.statuses) {
          console.log('📊 STATUS UPDATE:')
          console.log({
            messageId: status.id,
            status: status.status, // sent, delivered, read, failed
            phone: status.recipient_id,
            timestamp: status.timestamp,
            errors: status.errors || null
          })
        }
      }

      // ================================
      // 📥 INCOMING USER MESSAGE
      // ================================
      if (value?.messages) {
        for (const msg of value.messages) {
          console.log('📥 INCOMING MESSAGE:')
          console.log({
            from: msg.from,
            id: msg.id,
            type: msg.type,
            text: msg.text?.body || null
          })
        }
      }

      // Always respond 200 to Meta
      return { success: true }
    } catch (err: any) {
      console.error('❌ WEBHOOK ERROR:')
      console.error(err?.message || err)

      setResponseStatus(event, 500)
      return { success: false }
    }
  }

  // ❌ Any other method
  setResponseStatus(event, 405)
  return 'Method Not Allowed'
})