import { randomUUID, randomBytes } from 'node:crypto'
import { createError, getCookie, setCookie, deleteCookie, getHeader, getQuery, getRequestURL, setHeader, type H3Event } from 'h3'
import { pool } from '../db'
import { assertCompanyAccess } from './companyRequestScope'
import { openToken, sealToken } from './connect-whatsapp-security'
import { canManageConnect } from '../../utils/connect-access'

export function whatsappConfig() {
  return { appId: process.env.WHATSAPP_APP_ID || '', appSecret: process.env.WHATSAPP_APP_SECRET || '',
    configId: process.env.WHATSAPP_SIGNUP_CONFIG_ID || '', encryptionKey: process.env.WHATSAPP_ENCRYPTION_KEY || '',
    verifyToken: process.env.WHATSAPP_CONNECT_VERIFY_TOKEN || '', version: process.env.WHATSAPP_GRAPH_VERSION || 'v25.0' }
}
export async function connectCompany(event: H3Event) {
  const session = await requireAuthSession(event)
  if (!canManageConnect(session.data.role)) throw createError({ statusCode: 403, statusMessage: 'Connect requires a company administrator or manager' })
  const companyId = getHeader(event, 'x-company-id') || getQuery(event).companyId || session.data.companyId
  if (typeof companyId !== 'string') throw createError({ statusCode: 400, statusMessage: 'Select one company' })
  await assertCompanyAccess(event, companyId)
  setHeader(event, 'Cache-Control', 'no-store')
  if (event.method !== 'GET') {
    const origin = getHeader(event, 'origin')
    if (!origin || origin !== getRequestURL(event).origin) throw createError({ statusCode: 403, statusMessage: 'Open Connect from this Markit site to continue' })
  }
  return { companyId, userId: session.data.id }
}
export async function ensureConnectSchema() {
  try { await pool.query('SELECT id FROM connect_whatsapp_connections LIMIT 0'); await pool.query('SELECT id FROM connect_whatsapp_messages LIMIT 0') }
  catch (e: any) {
    if (e.code === '42P01' || e.code === '42703') throw createError({ statusCode: 503, statusMessage: 'Connect database setup is pending. The prepared WhatsApp migration needs separate approval before application.' })
    throw e
  }
}
export async function graph(path: string, token: string, method = 'GET', body?: any, query?: Record<string, string>) {
  const version = whatsappConfig().version
  if (!/^v\d+\.0$/.test(version) || !/^[\w/]+$/.test(path)) throw createError({ statusCode: 500, statusMessage: 'Invalid Meta API configuration' })
  const url = new URL(`https://graph.facebook.com/${version}/${path}`)
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v)
  let response: Response
  try {
    response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) })
  } catch { throw createError({ statusCode: 504, statusMessage: 'Meta did not confirm the request. Check activity before retrying.' }) }
  const result = await response.json().catch(() => ({})) as any
  if (!response.ok || result.error) {
    // Never return upstream request objects, tokens, URLs or arbitrary echoed input.
    throw createError({ statusCode: 502, statusMessage: `Meta rejected the request (code ${Number(result.error?.code) || response.status}${result.error?.error_subcode ? ` / ${Number(result.error.error_subcode)}` : ''}). Check account permissions, billing and the submitted fields in Meta.`, data: { metaCode: result.error?.code, httpStatus: response.status, traceId: result.error?.fbtrace_id } })
  }
  return result
}
export async function connection(companyId: string, active = true) {
  const row = (await pool.query('SELECT * FROM connect_whatsapp_connections WHERE company_id=$1', [companyId])).rows[0]
  if (!row || (active && !row.active)) throw createError({ statusCode: 409, statusMessage: 'Connect a WhatsApp business account first' })
  return row
}
export function publicConnection(row: any) {
  if (!row) return null
  return { id: row.id, wabaId: row.waba_id, phoneId: row.phone_id, displayPhone: row.display_phone,
    verifiedName: row.verified_name, active: row.active, subscribed: row.subscribed, updatedAt: row.updated_at }
}
export function connectionToken(row: any) { return openToken(row.token, whatsappConfig().encryptionKey) }

/** Serialize external writes with send/disconnect and recheck current authorization. */
export async function withActiveConnection<T>(id: string, work: (row: any, token: string, db: any) => Promise<T>): Promise<T> {
  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    const current = (await db.query('SELECT * FROM connect_whatsapp_connections WHERE id=$1 FOR UPDATE', [id])).rows[0]
    if (!current?.active) throw createError({ statusCode: 409, statusMessage: 'Connection was disconnected. Reconnect before continuing.' })
    const value = await work(current, connectionToken(current), db)
    await db.query('COMMIT')
    return value
  } catch (e) { await db.query('ROLLBACK'); throw e } finally { db.release() }
}

