import { listStorefrontQueuedMessages } from '~/server/utils/storefrontAgent'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const conversationId = getQuery(event).conversationId?.toString().trim()
  if (!conversationId) throw createError({ statusCode: 400, statusMessage: 'Invalid conversation' })
  return listStorefrontQueuedMessages(session.data.companyId, conversationId)
})
