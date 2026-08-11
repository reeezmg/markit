import { stopStorefrontInteraction } from '~/server/utils/storefrontAgent'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const body = await readBody<{ conversationId?: string }>(event)
  const conversationId = body?.conversationId?.trim()
  if (!conversationId || !/^[A-Za-z0-9_-]{8,100}$/.test(conversationId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid conversation' })
  }
  return stopStorefrontInteraction({
    companyId: session.data.companyId,
    userId: session.data.id,
    conversationId,
  })
})
