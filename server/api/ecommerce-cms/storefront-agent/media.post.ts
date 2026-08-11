import crypto from 'node:crypto'
import { uploadToR2 } from '~/server/utils/r2'

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const body = await readBody<{
    conversationId?: string
    images?: { data?: string; mimeType?: string; name?: string }[]
  }>(event)
  const conversationId = body?.conversationId?.trim()
  if (!conversationId || !/^[A-Za-z0-9_-]{8,100}$/.test(conversationId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid conversation' })
  }
  const images = Array.isArray(body.images) ? body.images : []
  if (!images.length || images.length > 4 || images.some(image =>
    !image.mimeType || !IMAGE_EXTENSIONS[image.mimeType] || !image.data || image.data.length > 8_000_000
  )) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid image attachment' })
  }

  const uploaded = await Promise.all(images.map(async (image) => {
    const key = `storefront-agent/${session.data.companyId}/${conversationId}/${crypto.randomUUID()}${IMAGE_EXTENSIONS[image.mimeType!]}`
    return {
      url: await uploadToR2(image.data!, key, image.mimeType!),
      mimeType: image.mimeType!,
      name: image.name?.slice(0, 120) || undefined,
    }
  }))

  return { uploaded }
})
