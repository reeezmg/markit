import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

let _client: S3Client | null = null

function getR2Config() {
  const runtime = useRuntimeConfig()
  const id = String(runtime.r2Id || '')
  const secret = String(runtime.r2Secret || '')
  const bucket = String(runtime.r2Bucket || '')
  const accountId = String(runtime.r2AccountId || '')

  if (!id || !secret || !bucket || !accountId) {
    throw new Error('Missing R2 credentials (R2_ID, R2_SECRET, R2_BUCKET, R2_ACCOUNT_ID)')
  }

  return { id, secret, bucket, accountId }
}

function getClient(): S3Client {
  if (_client) return _client
  const config = getR2Config()

  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.id,
      secretAccessKey: config.secret,
    },
  })

  return _client
}

/**
 * Upload a base64-encoded file to R2.
 * Returns the public URL: https://images.markit.co.in/{key}
 */
export async function uploadToR2(base64: string, key: string, contentType: string): Promise<string> {
  return uploadBufferToR2(Buffer.from(base64, 'base64'), key, contentType)
}

export async function uploadBufferToR2(body: Buffer, key: string, contentType: string): Promise<string> {
  const { bucket } = getR2Config()

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: 'public-read',
    }),
  )

  return `https://images.markit.co.in/${key}`
}

export async function getR2SignedUrl(key: string, responseFileName?: string): Promise<string> {
  const { bucket } = getR2Config()
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(responseFileName && {
      ResponseContentDisposition: `attachment; filename="${responseFileName}"`,
    }),
  })
  return getSignedUrl(getClient(), command, { expiresIn: 3600 })
}
