import { uploadToR2 } from '~/server/utils/r2'

const MAX_BASE64_LENGTH = 16 * 1024 * 1024

function validObjectKey(value: string) {
  return value.length <= 512
    && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
    && !value.split('/').includes('..')
}

export default defineEventHandler(async (event) => {
  await requireAuthSession(event)
  const body = await readBody<{ base64?: string; key?: string }>(event)
  const key = String(body?.key || '').trim()
  const dataUri = String(body?.base64 || '')

  if (!validObjectKey(key)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid R2 object key' })
  }
  if (!dataUri || dataUri.length > MAX_BASE64_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or oversized upload' })
  }

  const match = dataUri.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/)
  if (!match) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid image data' })
  }

  const url = await uploadToR2(match[2].replace(/\s/g, ''), key, match[1])
  return { success: true, url }
})
