import { createError, defineEventHandler, getHeader, getQuery, getRouterParam, readBody } from 'h3'
import { pool } from '~/server/db'
import { handleShippingWebhook } from '~/server/utils/shipping/webhook'

/** Public carrier URL; verify the company's secret in-process before forwarding. */
export default defineEventHandler(async (event) => {
  const companyId = getRouterParam(event, 'companyId')
  const provider = getRouterParam(event, 'provider')
  const queryToken = getQuery(event).token
  const body = await readBody(event)
  const token = typeof queryToken === 'string'
    ? queryToken
    : getHeader(event, 'x-carrier-webhook-token') || (typeof body?.token === 'string' ? body.token : '')
  if (!companyId || !provider || !token) {
    throw createError({ statusCode: 401, statusMessage: 'Missing shipping webhook credentials' })
  }

  const config = useRuntimeConfig()
  return handleShippingWebhook(pool, companyId, provider, body, token,
    String(config.customApiUrl || ''), String(config.customApiServiceToken || ''))
})
