import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHmac, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { createApp, createRouter, createError, eventHandler, getHeader, toNodeListener } from 'h3'
import { pool } from '../server/db'
import actionHandler from '../server/api/connect/whatsapp/[action]'
import webhookHandler from '../server/api/connect/whatsapp/webhook'
import { sealToken, openToken, validSignature, normalizeRecipient, validateTemplate } from '../server/utils/connect-whatsapp-security'
import { canManageConnect } from '../utils/connect-access'

test('Connect permits admins and managers and denies other roles', () => {
  for (const role of ['admin', 'manager']) assert.equal(canManageConnect(role), true)
  for (const role of ['user', 'biller', 'accountant', 'investor', '', 'Admin', null, undefined]) assert.equal(canManageConnect(role), false)
})

test('credentials authenticate ciphertext; webhook signatures cover the exact raw body', () => {
  const secret = 'a dedicated encryption key longer than thirty two characters', token = 'business-secret-token'
  const encrypted = sealToken(token, secret)
  assert.ok(!encrypted.includes(token)); assert.equal(openToken(encrypted, secret), token)
  assert.notEqual(encrypted, sealToken(token, secret))
  assert.throws(() => openToken(encrypted, secret + 'wrong'))
  const pieces = encrypted.split('.'); pieces[3] = Buffer.from('tampered').toString('base64url')
  assert.throws(() => openToken(pieces.join('.'), secret))
  assert.throws(() => sealToken(token, 'short'))
  const raw = '{"entry":[]}', signature = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex')
  assert.equal(validSignature(raw, signature, secret), true)
  assert.equal(validSignature(raw + ' ', signature, secret), false)
  assert.equal(validSignature(raw, 'sha256=bad', secret), false)
  assert.equal(validSignature(raw, signature, ''), false)
  assert.equal(normalizeRecipient('+91 (98765) 43210'), '919876543210')
  assert.throws(() => normalizeRecipient('00919876543210'))
  assert.throws(() => normalizeRecipient('123'))
  assert.throws(() => validateTemplate({ name: 'My Template' }))
  assert.equal(validateTemplate({ name: 'order_ready', language: 'en_US', category: 'UTILITY', components: [{ type: 'BODY', text: 'Ready' }] }).name, 'order_ready')
})

