// upload.ts
import { defineEventHandler, readBody, createError } from 'h3'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'

/* ---------------------------------------------------------
   BACKGROUND PROCESSOR
----------------------------------------------------------*/
async function processUpload(body: any) {
  console.log("🔥 Background processing started for:", body.key)

  const { R2_ID, R2_SECRET, R2_BUCKET, R2_ACCOUNT_ID } = process.env
  if (!R2_ID || !R2_SECRET || !R2_BUCKET || !R2_ACCOUNT_ID) {
    console.error("❌ Missing Cloudflare R2 credentials")
    return
  }

  try {
    const base64Regex = /^data:(.+);base64,/
    const match = body.base64.match(base64Regex)
    if (!match) throw new Error("Invalid base64 string")

    const mimeType = match[1] || 'image/jpeg'
    const imageBase64 = body.base64.replace(base64Regex, '')
    const userBuffer = Buffer.from(imageBase64, 'base64')

    let finalBuffer: Buffer
    let usedAiImage = false
    let aiAttempts = 0

    const isAiImage = body.isAiImage ?? true

    // =====================================================================
    //  RAW USER IMAGE FLOW
    // =====================================================================
    if (!isAiImage) {
      console.log('🟢 isAiImage=false → Uploading user image directly')
      const originalSizeMB = userBuffer.length / 1024 / 1024
      let quality = originalSizeMB > 2 ? 60 : originalSizeMB <= 0.5 ? 80 : 70

      finalBuffer = await sharp(userBuffer)
        .resize({ width: 1024, height: 1024, fit: 'contain', background: '#ffffff' })
        .toFormat('webp', { quality })
        .toBuffer()
    }

    // =====================================================================
    //  AI IMAGE GENERATION FLOW
    // =====================================================================
    else {
      // Transparent → white
      const filledBuffer = await sharp(userBuffer)
        .flatten({ background: '#ffffff' })
        .resize({ width: 1024, height: 1024 })
        .toFormat('jpeg')
        .toBuffer()

      const GEMINI_API_KEY = process.env.GEMINI_API_KEY
      if (!GEMINI_API_KEY) throw new Error("Missing Gemini API Key")

      const productType = body.categoryName || 'product'
      const modelType = body.targetAudience || ''
      const view = body.view || ''

      const prompt = `
Generate a professional 1:1 square (1024x1024) e-commerce image with pure white (#ffffff) background of an Indian ${modelType} model wearing this ${productType}.
Frame the image to clearly at center show the full ${productType} as it would appear in an online product listing.
Keep the color and design of product same as the given in the image.
Ensure pose and composition suitable for a ${view}-facing product display.
If transparent areas exist, fill with #ffffff.
`

      const geminiUrl =
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`

      const originalBase64 = filledBuffer.toString('base64')
      let generatedBase64: string | undefined

      // Retry Gemini 3 times
      while (aiAttempts < 3 && !generatedBase64) {
        aiAttempts++
        console.log(`🟡 Gemini attempt ${aiAttempts}`)

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
                    { inlineData: { mimeType: 'image/jpeg', data: originalBase64 } },
                  ],
                },
              ],
              generationConfig: { response_modalities: ['IMAGE'] },
            }),
          })

          const data = await response.json()

          if (data?.error) {
            console.warn(`⚠️ Gemini response error:`, data.error.message)
            continue
          }

          const candidates = data?.candidates || []
          for (const c of candidates) {
            const parts = c?.content?.parts || []
            for (const p of parts) {
              if (p.inlineData?.data) {
                generatedBase64 = p.inlineData.data
                console.log(`✅ Gemini succeeded on attempt ${aiAttempts}`)
                break
              }
            }
            if (generatedBase64) break
          }

        } catch (err: any) {
          console.error(`❌ Gemini exception (attempt ${aiAttempts}):`, err.message)
        }
      }

      // AI SUCCESS
      if (generatedBase64) {
        usedAiImage = true
        const generatedBuffer = Buffer.from(generatedBase64, 'base64')

        const originalSizeMB = generatedBuffer.length / 1024 / 1024
        let quality = originalSizeMB > 2 ? 70 : originalSizeMB <= 1 ? 100 : 90

        finalBuffer = await sharp(generatedBuffer)
          .resize({ width: 1024, height: 1024, fit: 'contain', background: '#ffffff' })
          .toFormat('webp', { quality })
          .toBuffer()
      }

      // AI FAILED → FALLBACK
      else {
        console.warn('⚠️ Gemini failed after 3 attempts — using raw image')
        const originalSizeMB = userBuffer.length / 1024 / 1024
        let quality = originalSizeMB > 2 ? 60 : originalSizeMB <= 0.5 ? 80 : 70

        finalBuffer = await sharp(userBuffer)
          .resize({ width: 1024, height: 1024, fit: 'contain', background: '#ffffff' })
          .toFormat('webp', { quality })
          .toBuffer()
      }
    }

    // =====================================================================
    // UPLOAD TO CLOUDFLARE R2
    // =====================================================================
    console.log(`🟡 Uploading to R2: ${body.key}`)

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ID, secretAccessKey: R2_SECRET },
    })

    await s3Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: body.key,
        Body: finalBuffer,
        ContentType: 'image/webp',
      })
    )

    console.log(`✅ Upload complete: ${body.key}`)

  } catch (err: any) {
    console.error("❌ Background processing error:", err.message)
  }
}

/* ---------------------------------------------------------
   MAIN REQUEST HANDLER — IMMEDIATE RESPONSE
----------------------------------------------------------*/
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body?.base64 || !body?.key) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing base64 or key"
    })
  }

  // 1️⃣ Send response instantly
  event.node.res.writeHead(200, { "Content-Type": "application/json" })
  event.node.res.end(JSON.stringify({
    received: true,
    key: body.key,
    message: "Processing started in background"
  }))

  // 2️⃣ Continue heavy work in background
  setTimeout(() => {
    processUpload(body)
  }, 0)

  // 3️⃣ Do NOT send any more response
  return
})
