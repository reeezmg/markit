import { getR2SignedUrl } from '~/server/utils/r2'

function validObjectKey(value: string) {
  return value.length <= 512
    && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
    && !value.split('/').includes('..')
}

export default defineEventHandler(async (event) => {
  await requireAuthSession(event)
  const body = await readBody<{ key?: string; responseFileName?: string }>(event)
  const key = String(body?.key || '').trim()
  if (!validObjectKey(key)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid R2 object key' })
  }

  const requestedName = String(body?.responseFileName || '').trim()
  const responseFileName = requestedName
    ? requestedName.replace(/[\r\n"\\]/g, '_').slice(0, 200)
    : undefined
  const url = await getR2SignedUrl(key, responseFileName)
  return { url }
})