const pendingCookie = 'markit-wa-signup'
export function startSignup(event: H3Event, companyId: string, userId: string) {
  const cfg = whatsappConfig()
  if (!cfg.appId || !cfg.appSecret || !cfg.configId || cfg.encryptionKey.length < 32) throw createError({ statusCode: 503, statusMessage: 'Configure the Meta app, Embedded Signup configuration and encryption key first' })
  const state = randomBytes(24).toString('hex')
  const payload = { companyId, userId, state, expires: Date.now() + 10 * 60 * 1000 }
  setPending(event, payload)
  return { state }
}
function setPending(event: H3Event, payload: any) {
  setCookie(event, pendingCookie, sealToken(JSON.stringify(payload), whatsappConfig().encryptionKey), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/connect/whatsapp', maxAge: 600 })
}
function pending(event: H3Event, companyId: string, userId: string, state: unknown) {
  let data: any
  try { data = JSON.parse(openToken(getCookie(event, pendingCookie) || '', whatsappConfig().encryptionKey)) } catch { /* expired or invalid cookie */ }
  if (!data || data.companyId !== companyId || data.userId !== userId || data.state !== state || data.expires < Date.now()) throw createError({ statusCode: 403, statusMessage: 'Signup expired or company changed. Start again.' })
  return data
}
export async function discoverAssets(token: string) {
  const cfg = whatsappConfig()
  const debug = (await graph('debug_token', `${cfg.appId}|${cfg.appSecret}`, 'GET', undefined, { input_token: token })).data
  if (!debug?.is_valid || String(debug.app_id) !== cfg.appId || (debug.expires_at && debug.expires_at * 1000 < Date.now())) throw createError({ statusCode: 400, statusMessage: 'The credential must be valid and issued to the configured Meta app' })
  if (!['whatsapp_business_management', 'whatsapp_business_messaging'].every(s => debug.scopes?.includes(s))) throw createError({ statusCode: 400, statusMessage: 'Grant both WhatsApp management and messaging permissions' })
  const ids = [...new Set<string>((debug.granular_scopes || []).filter((s: any) => s.scope === 'whatsapp_business_management').flatMap((s: any) => s.target_ids || []))]
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'No WhatsApp business account was granted. Complete Embedded Signup with a business account.' })
  const assets: any[] = []
  for (const id of ids.slice(0, 30)) {
    let after = ''
    do {
      const page = await graph(`${id}/phone_numbers`, token, 'GET', undefined, { fields: 'id,display_phone_number,verified_name,code_verification_status,platform_type', limit: '100', ...(after ? { after } : {}) })
      for (const phone of page.data || []) assets.push({ wabaId: id, phoneId: phone.id, displayPhone: phone.display_phone_number, verifiedName: phone.verified_name, verification: phone.code_verification_status, platformType: phone.platform_type })
      after = page.paging?.next ? page.paging?.cursors?.after || '' : ''
    } while (after && assets.length < 500)
  }
  return assets
}
export async function exchangeSignup(event: H3Event, context: { companyId: string; userId: string }, body: any) {
  const data = pending(event, context.companyId, context.userId, body.state), cfg = whatsappConfig()
  let token: string
  if (body.code) {
    if (typeof body.code !== 'string' || body.code.length > 4000) throw createError({ statusCode: 400, statusMessage: 'Invalid signup code' })
    const result = await graph('oauth/access_token', `${cfg.appId}|${cfg.appSecret}`, 'GET', undefined, { client_id: cfg.appId, client_secret: cfg.appSecret, code: body.code })
    token = result.access_token
  } else {
    token = String(body.accessToken || '').trim()
    if (!token || token.length > 1800) throw createError({ statusCode: 400, statusMessage: 'Enter a valid access token (maximum 1800 characters)' })
  }
  if (typeof token !== 'string' || token.length > 1800) throw createError({ statusCode: 400, statusMessage: 'Meta returned an unsupported credential length' })
  const assets = await discoverAssets(token)
  if (!assets.length) throw createError({ statusCode: 400, statusMessage: 'No business phone numbers found. Add a number in Meta and reconnect.' })
  // Token stays in an authenticated encrypted HttpOnly cookie until asset selection.
  setPending(event, { ...data, token })
  return { assets }
}
export async function finishSignup(event: H3Event, context: { companyId: string; userId: string }, body: any) {
  const data = pending(event, context.companyId, context.userId, body.state)
  if (!data.token) throw createError({ statusCode: 409, statusMessage: 'Authorize the business first' })
  const asset = (await discoverAssets(data.token)).find(a => a.wabaId === body.wabaId && a.phoneId === body.phoneId)
  if (!asset) throw createError({ statusCode: 403, statusMessage: 'Selected number was not granted to Markit' })
  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    // Serialize connect/disconnect/send for this company, including a first connection.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`whatsapp:${context.companyId}`])
    const old = (await db.query('SELECT * FROM connect_whatsapp_connections WHERE company_id=$1 FOR UPDATE', [context.companyId])).rows[0]
    if (old && (old.waba_id !== asset.wabaId || old.phone_id !== asset.phoneId)) throw createError({ statusCode: 409, statusMessage: 'This company already has a different WhatsApp number. Reconnect the same number to preserve its history.' })
    const result = await db.query(`INSERT INTO connect_whatsapp_connections(id,company_id,waba_id,phone_id,display_phone,verified_name,token,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT(company_id) DO UPDATE SET token=EXCLUDED.token,active=true,display_phone=EXCLUDED.display_phone,verified_name=EXCLUDED.verified_name,updated_at=NOW() RETURNING *`,
    [randomUUID(), context.companyId, asset.wabaId, asset.phoneId, asset.displayPhone || '', asset.verifiedName || '', sealToken(data.token, whatsappConfig().encryptionKey)])
    await db.query('COMMIT')
    deleteCookie(event, pendingCookie, { path: '/api/connect/whatsapp' })
    return { connection: publicConnection(result.rows[0]) }
  } catch (e: any) {
    await db.query('ROLLBACK')
    if (e.code === '23505') throw createError({ statusCode: 409, statusMessage: 'This WhatsApp account or phone is already connected to another company' })
    throw e
  } finally { db.release() }
}
