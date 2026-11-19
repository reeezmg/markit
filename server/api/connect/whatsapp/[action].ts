import { defineEventHandler, readBody, getQuery, getRouterParam, createError } from 'h3'
import { isDeepStrictEqual } from 'node:util'
import { pool } from '../../../db'
import { connectCompany, connection, connectionToken, ensureConnectSchema, exchangeSignup, finishSignup, graph, publicConnection, startSignup, whatsappConfig, withActiveConnection } from '../../../utils/connect-whatsapp'
import { normalizeRecipient, validateTemplate } from '../../../utils/connect-whatsapp-security'

export default defineEventHandler(async event => {
  const context = await connectCompany(event), action = getRouterParam(event, 'action'), method = event.method
  const cfg = whatsappConfig()
  if (action === 'status' && method === 'GET') {
    let schemaReady = true
    try { await ensureConnectSchema() } catch (e: any) { if (e.statusCode === 503) schemaReady = false; else throw e }
    const row = schemaReady ? (await pool.query('SELECT * FROM connect_whatsapp_connections WHERE company_id=$1', [context.companyId])).rows[0] : null
    return { connection: publicConnection(row), schemaReady, appId: cfg.appId, configId: cfg.configId, version: cfg.version,
      configured: !!(cfg.appId && cfg.appSecret && cfg.configId && cfg.encryptionKey.length >= 32 && cfg.verifyToken),
      webhookPath: '/api/connect/whatsapp/webhook', setup: { app: !!cfg.appId, secret: !!cfg.appSecret, signup: !!cfg.configId, encryption: cfg.encryptionKey.length >= 32, webhook: !!cfg.verifyToken } }
  }
  await ensureConnectSchema()
  const body = method === 'GET' ? {} : await readBody(event) || {}
  if (JSON.stringify(body).length > 60000) throw createError({ statusCode: 413, statusMessage: 'Request is too large' })
  if (action === 'start' && method === 'POST') return startSignup(event, context.companyId, context.userId)
  if (action === 'exchange' && method === 'POST') return exchangeSignup(event, context, body)
  if (action === 'finish' && method === 'POST') return finishSignup(event, context, body)
  const row = await connection(context.companyId, action !== 'messages' || method !== 'GET')
  const token = row.active ? connectionToken(row) : ''
  if (action === 'subscribe' && method === 'POST') {
    return withActiveConnection(row.id, async (current, credential, db) => {
      await graph(`${current.waba_id}/subscribed_apps`, credential, 'POST', {})
      await db.query('UPDATE connect_whatsapp_connections SET subscribed=true,updated_at=NOW() WHERE id=$1 AND active=true', [current.id])
      return { success: true }
    })
  }
  if (action === 'register' && method === 'POST') {
    if (!/^\d{6}$/.test(body.pin || '')) throw createError({ statusCode: 400, statusMessage: 'Enter a six-digit two-step verification PIN' })
    return withActiveConnection(row.id, (current, credential) => graph(`${current.phone_id}/register`, credential, 'POST', { messaging_product: 'whatsapp', pin: body.pin }))
  }
  if (action === 'health' && method === 'GET') {
    const [phone, subscriptions] = await Promise.all([
      graph(row.phone_id, token, 'GET', undefined, { fields: 'id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type' }),
      graph(`${row.waba_id}/subscribed_apps`, token),
    ])
    return { phone, subscriptions }
  }
  if (action === 'profile' && method === 'GET') return graph(`${row.phone_id}/whatsapp_business_profile`, token, 'GET', undefined, { fields: 'about,address,description,email,websites,vertical' })
  if (action === 'profile' && method === 'POST') {
    const profile: Record<string, any> = { messaging_product: 'whatsapp' }
    for (const [field, max] of Object.entries({ about: 139, address: 256, description: 512, email: 128 })) {
      if (typeof body[field] !== 'string' || body[field].length > max) throw createError({ statusCode: 400, statusMessage: `Invalid ${field} (maximum ${max} characters)` })
      profile[field] = body[field]
    }
    if (!Array.isArray(body.websites) || body.websites.length > 2 || body.websites.some((v: any) => typeof v !== 'string' || v.length > 256 || !/^https?:\/\//.test(v))) throw createError({ statusCode: 400, statusMessage: 'Add up to two valid website URLs' })
    profile.websites = body.websites
    return withActiveConnection(row.id, (current, credential) => graph(`${current.phone_id}/whatsapp_business_profile`, credential, 'POST', profile))
  }
  if (action === 'templates' && method === 'GET') {
    const after = String(getQuery(event).after || '')
    if (after.length > 2000) throw createError({ statusCode: 400, statusMessage: 'Invalid page cursor' })
    const result = await graph(`${row.waba_id}/message_templates`, token, 'GET', undefined, { fields: 'id,name,language,status,category,components,rejected_reason', limit: '100', ...(after ? { after } : {}) })
    // Meta paging URLs contain credentials; return only opaque cursors.
    return { data: result.data, after: result.paging?.next ? result.paging?.cursors?.after : null }
  }
  if (action === 'templates' && ['POST', 'PUT'].includes(method)) {
    let template
    try { template = validateTemplate(body) } catch (e: any) { throw createError({ statusCode: 400, statusMessage: e.message }) }
    return withActiveConnection(row.id, async (current, credential) => {
      if (method === 'POST') return graph(`${current.waba_id}/message_templates`, credential, 'POST', template)
      const id = await ownedTemplate(current, credential, body.id)
      return graph(id, credential, 'POST', { category: template.category, components: template.components })
    })
  }
  if (action === 'templates' && method === 'DELETE') {
    return withActiveConnection(row.id, async (current, credential) => {
      const id = await ownedTemplate(current, credential, body.id)
      const template = await graph(id, credential, 'GET', undefined, { fields: 'name' })
      return graph(`${current.waba_id}/message_templates`, credential, 'DELETE', undefined, { hsm_id: id, name: template.name })
    })
  }
  if (action === 'messages' && method === 'GET') {
    const before = String(getQuery(event).before || '')
    const result = await pool.query(`SELECT id,meta_id AS "metaId",recipient,direction,kind,content,status,status_at AS "statusAt",created_at AS "createdAt",consent_at AS "consentAt"
      FROM connect_whatsapp_messages WHERE connection_id=$1 AND ($2='' OR (created_at,id)<(SELECT created_at,id FROM connect_whatsapp_messages WHERE id=$2 AND connection_id=$1)) ORDER BY created_at DESC,id DESC LIMIT 51`, [row.id, before])
    return { data: result.rows.slice(0, 50), before: result.rows.length > 50 ? result.rows[49].id : null }
  }
  if (action === 'messages' && method === 'POST') return sendMessage(row, body, context.userId)
  if (action === 'disconnect' && method === 'POST') {
    const db = await pool.connect()
    try {
      await db.query('BEGIN')
      await db.query('SELECT id FROM connect_whatsapp_connections WHERE id=$1 FOR UPDATE', [row.id])
      // Unsubscribe before erasing the credential so failure is recoverable by retry.
      await graph(`${row.waba_id}/subscribed_apps`, token, 'DELETE')
      await db.query("UPDATE connect_whatsapp_connections SET active=false,subscribed=false,token='',updated_at=NOW() WHERE id=$1", [row.id])
      await db.query('COMMIT')
    } catch (e) { await db.query('ROLLBACK'); throw e } finally { db.release() }
    return { success: true }
  }
  throw createError({ statusCode: 405, statusMessage: 'Unsupported Connect action or method' })
})

async function ownedTemplate(row: any, token: string, raw: unknown) {
  const id = String(raw || '')
  if (!/^\d+$/.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid template ID' })
  // Verify membership through the WABA edge, never accept an arbitrary Graph object.
  let after = ''; const seen = new Set<string>()
  do {
    const page = await graph(`${row.waba_id}/message_templates`, token, 'GET', undefined, { fields: 'id', limit: '100', ...(after ? { after } : {}) })
    if (page.data?.some((t: any) => t.id === id)) return id
    after = page.paging?.next ? page.paging?.cursors?.after || '' : ''
    if (after && seen.has(after)) break
    if (after) seen.add(after)
  } while (after)
  throw createError({ statusCode: 404, statusMessage: 'Template not found in this company account' })
}

async function sendMessage(row: any, body: any, actorId: string) {
  let to: string
  try { to = normalizeRecipient(body.to) } catch (e: any) { throw createError({ statusCode: 400, statusMessage: e.message }) }
  if (body.consent !== true) throw createError({ statusCode: 400, statusMessage: 'Confirm the recipient opted in to these messages' })
  const id = String(body.requestId || '')
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw createError({ statusCode: 400, statusMessage: 'A unique send request ID is required' })
  if (!['text', 'template'].includes(body.type)) throw createError({ statusCode: 400, statusMessage: 'Choose text or template' })
  let payload: any = { messaging_product: 'whatsapp', to, type: body.type }
  const token = connectionToken(row)
  if (body.type === 'text') {
    if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 4096) throw createError({ statusCode: 400, statusMessage: 'Text must contain 1–4096 characters' })
    payload.text = { body: body.text }
  } else {
    const templateId = await ownedTemplate(row, token, body.templateId)
    const template = await graph(templateId, token, 'GET', undefined, { fields: 'name,status,language' })
    if (template.status !== 'APPROVED') throw createError({ statusCode: 409, statusMessage: 'Only approved templates can be sent' })
    if (!Array.isArray(body.components) || JSON.stringify(body.components).length > 30000) throw createError({ statusCode: 400, statusMessage: 'Invalid template parameters' })
    payload.template = { name: template.name, language: { code: template.language }, components: body.components }
  }
  // Durable intent and deduplication precede the external side effect.
  const inserted = await pool.query(`INSERT INTO connect_whatsapp_messages(id,connection_id,recipient,direction,kind,content,status,consent_at,actor_id)
    VALUES($1,$2,$3,'outbound',$4,$5,'PENDING',NOW(),$6) ON CONFLICT(id) DO NOTHING RETURNING id`, [id, row.id, to, body.type, payload, actorId])
  if (!inserted.rowCount) {
    const old = (await pool.query('SELECT meta_id,status,content FROM connect_whatsapp_messages WHERE id=$1 AND connection_id=$2', [id, row.id])).rows[0]
    if (!old || !isDeepStrictEqual(old.content, payload)) throw createError({ statusCode: 409, statusMessage: 'Send ID already used. Refresh activity before starting another send.' })
    return { id, metaId: old.meta_id, status: old.status, duplicate: true }
  }
  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    const current = (await db.query('SELECT * FROM connect_whatsapp_connections WHERE id=$1 FOR UPDATE', [row.id])).rows[0]
    if (!current?.active) throw createError({ statusCode: 409, statusMessage: 'Connection was disconnected' })
    if (body.type === 'text') {
      const recent = await db.query(`SELECT id FROM connect_whatsapp_messages WHERE connection_id=$1 AND recipient=$2 AND direction='inbound' AND created_at > NOW()-INTERVAL '24 hours' AND created_at <= NOW() LIMIT 1`, [row.id, to])
      if (!recent.rowCount) throw createError({ statusCode: 409, statusMessage: 'Text replies require an inbound customer message within 24 hours. Send an approved template to start a conversation.' })
    }
    const result = await graph(`${current.phone_id}/messages`, connectionToken(current), 'POST', payload)
    const metaId = result.messages?.[0]?.id
    if (!metaId) throw createError({ statusCode: 504, statusMessage: 'Meta did not return a message ID. Check activity before sending again.' })
    await db.query("UPDATE connect_whatsapp_messages SET meta_id=$2,status='ACCEPTED',status_at=NOW() WHERE id=$1", [id, metaId])
    await db.query('COMMIT')
    return { id, metaId, status: 'ACCEPTED' }
  } catch (e: any) {
    await db.query('ROLLBACK')
    // A transport timeout or persistence failure can occur after Meta accepted.
    const status = e.statusCode === 502 || e.statusCode === 409 ? 'FAILED' : 'UNKNOWN'
    await pool.query('UPDATE connect_whatsapp_messages SET status=$2,status_at=NOW() WHERE id=$1', [id, status])
    throw e
  } finally { db.release() }
}
