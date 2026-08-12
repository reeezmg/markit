import { getR2UploadUrl } from '~/server/utils/r2'

/**
 * Issues a presigned PUT URL for a direct browser → R2 upload.
 * Used for gallery videos, which are far too large to base64 through
 * `/api/r2/upload` (Vercel caps serverless request bodies at ~4.5MB).
 */

const ALLOWED_CONTENT_TYPE = /^(image|video)\/[A-Za-z0-9.+-]+$/

function validObjectKey(value: string) {
  return value.length <= 512
    && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
    && !value.split('/').includes('..')
}

export default defineEventHandler(async (event) => {
  await requireAuthSession(event)
  const body = await readBody<{ key?: string; contentType?: string }>(event)

  const key = String(body?.key || '').trim()
  const contentType = String(body?.contentType || '').trim().toLowerCase()

  if (!validObjectKey(key)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid R2 object key' })
  }
  if (!ALLOWED_CONTENT_TYPE.test(contentType)) {
    throw createError({ statusCode: 400, statusMessage: 'Only image or video uploads are allowed' })
  }

  const { uploadUrl, publicUrl } = await getR2UploadUrl(key, contentType)
  return { uploadUrl, publicUrl, key }
})
