export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-upload-secret",
        },
      })
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 })
    }

    // -------------------------
    // Basic auth for uploads
    // -------------------------
    const providedSecret = request.headers.get("x-upload-secret")
    const requiredSecret = env.UPLOAD_SECRET || env.__UPLOAD_SECRET
    if (!requiredSecret || providedSecret !== requiredSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    }

    // -------------------------
    // Parse body
    // -------------------------
    let body
    try {
      body = await request.json()
    } catch (err) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 })
    }

    const { base64, key, prompt = "", isAiImage = true } = body
    if (!base64 || !key) {
      return new Response(JSON.stringify({ error: "Missing base64 or key" }), { status: 400 })
    }

    // remove data url prefix if present
    const stripped = base64.replace(/^data:.+;base64,/, "")

    // If not using AI, we could upload original — but your requirement is to replace original only with AI.
    // So if isAiImage is false, we'll return 400 (change as you wish).
    if (!isAiImage) {
      return new Response(JSON.stringify({ error: "isAiImage=false not supported in this endpoint" }), { status: 400 })
    }

    // -------------------------
    // Call Gemini with retries
    // -------------------------
    const GEMINI_KEY = env.GEMINI_API_KEY
    if (!GEMINI_KEY) {
      return new Response(JSON.stringify({ error: "Server missing GEMINI_API_KEY" }), { status: 500 })
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_KEY}`

    async function callGemini(imageB64, promptText) {
      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              { text: promptText },
              { inlineData: { mimeType: "image/jpeg", data: imageB64 } }
            ]
          }
        ],
        generationConfig: { response_modalities: ["IMAGE"] }
      }
      const res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      // Try to parse JSON even on non-200 to capture errors
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const errMsg = json?.error?.message || `HTTP ${res.status}`
        throw new Error(errMsg)
      }
      return json
    }

    let generatedB64 = null
    let attempts = 0
    while (attempts < 3 && !generatedB64) {
      attempts++
      try {
        const resp = await callGemini(stripped, prompt)
        const candidates = resp?.candidates ?? []
        for (const c of candidates) {
          const parts = c?.content?.parts ?? []
          for (const p of parts) {
            if (p.inlineData?.data) {
              generatedB64 = p.inlineData.data
              break
            }
          }
          if (generatedB64) break
        }
      } catch (err) {
        // swallow and retry
        console.warn("Gemini attempt error:", err?.message ?? err)
      }
    }

    if (!generatedB64) {
      // AI failed after retries — decision: DO NOT store original (per your requirement).
      return new Response(JSON.stringify({ error: "AI generation failed after retries" }), { status: 500 })
    }

    // convert base64 -> Uint8Array for R2
    function base64ToUint8Array(b64) {
      const binary = atob(b64)
      const len = binary.length
      const arr = new Uint8Array(len)
      for (let i = 0; i < len; i++) arr[i] = binary.charCodeAt(i)
      return arr
    }

    const aiBytes = base64ToUint8Array(generatedB64)

    // Save to R2 (overwrites any existing object at same key)
    try {
      await env.R2_BUCKET.put(key, aiBytes, {
        httpMetadata: { contentType: "image/webp" } // you can set image/jpeg if Gemini returns JPEG
      })
    } catch (err) {
      return new Response(JSON.stringify({ error: "R2 upload failed", details: String(err) }), { status: 500 })
    }

    // Build a response (you can construct your public URL if you have a route; here we return the key)
    const responseBody = { success: true, key, overwrote: true }

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    })
  }
}
