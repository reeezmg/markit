import { loadStorefrontAgentSession } from '~/server/utils/storefrontAgent'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const conversationId = getQuery(event).conversationId?.toString().trim()
  if (!conversationId || !/^[A-Za-z0-9_-]{8,100}$/.test(conversationId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid conversation' })
  }
  return loadStorefrontAgentSession(session.data.companyId, conversationId)
})
