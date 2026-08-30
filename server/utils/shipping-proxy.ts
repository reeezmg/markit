import { createError, type H3Event } from 'h3'

/**
 * Forward a shipping request to the custom-api (FastAPI) shipping endpoints.
 *
 * companyId is taken from the authenticated seller session (never trusted from
 * the client), and the shared X-Service-Token is injected server-side so it is
 * never exposed to the browser. All Delhivery logic lives in custom-api adapters
 * — these proxies only authenticate + forward.
 */
export async function shippingProxy(
  event: H3Event,
  opts: { method: 'GET' | 'POST'; path: string; query?: Record<string, any>; body?: any },
) {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const config = useRuntimeConfig()
  const base = (config.customApiUrl as string).replace(/\/$/, '')
  const token = config.customApiServiceToken as string
  const url = `${base}/api/custom/${companyId}/shipping/${opts.path}`

  try {
    return await $fetch(url, {
      method: opts.method,
      query: opts.query,
      body: opts.body,
      headers: { 'X-Service-Token': token },
    })
  } catch (e: any) {
    const status = e?.response?.status || 502
    const detail = e?.data?.detail || e?.message || 'Shipping request failed'
    throw createError({
      statusCode: status,
      statusMessage: typeof detail === 'string' ? detail : 'Shipping request failed',
    })
  }
}

/**
 * Same as shippingProxy, but for endpoints that return a binary body
 * (label PDFs, label ZIPs) instead of JSON. Returns the raw bytes plus the
 * upstream content type so the caller can set its own Content-Disposition.
 */
export async function shippingProxyBinary(
  event: H3Event,
  opts: { method: 'GET' | 'POST'; path: string; query?: Record<string, any>; body?: any },
): Promise<{ body: Buffer; contentType: string }> {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const config = useRuntimeConfig()
  const base = (config.customApiUrl as string).replace(/\/$/, '')
  const token = config.customApiServiceToken as string
  const url = `${base}/api/custom/${companyId}/shipping/${opts.path}`

  try {
    const res = await $fetch.raw<ArrayBuffer>(url, {
      method: opts.method,
      query: opts.query,
      body: opts.body,
      headers: { 'X-Service-Token': token },
      responseType: 'arrayBuffer',
    })
    return {
      body: Buffer.from(res._data as ArrayBuffer),
      contentType: res.headers.get('content-type') || 'application/octet-stream',
    }
  } catch (e: any) {
    // An error response is JSON even though we asked for bytes — decode it so
    // the seller sees the carrier's reason instead of "fetch failed".
    let detail = e?.message || 'Shipping request failed'
    const raw = e?.data
    try {
      const text = raw instanceof ArrayBuffer ? new TextDecoder().decode(raw) : null
      if (text) detail = JSON.parse(text)?.detail || text
      else if (raw?.detail) detail = raw.detail
    } catch { /* keep the fallback message */ }
    throw createError({
      statusCode: e?.response?.status || 502,
      statusMessage: typeof detail === 'string' ? detail : 'Shipping request failed',
    })
  }
}
