import { reorderStorefrontQueuedMessages } from '~/server/utils/storefrontAgent'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const body = await readBody<{ conversationId?: string; ids?: string[] }>(event)
  const conversationId = body.conversationId?.trim()
  const ids = Array.isArray(body.ids) ? body.ids : []
  if (!conversationId || ids.length > 100 || ids.some(id => !/^[0-9a-f-]{36}$/i.test(id))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid queue order' })
  }
  return reorderStorefrontQueuedMessages(session.data.companyId, conversationId, ids)
})
