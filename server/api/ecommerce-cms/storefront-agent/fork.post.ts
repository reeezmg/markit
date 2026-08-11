import { forkStorefrontInteraction } from '~/server/utils/storefrontAgent'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const body = await readBody<{
    sourceConversationId?: string
    conversationId?: string
    interactionId?: string
  }>(event)
  const sourceConversationId = body?.sourceConversationId?.trim()
  const conversationId = body?.conversationId?.trim()
  const interactionId = body?.interactionId?.trim()
  const validConversation = (value?: string) => Boolean(value && /^[A-Za-z0-9_-]{8,100}$/.test(value))
  if (!validConversation(sourceConversationId) || !validConversation(conversationId)
    || sourceConversationId === conversationId
    || !interactionId || !/^int_[A-Za-z0-9_-]{8,100}$/.test(interactionId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid chat fork' })
  }
  return forkStorefrontInteraction({
    companyId: session.data.companyId,
    userId: session.data.id,
    sourceConversationId: sourceConversationId!,
    conversationId: conversationId!,
    interactionId,
  })
})
