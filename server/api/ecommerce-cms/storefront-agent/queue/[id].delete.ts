import { removeStorefrontQueuedMessage } from '~/server/utils/storefrontAgent'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const id = getRouterParam(event, 'id') || ''
  const conversationId = getQuery(event).conversationId?.toString().trim()
  if (!id || !conversationId) throw createError({ statusCode: 400, statusMessage: 'Invalid queued message' })
  return removeStorefrontQueuedMessage(session.data.companyId, conversationId, id)
})
