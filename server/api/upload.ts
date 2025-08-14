import { defineEventHandler, readBody } from 'h3'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ base64: string; key: string }>(event)

  if (!body?.base64 || !body?.key) {
    throw createError({ statusCode: 400, statusMessage: 'Missing base64 or key' })
  }

  const R2_ID = process.env.R2_ID
  const R2_SECRET = process.env.R2_SECRET
  const R2_BUCKET = process.env.R2_BUCKET
  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID

  if (!R2_ID || !R2_SECRET || !R2_BUCKET || !R2_ACCOUNT_ID) {
    throw createError({ statusCode: 500, statusMessage: 'Missing R2 credentials' })
  }

  const base64Regex = /^data:(.+);base64,/
  const match = body.base64.match(base64Regex)
  if (!match) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid base64 string' })
  }

  const buffer = Buffer.from(body.base64.replace(base64Regex, ''), 'base64')
  const originalSizeMB = buffer.length / 1024 / 1024

  // 🔧 Dynamic compression quality
  let quality = 70
  if (originalSizeMB > 2) quality = 60
  else if (originalSizeMB <= 0.5) quality = 80

  const compressedBuffer = await sharp(buffer)
    .resize({ width: 1000 }) // optional resize
    .toFormat('webp', { quality })
    .toBuffer()

  const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ID,
      secretAccessKey: R2_SECRET,
    },
  })

  await s3Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: body.key,
      Body: compressedBuffer,
      ContentType: 'image/webp',
      ACL: 'public-read',
    }),
  )

  return {
    success: true,
    key: body.key,
    qualityUsed: quality,
    originalSizeMB: originalSizeMB.toFixed(2),
    compressedSizeMB: (compressedBuffer.length / 1024 / 1024).toFixed(2),
    url: `https://${R2_BUCKET}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${body.key}`,
  }
})
