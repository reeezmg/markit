import {
  defineEventHandler,
  getQuery,
  readBody,
  setResponseStatus
} from 'h3'
import { handleWhatsAppInbound, handleWhatsAppMediaInbound } from '~/server/utils/whatsappAi'

const VERIFY_TOKEN = 'markit123'

async function sendWhatsAppText(to: string, body: string) {
  await $fetch(`https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    },
  })
}

function extractMediaMessage(msg: any) {
  const media = msg?.image ?? msg?.audio ?? msg?.document ?? msg?.video
  if (!media?.id) return null

  const kind = msg?.type === 'audio'
    ? 'audio'
    : msg?.type === 'image'
      ? 'image'
      : msg?.type === 'document'
        ? 'document'
        : msg?.type === 'video'
          ? 'video'
          : msg?.image
            ? 'image'
            : msg?.audio
              ? 'audio'
              : msg?.document
                ? 'document'
                : msg?.video
                  ? 'video'
                  : undefined

  if (!kind) return null

  return {
    mediaId: String(media.id),
    kind: kind as 'image' | 'audio' | 'document' | 'video',
    mimeType: String(media.mime_type ?? media.mimeType ?? ''),
    name: String(media.filename ?? media.fileName ?? media.caption ?? ''),
    caption: String(media.caption ?? msg?.caption ?? ''),
    duration: media.seconds ? Number(media.seconds) : undefined,
  }
}

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
      const entry = body.entry?.[0]
      const changes = entry?.changes?.[0]
      const value = changes?.value

      if (value?.messages) {
        for (const msg of value.messages) {
          const from = String(msg.from ?? '')
          const text = String(msg.text?.body ?? msg.body ?? '').trim()
          const media = extractMediaMessage(msg)
          const reply = text
            ? await handleWhatsAppInbound({ phone: from, text })
            : media
              ? await handleWhatsAppMediaInbound({
                  phone: from,
                  mediaId: media.mediaId,
                  kind: media.kind,
                  mimeType: media.mimeType || undefined,
                  name: media.name || undefined,
                  caption: media.caption || undefined,
                  duration: media.duration,
                })
              : { reply: 'Please send a text message, voice note, image, or PDF for now.', chatId: undefined }

          await sendWhatsAppText(from, reply.reply)
        }
      }
      if (value?.statuses) {
        return { received: true }
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
