import { defineEventHandler, readBody, createError } from 'h3'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    url: string
    key: string
    view?: string
    categoryName?: string
    targetAudience?: string
  }>(event)

  if (!body?.url || !body?.key) {
    throw createError({ statusCode: 400, statusMessage: 'Missing image URL or key' })
  }

  // 🔹 Cloudflare R2 credentials
  const { R2_ID, R2_SECRET, R2_BUCKET, R2_ACCOUNT_ID } = process.env
  if (!R2_ID || !R2_SECRET || !R2_BUCKET || !R2_ACCOUNT_ID) {
    throw createError({ statusCode: 500, statusMessage: 'Missing Cloudflare R2 credentials' })
  }

  // 🔹 Fetch image from URL
  console.log(`🟡 Fetching image from: ${body.url}`)
  const res = await fetch(body.url)
  if (!res.ok) throw createError({ statusCode: 400, statusMessage: `Failed to fetch image: ${res.statusText}` })
  const userBuffer = Buffer.from(await res.arrayBuffer())

  // 🧩 Prepare Gemini prompt
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY 
  if (!GEMINI_API_KEY) throw createError({ statusCode: 500, statusMessage: 'Missing Gemini API key' })

  const productType = body.categoryName || 'product'
  const modelType = body.targetAudience || ''
  const view = body.view || ''
    const prompt = `
Generate a professional 1:1 square (1024x1024) e-commerce image with pure white (#ffffff) background of an Indian ${modelType} model wearing this ${productType}.
Frame the image to clearly at center, show the full ${productType} as it would appear in an online product listing.
Keep the color and design of product same as the given in the image.
Ensure some nice pose and composition are appropriate for a ${view}-facing product display.
If the input image has transparent areas, ensure they are filled with #ffffff not black please.
`

  // 🔹 Prepare buffer for Gemini
  const filledBuffer = await sharp(userBuffer)
    .flatten({ background: '#ffffff' })
    .resize({ width: 1024, height: 1024 })
    .toFormat('jpeg')
    .toBuffer()

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`

  let generatedBase64: string | undefined
  let aiAttempts = 0

  while (aiAttempts < 3 && !generatedBase64) {
    aiAttempts++
    console.log(`🟡 Attempt ${aiAttempts}: Sending image to Gemini...`)

    try {
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/jpeg', data: filledBuffer.toString('base64') } },
              ],
            },
          ],
          generationConfig: {
            response_modalities: ['IMAGE'],
          },
        }),
      })

      const data = await response.json()

      if (data?.error) {
        console.warn(`⚠️ Gemini API error (Attempt ${aiAttempts}):`, data.error.message)
        continue
      }

      const candidates = data?.candidates || []
      for (const c of candidates) {
        const parts = c?.content?.parts || []
        for (const p of parts) {
          if (p.inlineData?.data) {
            generatedBase64 = p.inlineData.data
            console.log(`✅ Gemini returned image on attempt ${aiAttempts}`)
            break
          }
        }
        if (generatedBase64) break
      }
    } catch (err: any) {
      console.error(`❌ Gemini error (Attempt ${aiAttempts}):`, err.message)
    }
  }

  let finalBuffer: Buffer
  let usedAiImage = false

  if (generatedBase64) {
    usedAiImage = true
    const generatedBuffer = Buffer.from(generatedBase64, 'base64')
    const originalSizeMB = generatedBuffer.length / 1024 / 1024
    let quality = originalSizeMB > 2 ? 70 : originalSizeMB <= 0.5 ? 100 : 85

    finalBuffer = await sharp(generatedBuffer)
      .resize({ width: 1024, height: 1024, fit: 'contain', background: '#ffffff' })
      .toFormat('webp', { quality })
      .toBuffer()
  } else {
    console.warn('⚠️ Gemini failed after 3 attempts — using original image')
    const originalSizeMB = userBuffer.length / 1024 / 1024
    let quality = originalSizeMB > 2 ? 60 : originalSizeMB <= 0.5 ? 80 : 70

    finalBuffer = await sharp(userBuffer)
      .resize({ width: 1024, height: 1024, fit: 'contain', background: '#ffffff' })
      .toFormat('webp', { quality })
      .toBuffer()
  }

  // 🔹 Upload to Cloudflare R2
  console.log('🟡 Uploading to Cloudflare R2...')

  const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ID, secretAccessKey: R2_SECRET },
  })

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: body.key,
        Body: finalBuffer,
        ContentType: 'image/webp',
      })
    )
    console.log(`✅ Uploaded successfully: ${body.key}`)
  } catch (error: any) {
    throw createError({ statusCode: 500, statusMessage: `Cloudflare upload failed: ${error.message}` })
  }

  const finalUrl = `https://${R2_BUCKET}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${body.key}`

  return {
    success: true,
    url: finalUrl,
    usedAiImage,
    aiAttempts,
  }
})