test('real HTTP handlers: tenant onboarding, templates, sending, receipt replay, replies and disconnect; all external I/O is mocked', async t => {
  const priorEnv = { ...process.env }, originalFetch = globalThis.fetch
  const priorQuery = pool.query, priorConnect = pool.connect, priorAuth = (globalThis as any).requireAuthSession
  Object.assign(process.env, { WHATSAPP_APP_ID: '123', WHATSAPP_APP_SECRET: 'app-secret', WHATSAPP_SIGNUP_CONFIG_ID: '456', WHATSAPP_CONNECT_VERIFY_TOKEN: 'verify-secret', WHATSAPP_ENCRYPTION_KEY: 'test-encryption-key-at-least-32-characters' })
  let row: any = null, messages: any[] = [], sends = 0, mode = 'ok', schemaMissing = false
  let templates = [{ id: '300', name: 'order_ready', language: 'en_US', category: 'UTILITY', status: 'APPROVED', components: [{ type: 'BODY', text: 'Your order is ready' }] }]
  const sqlCalls: string[] = [], graphCalls: string[] = []
  const result = (rows: any[] = []) => ({ rows, rowCount: rows.length })
  async function query(sql: string, args: any[] = []): Promise<any> {
    sqlCalls.push(sql)
    assert.ok(!/\b(CREATE|ALTER|DROP|TRUNCATE)\s+(TABLE|SCHEMA|INDEX|FUNCTION)/i.test(sql), 'runtime must never execute DDL')
    if (schemaMissing) throw Object.assign(new Error('missing table'), { code: '42P01' })
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql) || sql.includes('pg_advisory_xact_lock') || sql.includes('LIMIT 0')) return result()
    if (sql.startsWith('INSERT INTO connect_whatsapp_connections')) {
      row = { id: args[0], company_id: args[1], waba_id: args[2], phone_id: args[3], display_phone: args[4], verified_name: args[5], token: args[6], active: true, subscribed: false }
      return result([row])
    }
    if (sql.includes('FROM connect_whatsapp_connections')) {
      if (!row) return result()
      if (sql.includes('company_id=$1') && args[0] !== row.company_id) return result()
      if (sql.includes('phone_id=$1') && (args[0] !== row.phone_id || args[1] !== row.waba_id || !row.active)) return result()
      return result([row])
    }
    if (sql.startsWith('UPDATE connect_whatsapp_connections')) {
      if (sql.includes('active=false')) Object.assign(row, { active: false, subscribed: false, token: '' })
      else row.subscribed = true
      return result()
    }
    if (sql.startsWith('INSERT INTO connect_whatsapp_messages')) {
      const inbound = sql.includes("'inbound'")
      if (inbound && messages.some(m => m.meta_id === args[2])) return result()
      if (!inbound && messages.some(m => m.id === args[0])) return result()
      const m = inbound ? { id: args[0], connection_id: args[1], meta_id: args[2], recipient: args[3], direction: 'inbound', kind: args[4], content: args[5], status: 'RECEIVED', created_at: args[6] }
        : { id: args[0], connection_id: args[1], recipient: args[2], direction: 'outbound', kind: args[3], content: structuredClone(args[4]), status: 'PENDING', actor_id: args[5], created_at: new Date() }
      messages.push(m); return result([{ id: m.id }])
    }
    if (sql.startsWith('SELECT meta_id,status,content')) return result(messages.filter(m => m.id === args[0] && m.connection_id === args[1]))
    if (sql.includes("direction='inbound'")) return result(messages.filter(m => m.connection_id === args[0] && m.recipient === args[1] && m.direction === 'inbound' && new Date(m.created_at).getTime() > Date.now()-86400000))
    if (sql.startsWith('SELECT id,meta_id')) return result(messages.filter(m => m.connection_id === args[0]).map(m => ({ ...m, metaId: m.meta_id, createdAt: m.created_at })))
    if (sql.startsWith('UPDATE connect_whatsapp_messages SET meta_id=')) {
      Object.assign(messages.find(m => m.id === args[0]), { meta_id: args[1], status: 'ACCEPTED' }); return result()
    }
    if (sql.startsWith('UPDATE connect_whatsapp_messages SET status=$2')) { messages.find(m => m.id === args[0]).status = args[1]; return result() }
    if (sql.startsWith('UPDATE connect_whatsapp_messages SET status=$3')) {
      const m = messages.find(m => m.connection_id === args[0] && m.meta_id === args[1] && m.direction === 'outbound')
      const rank: Record<string, number> = { READ: 4, DELIVERED: 3, FAILED: 2, SENT: 1 }
      if (m && (rank[args[2]] || 0) >= (rank[m.status] || 0)) m.status = args[2]
      return result()
    }
    throw new Error('Unexpected SQL in fixture: ' + sql)
  }
  ;(pool as any).query = query; (pool as any).connect = async () => ({ query, release() {} })
  ;(globalThis as any).requireAuthSession = async (event: any) => {
    if (getHeader(event, 'x-test-role') === 'anonymous') throw createError({ statusCode: 401, statusMessage: 'Login required' })
    return { data: { id: 'admin-a', companyId: 'company-a', role: getHeader(event, 'x-test-role') || 'admin' } }
  }
  globalThis.fetch = (async (input: any, options: any = {}) => {
    const url = new URL(String(input))
    if (url.hostname !== 'graph.facebook.com') return originalFetch(input, options)
    const path = url.pathname.replace(/^\/v\d+\.0\//, ''), method = options.method || 'GET'
    graphCalls.push(`${method} ${path}`)
    let data: any
    if (path === 'oauth/access_token') data = { access_token: 'business-token' }
    else if (path === 'debug_token') data = { data: { is_valid: mode !== 'invalid-token', app_id: '123', scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'], granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['100'] }] } }
    else if (path === '100/phone_numbers') data = { data: [{ id: '200', display_phone_number: '+91 98765 43210', verified_name: 'Sample Company' }] }
    else if (path === '100/subscribed_apps') data = { success: true, data: [{ whatsapp_business_api_data: { id: '123' } }] }
    else if (path === '200') data = { id: '200', verified_name: 'Sample Company', quality_rating: 'GREEN' }
    else if (path === '200/register') data = { success: true }
    else if (path === '200/whatsapp_business_profile') data = method === 'GET' ? { data: [{ about: 'Sample company' }] } : { success: true }
    else if (path === '100/message_templates' && method === 'GET') data = { data: templates, paging: { next: 'https://graph.facebook.com/?access_token=secret', cursors: { after: 'opaque-cursor' } } }
    else if (path === '100/message_templates' && method === 'POST') { templates.push({ ...JSON.parse(options.body), id: '301', status: 'PENDING' }); data = { id: '301', status: 'PENDING' } }
    else if (path === '100/message_templates' && method === 'DELETE') { templates = templates.filter(t => t.id !== url.searchParams.get('hsm_id')); data = { success: true } }
    else if (path === '300' || path === '301') data = templates.find(t => t.id === path)
    else if (path === '200/messages') {
      sends++
      if (mode === 'timeout') throw new Error('request timed out with secret-url')
      if (mode === 'reject') return new Response(JSON.stringify({ error: { code: 131030, message: 'private token business-token' } }), { status: 400 })
      data = { messages: [{ id: `wamid.${sends}` }] }
    } else throw new Error('Unexpected Graph request ' + path)
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as any
  const app = createApp(), router = createRouter()
  app.use(eventHandler(event => { event.context.authorizedCompanyIds = Promise.resolve(['company-a']) }))
  router.use('/api/connect/whatsapp/webhook', webhookHandler)
  router.use('/api/connect/whatsapp/:action', actionHandler)
  app.use(router)
  const server = createServer(toNodeListener(app)); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as any).port}`
  t.after(async () => {
    globalThis.fetch = originalFetch; (pool as any).query = priorQuery; (pool as any).connect = priorConnect
    ;(globalThis as any).requireAuthSession = priorAuth
    for (const key of Object.keys(process.env)) if (!(key in priorEnv)) delete process.env[key]
    Object.assign(process.env, priorEnv)
    await new Promise<void>(resolve => server.close(() => resolve()))
  })
  let cookie = ''
  async function request(action: string, method = 'GET', body?: any, headers: any = {}) {
    const response = await fetch(`${origin}/api/connect/whatsapp/${action}`, { method, headers: { origin, cookie, 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
    const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0]
    return { status: response.status, data: await response.json(), headers: response.headers }
  }
  assert.equal((await request('status', 'GET', undefined, { 'x-test-role': 'anonymous' })).status, 401)
  assert.equal((await request('status', 'GET', undefined, { 'x-test-role': 'manager' })).status, 200)
  assert.equal((await request('status', 'GET', undefined, { 'x-test-role': 'user' })).status, 403)
  assert.equal((await request('status', 'GET', undefined, { 'x-test-role': 'manager', 'x-company-id': 'company-b' })).status, 403)
  assert.equal((await request('status', 'GET', undefined, { 'x-company-id': 'company-b' })).status, 403)
  assert.equal((await request('start', 'POST', {}, { origin: 'https://evil.example' })).status, 403)
  schemaMissing = true
  const missing = await request('status'); assert.equal(missing.data.schemaReady, false)
  schemaMissing = false
  const state = (await request('start', 'POST', {}, { 'x-test-role': 'manager' })).data.state; assert.ok(state)
  assert.equal((await request('exchange', 'POST', { code: 'code', state: 'wrong' })).status, 403)
  mode = 'invalid-token'; assert.equal((await request('exchange', 'POST', { code: 'code', state })).status, 400); mode = 'ok'
  const assets = await request('exchange', 'POST', { code: 'code', state }); assert.equal(assets.data.assets[0].phoneId, '200')
  assert.equal((await request('finish', 'POST', { state, wabaId: 'other', phoneId: '200' })).status, 403)
  const connected = await request('finish', 'POST', { state, wabaId: '100', phoneId: '200' })
  assert.equal(connected.status, 200); assert.equal(connected.data.connection.active, true)
  assert.ok(!JSON.stringify(connected.data).includes('token')); assert.ok(!row.token.includes('business-token'))
  assert.equal((await request('subscribe', 'POST', {})).status, 200); assert.equal(row.subscribed, true)
  assert.equal((await request('health')).data.phone.quality_rating, 'GREEN')
  assert.equal((await request('register', 'POST', { pin: '123' })).status, 400)
  assert.equal((await request('register', 'POST', { pin: '123456' })).status, 200)
  assert.equal((await request('profile')).data.data[0].about, 'Sample company')
  assert.equal((await request('profile', 'POST', { about: 'About', address: '', description: '', email: '', websites: ['https://example.com'] })).status, 200)
  assert.equal((await request('profile', 'POST', { about: 'About', address: '', description: '', email: '', websites: ['file:///secret'] })).status, 400)
  const list = await request('templates'); assert.equal(list.data.after, 'opaque-cursor'); assert.ok(!JSON.stringify(list.data).includes('access_token'))
  const created = await request('templates', 'POST', { name: 'order_followup', language: 'en_US', category: 'UTILITY', components: [{ type: 'BODY', text: 'Thank you' }] })
  assert.equal(created.data.status, 'PENDING')
  assert.equal((await request('templates', 'PUT', { id: '301', name: 'order_followup', language: 'en_US', category: 'UTILITY', components: [{ type: 'BODY', text: 'Updated message' }] })).status, 200)
  assert.equal((await request('templates', 'DELETE', { id: '999' })).status, 404)
  const send = { requestId: randomUUID(), to: '+91 98765 43210', type: 'template', templateId: '300', components: [], consent: true }
  assert.equal((await request('messages', 'POST', { ...send, consent: false })).status, 400)
  assert.equal((await request('messages', 'POST', { ...send, templateId: '301' })).status, 409)
  const sent = await request('messages', 'POST', send); assert.equal(sent.data.status, 'ACCEPTED'); assert.equal(sends, 1)
  const duplicate = await request('messages', 'POST', send); assert.equal(duplicate.data.duplicate, true); assert.equal(sends, 1)
  assert.equal((await request('messages', 'POST', { ...send, to: '14155551234' })).status, 409)
  const noWindow = await request('messages', 'POST', { requestId: randomUUID(), to: send.to, type: 'text', text: 'Hi', consent: true }); assert.equal(noWindow.status, 409); assert.equal(sends, 1)
  async function webhook(value: any, good = true, waba = '100') {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: waba, changes: [{ field: 'messages', value: { metadata: { phone_number_id: '200' }, ...value } }] }] })
    return fetch(`${origin}/api/connect/whatsapp/webhook`, { method: 'POST', headers: { 'x-hub-signature-256': good ? 'sha256=' + createHmac('sha256', 'app-secret').update(body).digest('hex') : 'sha256=bad' }, body })
  }
  assert.equal((await webhook({}, false)).status, 401)
  const verified = await fetch(`${origin}/api/connect/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-secret&hub.challenge=12345`)
  assert.equal(await verified.text(), '12345')
  assert.equal((await fetch(`${origin}/api/connect/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345`)).status, 403)
  const receipt = (status: string) => ({ statuses: [{ id: sent.data.metaId, status, timestamp: String(Math.floor(Date.now()/1000)) }] })
  await webhook(receipt('read')); await webhook(receipt('sent')); await webhook(receipt('failed'))
  assert.equal(messages.find(m => m.meta_id === sent.data.metaId).status, 'READ')
  const inbound = { messages: [{ id: 'wamid.inbound', from: '919876543210', type: 'text', text: { body: 'Thanks' }, timestamp: String(Math.floor(Date.now()/1000)-10) }] }
  await webhook(inbound, true, 'different-waba'); assert.equal(messages.filter(m => m.direction === 'inbound').length, 0)
  await webhook(inbound); await webhook(inbound); assert.equal(messages.filter(m => m.direction === 'inbound').length, 1)
  assert.equal((await request('messages', 'POST', { requestId: randomUUID(), to: send.to, type: 'text', text: 'You are welcome', consent: true })).data.status, 'ACCEPTED')
  mode = 'timeout'; const timeoutId = randomUUID()
  const timeout = await request('messages', 'POST', { ...send, requestId: timeoutId }); assert.equal(timeout.status, 504)
  assert.ok(!JSON.stringify(timeout.data).includes('secret-url')); assert.equal(messages.find(m => m.id === timeoutId).status, 'UNKNOWN')
  mode = 'ok'; const sendsBefore = sends; await request('messages', 'POST', { ...send, requestId: timeoutId }); assert.equal(sends, sendsBefore)
  mode = 'reject'; const rejected = await request('messages', 'POST', { ...send, requestId: randomUUID() }); assert.equal(rejected.status, 502); assert.ok(!JSON.stringify(rejected.data).includes('business-token')); mode = 'ok'
  const historyLength = messages.length
  assert.equal((await request('disconnect', 'POST', {})).status, 200); assert.equal(row.token, ''); assert.equal(row.active, false)
  assert.equal(messages.length, historyLength); assert.equal((await request('messages')).status, 200)
  assert.equal((await request('messages', 'POST', { ...send, requestId: randomUUID() })).status, 409)
  assert.ok(graphCalls.includes('POST 100/message_templates')); assert.ok(graphCalls.includes('DELETE 100/subscribed_apps'))
  assert.ok(sqlCalls.length > 10)
})
