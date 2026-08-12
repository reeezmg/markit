import { shouldAutoPlanStorefrontTask, startStorefrontInteraction } from '~/server/utils/storefrontAgent'
import { uploadToR2 } from '~/server/utils/r2'

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

export default defineEventHandler(async (event) => {
  const requestStartedAt = Date.now()
  const session = await requireAuthSession(event)
  const body = await readBody<{
    conversationId?: string
    prompt?: string
    displayPrompt?: string
    model?: string
    runMode?: 'normal' | 'plan' | 'refine-plan' | 'execute-plan' | 'cancel-plan'
    images?: { mimeType?: string; data?: string; name?: string }[]
    existingImages?: { url?: string; mimeType?: string; name?: string }[]
  }>(event)
  const conversationId = body?.conversationId?.trim()
  const prompt = body?.prompt?.trim()
  const displayPrompt = body?.displayPrompt?.trim()
  if (!conversationId || !/^[A-Za-z0-9_-]{8,100}$/.test(conversationId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid conversation' })
  }
  if (!prompt || prompt.length > 12000) {
    throw createError({ statusCode: 400, statusMessage: 'Prompt must be between 1 and 12000 characters' })
  }
  if (!displayPrompt || displayPrompt.length > 4000) {
    throw createError({ statusCode: 400, statusMessage: 'Chat message must be between 1 and 4000 characters' })
  }
  const images = Array.isArray(body.images) ? body.images : []
  if (images.length > 4 || images.some(image =>
    !image.mimeType || !IMAGE_EXTENSIONS[image.mimeType] || !image.data || image.data.length > 8_000_000
  )) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid image attachment' })
  }
  const imagePrefix = `https://images.markit.co.in/storefront-agent/${session.data.companyId}/${conversationId}/`
  const existingImages = Array.isArray(body.existingImages) ? body.existingImages : []
  if (images.length + existingImages.length > 4 || existingImages.some(image =>
    !image.url?.startsWith(imagePrefix) || !image.mimeType || !IMAGE_EXTENSIONS[image.mimeType]
  )) throw createError({ statusCode: 400, statusMessage: 'Invalid existing image attachment' })
  const restoredImages = await Promise.all(existingImages.map(async (image) => {
    const response = await fetch(image.url!)
    if (!response.ok) throw createError({ statusCode: 409, statusMessage: 'A queued image is no longer available' })
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > 6_000_000) throw createError({ statusCode: 400, statusMessage: 'Queued image is too large' })
    return { data: bytes.toString('base64'), mimeType: image.mimeType!, name: image.name?.slice(0, 120) }
  }))
  const runtimeImages = [...images.map(image => ({ data: image.data!, mimeType: image.mimeType!, name: image.name })), ...restoredImages]
  // Shape-check only. The sandbox validates the key against its own list and
  // rejects an unknown one, so we don't duplicate the model list here.
  const model = body?.model?.trim()
  if (model && !(/^[a-z0-9.\-]{1,40}$/.test(model) || /^byok:[0-9a-f-]{36}$/i.test(model))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid model' })
  }
  const requestedRunMode = body?.runMode
  if (requestedRunMode && !['normal', 'plan', 'refine-plan', 'execute-plan', 'cancel-plan'].includes(requestedRunMode)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid run mode' })
  }
  const autoPlanned = !requestedRunMode && shouldAutoPlanStorefrontTask(displayPrompt)
  const runMode = requestedRunMode || (autoPlanned ? 'plan' : 'normal')

  const uploadedImages = await Promise.all(images.map(async (image) => {
    const mimeType = image.mimeType!
    const key = `storefront-agent/${session.data.companyId}/${conversationId}/${crypto.randomUUID()}${IMAGE_EXTENSIONS[mimeType] || ''}`
    return {
      url: await uploadToR2(image.data!, key, mimeType),
      mimeType,
      name: image.name?.slice(0, 120),
    }
  }))
  const imageAttachments = [
    ...uploadedImages,
    ...existingImages.map(image => ({ url: image.url!, mimeType: image.mimeType!, name: image.name?.slice(0, 120) })),
  ]

  const result = await startStorefrontInteraction({
    runtime: useRuntimeConfig(event),
    companyId: session.data.companyId,
    userId: session.data.id,
    conversationId,
    prompt,
    displayPrompt,
    model,
    runMode,
    autoPlanned,
    images: runtimeImages.map(image => ({ mimeType: image.mimeType, data: image.data })),
    imageAttachments: imageAttachments.map(image => ({ url: image.url!, mimeType: image.mimeType!, name: image.name })),
    requestStartedAt,
  })
  return { ...result, uploaded: imageAttachments }
})
