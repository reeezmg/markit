import { steerStorefrontInteraction } from '~/server/utils/storefrontAgent'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const body = await readBody<{ conversationId?: string; content?: string }>(event)
  const conversationId = body.conversationId?.trim()
  const content = body.content?.trim()
  if (!conversationId || !content || content.length > 4000) throw createError({ statusCode: 400, statusMessage: 'Invalid steering message' })
  return steerStorefrontInteraction({ companyId: session.data.companyId, userId: session.data.id, conversationId, content })
})
