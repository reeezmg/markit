import { addStorefrontQueuedMessage } from '~/server/utils/storefrontAgent'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const body = await readBody<{ conversationId?: string; content?: string; id?: string; beforeId?: string; afterId?: string; images?: { url?: string; mimeType?: string; name?: string }[] }>(event)
  const conversationId = body.conversationId?.trim()
  const content = body.content?.trim()
  if (!conversationId || !content || content.length > 4000) throw createError({ statusCode: 400, statusMessage: 'Invalid queued message' })
  const imagePrefix = `https://images.markit.co.in/storefront-agent/${session.data.companyId}/${conversationId}/`
  const images = Array.isArray(body.images) ? body.images : []
  if (images.length > 4 || images.some(image => !image.url?.startsWith(imagePrefix) || !/^image\/(jpeg|png|webp|gif)$/.test(image.mimeType || ''))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid queued image' })
  }
  return addStorefrontQueuedMessage(session.data.companyId, conversationId, content, {
    id: body.id, beforeId: body.beforeId, afterId: body.afterId,
    images: images.map(image => ({ url: image.url!, mimeType: image.mimeType!, name: image.name?.slice(0, 120) })),
  })
})
