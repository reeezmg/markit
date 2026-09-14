import { createError, defineEventHandler, getHeader, getQuery, getRouterParam, readBody } from 'h3'

/** Public carrier URL on markit.co.in; verification happens in the shipping service. */
export default defineEventHandler(async (event) => {
  const companyId = getRouterParam(event, 'companyId')
  const provider = getRouterParam(event, 'provider')
  const queryToken = getQuery(event).token
  const token = typeof queryToken === 'string'
    ? queryToken
    : getHeader(event, 'x-carrier-webhook-token')
  if (!companyId || !provider || !token) {
    throw createError({ statusCode: 401, statusMessage: 'Missing shipping webhook credentials' })
  }

  const body = await readBody(event)
  const base = String(useRuntimeConfig().shippingServiceUrl || '').replace(/\/$/, '')
  if (!base) throw createError({ statusCode: 503, statusMessage: 'Shipping service is not configured' })
  const url = `${base}/api/seller/${encodeURIComponent(companyId)}/shipping/webhook/${encodeURIComponent(provider)}`
  try {
    return await $fetch(url, {
      method: 'POST',
      body,
      headers: { 'X-Carrier-Webhook-Token': token },
    })
  } catch (error: any) {
    throw createError({
      statusCode: error?.response?.status || 502,
      statusMessage: error?.data?.detail || 'Shipping webhook failed',
    })
  }
})
