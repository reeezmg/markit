import { timingSafeEqual } from 'node:crypto'
import { carrierRequest, shippingError, type CarrierFetch } from './http'
import type { ShippingDB } from './cartonization'

const clean = (value: any) => String(value || '').trim().replace(/^['"]|['"]$/g, '').replace(/\\[rn]|[\r\n]/g, '').trim()
/** Public carrier callback: authenticate with the tenant's carrier secret, then forward one event. */
export async function handleShippingWebhook(db: ShippingDB, companyId: string, provider: string, payload: any, supplied: string,
  customApiUrl: string, serviceToken: string, fetcher: CarrierFetch = globalThis.fetch) {
  if (provider !== 'delhivery') throw shippingError(`Webhooks not supported for provider: ${provider}`, 404)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw shippingError('Invalid webhook payload')
  const row = (await db.query(`SELECT preference_value FROM general_preferences WHERE company_id=$1 AND page_name='ecomm_shipping' AND preference_key='provider_config' LIMIT 1`, [companyId])).rows[0]
  if (!row) throw shippingError('Shipping not configured', 404)
  const cfg = typeof row.preference_value === 'string' ? JSON.parse(row.preference_value) : row.preference_value
  const gw = cfg?.providers?.[provider] || {}
  if (!gw.enabled) throw shippingError(`Provider '${provider}' is not connected`, 404)
  const secret = clean(gw.webhookToken)
  if (!secret) throw shippingError('Carrier webhook token is not configured', 503)
  const actual = Buffer.from(supplied || ''), expected = Buffer.from(secret)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw shippingError('Webhook verification failed', 401)
  const base = clean(customApiUrl).replace(/\/$/, ''), token = clean(serviceToken)
  if (!base || !token) throw shippingError('Internal ecommerce webhook is not configured', 503)
  const api = base.endsWith('/api') ? base : base + '/api'
  try {
    return await carrierRequest(fetcher, `${api}/custom/${encodeURIComponent(companyId)}/shipping/internal/webhook/${encodeURIComponent(provider)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Service-Token': token }, body: JSON.stringify(payload) }, 15000)
  } catch { throw shippingError('Internal ecommerce webhook is unavailable or rejected the event', 502) }
}
