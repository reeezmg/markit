import { createHmac, timingSafeEqual } from 'node:crypto'
import { pool } from '~/server/db'

/**
 * Vercel deployment webhook.
 *
 * Vercel calls this when a build finishes, so the editor learns a preview is
 * ready without waiting for a poll. Register it in Vercel with the events
 * deployment.succeeded / deployment.error / deployment.canceled, pointing at:
 *
 *   production   https://markit.co.in/api/webhooks/vercel
 *   local        needs a tunnel - local.markit.co.in only resolves on your own
 *                machine, so Vercel cannot reach it
 *
 * IMPORTANT: this is a fast path, not a guarantee. Deliveries get dropped and
 * retries give up, so the polling in storefront-source must stay as the
 * fallback. If a missed webhook could strand a seller on a stale preview
 * forever, the design is wrong.
 *
 * Requires VERCEL_WEBHOOK_SECRET (shown once by Vercel when you create the hook).
 */

/** Vercel signs the RAW body with HMAC-SHA1. Compare in constant time. */
function verifySignature(raw: string, signature: string | undefined, secret: string) {
  if (!signature) return false
  const expected = createHmac('sha1', secret).update(raw).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  // timingSafeEqual throws on length mismatch, which is itself a failed match.
  return a.length === b.length && timingSafeEqual(a, b)
}

export default defineEventHandler(async (event) => {
  const secret = process.env.VERCEL_WEBHOOK_SECRET
  if (!secret) {
    console.error('[vercel-webhook] VERCEL_WEBHOOK_SECRET is not set; refusing to process')
    throw createError({ statusCode: 500, statusMessage: 'Webhook not configured' })
  }

  const raw = await readRawBody(event)
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'Empty body' })

  /*
   * Verify BEFORE parsing. This endpoint is public and mutates deployment
   * state, so an unsigned caller must get no further than here.
   */
  if (!verifySignature(raw.toString(), getHeader(event, 'x-vercel-signature'), secret)) {
    console.error('[vercel-webhook] bad signature')
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }

  const body = JSON.parse(raw.toString()) as {
    type?: string
    payload?: {
      deployment?: { id?: string; url?: string; meta?: Record<string, string> }
      project?: { id?: string }
      target?: string | null
      url?: string
    }
  }

  const type = body.type ?? ''
  if (!type.startsWith('deployment.')) return { ok: true, ignored: type }

  const deployment = body.payload?.deployment
  const projectId = body.payload?.project?.id
  if (!projectId || !deployment?.id) return { ok: true, ignored: 'missing project or deployment id' }

  /*
   * Which branch? Prefer the git ref, since that is what actually distinguishes
   * preview from production for us. `target` is a fallback - it says
   * "production" or "preview", but a preview build of ANY branch reports
   * "preview", and we only care about the one called `preview`.
   */
  const ref = deployment.meta?.githubCommitRef
  const isProduction = ref === 'main' || (!ref && body.payload?.target === 'production')
  const isPreview = ref === 'preview' || (!ref && body.payload?.target !== 'production')
  if (!isProduction && !isPreview) return { ok: true, ignored: `branch ${ref}` }

  const state =
    type === 'deployment.succeeded' || type === 'deployment.ready' ? 'READY'
    : type === 'deployment.error' ? 'ERROR'
    : type === 'deployment.canceled' ? 'CANCELED'
    : 'BUILDING'

  const url = deployment.url ? `https://${deployment.url}` : body.payload?.url ?? null
  const column = isProduction ? 'production' : 'preview'

  // Guarded on vercel_project_id so a webhook can only ever touch the storefront
  // it belongs to - the payload never chooses which company row is written.
  const result = await pool.query(
    `UPDATE storefront_sources
        SET ${column}_deployment_id = $2,
            ${column}_deployment_url = COALESCE($3, ${column}_deployment_url),
            ${column}_deployment_status = $4,
            updated_at = NOW()
      WHERE vercel_project_id = $1`,
    [projectId, deployment.id, url, state],
  )

  if (result.rowCount === 0) {
    console.warn('[vercel-webhook] no storefront matches project', projectId)
  }

  // Ack fast. Vercel retries on non-2xx, and a slow handler causes duplicates.
  return { ok: true, target: column, state }
})
