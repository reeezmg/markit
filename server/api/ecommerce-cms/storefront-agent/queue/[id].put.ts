import { updateStorefrontQueuedMessage } from '~/server/utils/storefrontAgent'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const id = getRouterParam(event, 'id') || ''
  const body = await readBody<{ conversationId?: string; content?: string }>(event)
  const conversationId = body.conversationId?.trim()
  const content = body.content?.trim()
  if (!id || !conversationId || !content || content.length > 4000) throw createError({ statusCode: 400, statusMessage: 'Invalid queued message' })
  return updateStorefrontQueuedMessage(session.data.companyId, conversationId, id, content)
})
