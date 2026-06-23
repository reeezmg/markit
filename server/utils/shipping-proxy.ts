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
