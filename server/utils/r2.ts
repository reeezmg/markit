import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
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

/**
 * Permanently removes objects from R2. Callers must have already established
 * that the keys are no longer referenced — see `server/utils/mediaCleanup.ts`,
 * which is the only thing that should call this directly.
 *
 * Returns the keys R2 reported as deleted. R2/S3 treat deleting a missing key
 * as success, so a repeated cleanup is harmless.
 */
export async function deleteFromR2(keys: string[]): Promise<string[]> {
  const unique = [...new Set(keys.filter(Boolean))]
  if (!unique.length) return []

  const { bucket } = getR2Config()
  const deleted: string[] = []

  // DeleteObjects accepts 1000 keys per call.
  for (let i = 0; i < unique.length; i += 1000) {
    const batch = unique.slice(i, i + 1000)
    const result = await getClient().send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map(Key => ({ Key })), Quiet: false },
      }),
    )

    for (const entry of result.Deleted || []) {
      if (entry.Key) deleted.push(entry.Key)
    }
    for (const error of result.Errors || []) {
      console.error(`[r2] failed to delete ${error.Key}: ${error.Code} ${error.Message}`)
    }
  }

  return deleted
}

/**
 * Presigned PUT URL so the browser can upload straight to R2.
 * Needed for files too large to round-trip as base64 through a serverless route
 * (gallery videos). The client must send the exact same Content-Type header.
 *
 * Requires the R2 bucket to allow PUT + the storetools origin in its CORS policy.
 */
export async function getR2UploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const { bucket } = getR2Config()
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  })

  return {
    uploadUrl: await getSignedUrl(getClient(), command, { expiresIn }),
    publicUrl: `https://images.markit.co.in/${key}`,
  }
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
