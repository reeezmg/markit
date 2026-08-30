import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { shippingProxyBinary } from '~/server/utils/shipping-proxy'

/**
 * Stream one label PDF to the seller.
 *
 * `mode=download` (default) prompts a save dialog; `mode=inline` renders in the
 * browser, which is what the print window's iframes point at — same-origin, so
 * it is not blocked by the carrier's X-Frame-Options.
 */
export default defineEventHandler(async (event) => {
  const { trackingId, mode, name } = getQuery(event) as Record<string, string>
  if (!trackingId) throw createError({ statusCode: 400, statusMessage: 'trackingId is required' })

  const { body } = await shippingProxyBinary(event, {
    method: 'GET',
    path: `label/${encodeURIComponent(trackingId)}/pdf`,
  })

  const safe = String(name || `label-${trackingId}`).replace(/[^\w.-]+/g, '-')
  const disposition = mode === 'inline' ? 'inline' : 'attachment'
  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Disposition', `${disposition}; filename="${safe}.pdf"`)
  setHeader(event, 'Content-Length', String(body.length))
  setHeader(event, 'Cache-Control', 'private, no-store')
  return body
})
