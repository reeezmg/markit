import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

let _client: S3Client | null = null

function getClient(): S3Client {
  if (_client) return _client

  const R2_ID = process.env.R2_ID
  const R2_SECRET = process.env.R2_SECRET
  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID

  if (!R2_ID || !R2_SECRET || !R2_ACCOUNT_ID) {
    throw new Error('Missing R2 credentials (R2_ID, R2_SECRET, R2_ACCOUNT_ID)')
  }

  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ID,
      secretAccessKey: R2_SECRET,
    },
  })

  return _client
}

/**
 * Upload a base64-encoded file to R2.
 * Returns the public URL: https://images.markit.co.in/{key}
 */
export async function uploadToR2(base64: string, key: string, contentType: string): Promise<string> {
  const bucket = process.env.R2_BUCKET
  if (!bucket) throw new Error('R2_BUCKET not configured')

  const body = Buffer.from(base64, 'base64')

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
