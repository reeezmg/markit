import { undoStorefrontInteraction } from '~/server/utils/storefrontAgent'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const body = await readBody<{ conversationId?: string; interactionId?: string }>(event)
  const conversationId = body?.conversationId?.trim()
  const interactionId = body?.interactionId?.trim()
  if (!conversationId || !/^[A-Za-z0-9_-]{8,100}$/.test(conversationId)
    || !interactionId || !/^int_[A-Za-z0-9_-]{8,100}$/.test(interactionId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid task checkpoint' })
  }
  return undoStorefrontInteraction({
    companyId: session.data.companyId,
    userId: session.data.id,
    conversationId,
    interactionId,
  })
})
