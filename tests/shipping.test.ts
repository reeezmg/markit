import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import vm from 'node:vm'
import ts from 'typescript'
import { createShippingService, canAdvance } from '../server/utils/shipping/service'
import { pickBoxes, resolveOrderLines, type ShippingRow } from '../server/utils/shipping/cartonization'
import { createDelhivery, normalizeStatus } from '../server/utils/shipping/delhivery'
import { handleShippingWebhook } from '../server/utils/shipping/webhook'
import { zipFiles } from '../server/utils/shipping/zip'
import { legacyCarrier } from '../server/utils/shipping/legacy-carriers'

const company = 'seller-company'
function fixture(options: { missingDimensions?: boolean; missingConfig?: boolean; shipped?: boolean; grandTotal?: number; carrierFail?: boolean } = {}) {
  const order: ShippingRow = { id: 'order-1', orderNumber: '16', status: 'PACKED', paymentMethod: 'COD', grandTotal: options.grandTotal || 100,
    items: [{ itemId: 'item-1', name: 'Hijab', size: 'M', shade: 'Blue', quantity: 1 }], meta: options.shipped ? { awb: 'AWB-1', shipping: { provider: 'delhivery', awb: 'AWB-1', ewbn: '123', labelUrl: 'https://labels.example/expired' } } : {},
    shippingAddress: { firstName: 'Customer', phoneNo: '1234567890', formattedAddress: 'Test street', city: 'City', state: 'State', pincode: '575001' } }
  const location = { id: 'location-1', name: ' Warehouse ', registered_with_carrier: true, address: 'Warehouse address', pincode: '575001', phone: '123', contact_name: 'Seller', city: 'City', state: 'State', carrier_meta: {} }
  const cfg = { primary: 'delhivery', providers: { delhivery: { enabled: true, apiToken: 'carrier-secret', webhookToken: 'webhook-secret' } } }
  const preferences: ShippingRow = { provider_config: cfg, label_size: '4R', waybill_pool: { delhivery: ['POOL-1', 'POOL-2'] } }
  const queries: { sql: string; params: any[] }[] = [], requests: { url: string; init: RequestInit }[] = []
  const db = { query: async (sql: string, params: any[] = []) => {
    queries.push({ sql, params })
    if (/^BEGIN|^COMMIT|^ROLLBACK|pg_advisory|set_config/.test(sql)) return { rows: [] }
    if (sql.includes('INSERT INTO general_preferences')) { preferences[params[2]] = JSON.parse(params[3]); return { rows: [] } }
    if (sql.includes('SELECT preference_value')) {
      const key = params[1] || 'provider_config'
      return { rows: options.missingConfig && key === 'provider_config' ? [] : [{ preference_value: preferences[key] }] }
    }
    if (sql.includes('FROM items i')) return { rows: options.missingDimensions ? [] : [{ item_id: 'item-1', iw: 0.2, il: 10, iwd: 10, ih: 10, pw: 1, pl: 20, pwd: 20, ph: 20 }] }
    if (sql.includes('FROM shipping_boxes')) return { rows: [{ name: 'Small', weight: 0.05, length: 10, width: 10, height: 10 }] }
    if (sql.includes('FROM ecomm_pickup_locations')) return { rows: [location] }
    if (sql.includes('FROM companies')) return { rows: [{ name: 'Seller' }] }
    if (sql.includes('FROM ecomm_order_requests')) return { rows: [{ id: 'request-1', order_id: order.id, type: 'return', status: 'APPROVED', items: order.items, meta: {} }] }
    if (sql.startsWith('SELECT meta FROM ecomm_orders')) return { rows: params[1].every((id: string) => ['AWB-1', 'RVP-1'].includes(id)) ? [{ meta: { awb: 'AWB-1', shipping: { reverse: { awb: 'RVP-1' } } } }] : [] }
    if (sql.includes('FROM ecomm_orders')) {
      if (sql.includes('WHERE eo.company_id=$1') && params[0] !== company) return { rows: [] }
      if (sql.includes('(eo.id=$2') && !['order-1', '16'].includes(params[1])) return { rows: [] }
      if (sql.includes('eo.id=ANY') && !params[1].includes(order.id) && !params[1].includes(order.orderNumber)) return { rows: [] }
      if (sql.includes('SELECT checkout_id,bill_id')) return { rows: [{ checkout_id: 'checkout-1', bill_id: 'bill-1' }] }
      if (sql.startsWith('SELECT meta#')) return { rows: [{ url: 'https://labels.example/expired' }] }
      return { rows: [order] }
    }
    if (sql.startsWith('UPDATE ecomm_orders')) {
      if (sql.includes('SET meta=COALESCE') && params[2]) Object.assign(order.meta, JSON.parse(params[2]))
      if (sql.includes("status='PACKED'")) { order.meta = JSON.parse(params[2]); order.status = 'PACKED' }
      return { rows: [] }
    }
    return { rows: [] }
  } }
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input); requests.push({ url, init })
    if (url.includes('labels.example/expired')) return new Response('expired', { status: 410 })
    if (url.includes('labels.example/fresh')) return new Response('%PDF-label')
    if (url.includes('create.json')) {
      if (options.carrierFail) return Response.json({ packages: [{ remarks: ['575001 is non serviceable pincode'] }] })
      const body = JSON.parse(String(init.body).replace('format=json&data=', ''))
      return Response.json({ packages: body.shipments.map((s: any) => ({ waybill: s.waybill || 'AWB-1', status: 'Manifested' })) })
    }
    if (url.includes('packing_slip')) return Response.json({ packages: [{ waybill: 'AWB-1', pdf_download_link: 'https://labels.example/fresh', snm: '', sadd: '' }] })
    if (url.includes('packages/json')) return Response.json({ ShipmentData: [{ Shipment: { AWB: 'AWB-1', Status: { Status: 'Delivered', StatusType: 'DL', StatusCode: 'EOD-38' }, Scans: [] } }] })
    if (url.includes('pin-codes')) return Response.json({ delivery_codes: [{ postal_code: { cod: 'Y', pre_paid: 'Y' } }] })
    if (url.includes('/api/p/edit')) return Response.json({ status: 'Success' })
    if (url.includes('/api/p/update')) return Response.json({ request_id: 'UPL-1' })
    return Response.json({ success: true, pickup_id: 'PICKUP-1' })
  }
  const delivered: string[] = []
  const service = createShippingService(db, company, fetcher, async (_db, scope, id) => { assert.equal(scope, company); delivered.push(id) })
  return { ...service, db, order, location, queries, requests, preferences, fetcher, delivered }
}

test('single-order preview resolves item dimensions first and stays read-only without any HTTP call', async () => {
  const f = fixture(), result = await f.run({ method: 'GET', path: 'order/order-1/preview' })
  assert.equal(result.order.canShip, true); assert.equal(result.order.totalWeight, 0.25)
  assert.equal(result.order.lines[0].source, 'item'); assert.match(result.order.lines[0].name, /Size: M.*Shade: Blue/)
  assert.equal(result.pickupLocation, 'Warehouse'); assert.equal(f.requests.length, 0)
  assert.ok(f.queries.every(q => /^SELECT/.test(q.sql)))
  assert.ok(f.queries.filter(q => q.sql.includes('WHERE')).every(q => q.params.includes(company)))
})
test('unknown or foreign order cannot be previewed or manifested', async () => {
  const f = fixture()
  await assert.rejects(f.run({ method: 'GET', path: 'order/foreign/preview' }), { statusCode: 404 })
  await assert.rejects(f.run({ method: 'POST', path: 'order/foreign/create' }), { statusCode: 404 })
  assert.equal(f.requests.length, 0)
})
test('missing dimensions, phone, ewaybill and terminal orders block manifestation', async () => {
  for (const change of ['dimensions', 'phone', 'ewaybill', 'cancelled']) {
    const f = fixture({ missingDimensions: change === 'dimensions', grandTotal: change === 'ewaybill' ? 50001 : 100 })
    if (change === 'phone') f.order.shippingAddress.phoneNo = ''
    if (change === 'cancelled') f.order.status = 'CANCELLED'
    const result = await f.run({ method: 'GET', path: 'order/order-1/preview' })
    assert.equal(result.order.canShip, false, change)
    await assert.rejects(f.run({ method: 'POST', path: 'order/order-1/create' }), { statusCode: 400 })
    assert.equal(f.requests.length, 0)
  }
})
test('create sends carrier-native payload in-process and commits AWB before generating labels', async () => {
  const f = fixture(), result = await f.run({ method: 'POST', path: 'order/order-1/create' })
  assert.equal(result.awb, 'AWB-1'); assert.equal(result.labelUrl, 'https://labels.example/fresh')
  assert.equal(f.order.meta.shipping.totalWeight, 0.25)
  const request = f.requests.find(r => r.url.includes('create.json'))!, payload = JSON.parse(String(request.init.body).replace('format=json&data=', ''))
  assert.equal(payload.pickup_location.name, 'Warehouse'); assert.equal(payload.shipments[0].weight, 250)
  assert.equal(payload.shipments[0].payment_mode, 'COD'); assert.equal(payload.shipments[0].cod_amount, 100)
  assert.equal(payload.shipments[0].seller_name, 'Seller')
  assert.ok(f.requests.every(r => r.url.startsWith('https://track.delhivery.com/')))
  assert.ok(f.queries.some(q => q.sql === 'COMMIT'))
  await assert.rejects(f.run({ method: 'POST', path: 'order/order-1/create' }), /Already shipped/)
  assert.equal(f.requests.filter(r => r.url.includes('create.json')).length, 1)
})
test('multi-box shipment uses pooled waybills, master/child IDs and one COD charge', async () => {
  const f = fixture(); f.order.items[0].quantity = 2
  const result = await f.run({ method: 'POST', path: 'order/order-1/create' })
  assert.equal(result.awb, 'POOL-1'); assert.equal(result.boxCount, 2)
  const req = f.requests.find(r => r.url.includes('create.json'))!, data = JSON.parse(String(req.init.body).replace('format=json&data=', ''))
  assert.deepEqual(data.shipments.map((s: any) => s.waybill), ['POOL-1', 'POOL-2'])
  assert.deepEqual(data.shipments.map((s: any) => s.cod_amount), [100, 0])
  assert.deepEqual(f.order.meta.shipping.childAwbs, ['POOL-2'])
  assert.equal(f.requests.some(r => r.url.includes('/waybill/')), false)
})
test('carrier body rejection rolls back persistence and surfaces the actual reason', async () => {
  const f = fixture({ carrierFail: true })
  await assert.rejects(f.run({ method: 'POST', path: 'order/order-1/create' }), /Pincode 575001 is not serviceable by Delhivery/)
  assert.equal(f.order.meta.awb, undefined); assert.ok(f.queries.some(q => q.sql === 'ROLLBACK'))
})
test('rejected multi-piece manifestation restores unused pooled waybills', async () => {
  const f = fixture({ carrierFail: true }); f.order.items[0].quantity = 2
  await assert.rejects(f.run({ method: 'POST', path: 'order/order-1/create' }), /not serviceable/)
  assert.deepEqual(f.preferences.waybill_pool.delhivery, ['POOL-1', 'POOL-2'])
  assert.equal(f.order.meta.awb, undefined)
})
test('bulk preview and create support explicit empty selection without shipping all orders', async () => {
  const f = fixture()
  const preview = await f.run({ method: 'POST', path: 'bulk-preview', body: { orderIds: [] } })
  const create = await f.run({ method: 'POST', path: 'bulk-create', body: { orderIds: [] } })
  assert.equal(preview.total, 0); assert.equal(create.created, 0); assert.equal(f.requests.length, 0)
  await assert.rejects(f.run({ method: 'POST', path: 'bulk-create', body: { orderIds: 'all' } }), /orderIds must be an array/)
})
test('unconfigured provider list is empty while carrier operations require setup', async () => {
  const f = fixture({ missingConfig: true })
  assert.deepEqual(await f.run({ method: 'GET', path: 'providers' }), { providers: [], priority: [], primary: '' })
  await assert.rejects(f.run({ method: 'GET', path: 'serviceability', query: { pincode: '575001' } }), { statusCode: 404 })
})
test('providers and label-size preserve existing response contracts', async () => {
  const f = fixture(), result = await f.run({ method: 'GET', path: 'providers' })
  assert.equal(result.providers[0].supportsPickup, true); assert.equal(result.primary, 'delhivery')
  assert.deepEqual(await f.run({ method: 'GET', path: 'label-size' }), { size: '4R' })
  assert.deepEqual(await f.run({ method: 'POST', path: 'label-size', body: { size: 'invalid' } }), { size: 'A4' })
})
test('tracking never advances terminal orders, permits retries and records delivery in the transaction', async () => {
  assert.equal(canAdvance('DELIVERED', 'CANCELLED'), false); assert.equal(canAdvance('CANCELLED', 'DELIVERED'), false)
  assert.equal(canAdvance('UNDELIVERED', 'OUT_FOR_DELIVERY'), true); assert.equal(canAdvance('NOT_PICKED', 'MANIFESTED'), true)
  assert.equal(canAdvance('SHIPPED', 'MANIFESTED'), false); assert.equal(canAdvance('PACKED', 'unknown'), false)
  const f = fixture({ shipped: true }), result = await f.run({ method: 'GET', path: 'track-bulk', query: { waybills: 'AWB-1' } })
  assert.equal(result.statuses['AWB-1'].status, 'DELIVERED'); assert.equal(result.statuses['AWB-1'].nslCode, null)
  assert.equal(result.synced, 1); assert.deepEqual(f.delivered, ['order-1'])
  assert.ok(f.queries.some(q => q.sql.includes('UPDATE ecomm_checkouts') && q.params[0] === company))
  assert.ok(f.queries.some(q => q.sql.includes('INSERT INTO ecomm_order_status_history')))
})
test('foreign AWBs are rejected before any carrier call for tracking, edit, cancel and label', async () => {
  for (const opts of [
    { method: 'GET', path: 'track/FOREIGN' }, { method: 'GET', path: 'track-bulk', query: { waybills: 'FOREIGN' } },
    { method: 'POST', path: 'cancel', body: { awb: 'FOREIGN' } }, { method: 'POST', path: 'update', body: { awb: 'FOREIGN' } },
    { method: 'GET', path: 'label/FOREIGN/pdf' }, { method: 'POST', path: 'ndr', body: { awb: 'FOREIGN' } },
  ] as const) {
    const f = fixture(); await assert.rejects(f.run(opts), { statusCode: 404 }); assert.equal(f.requests.length, 0)
  }
})
test('carrier refuses cancellation after delivery without clearing the AWB', async () => {
  const f = fixture({ shipped: true })
  await assert.rejects(f.run({ method: 'POST', path: 'cancel', body: { awb: 'AWB-1' } }), /not allowed/)
  assert.equal(f.order.meta.awb, 'AWB-1'); assert.equal(f.requests.some(r => r.url.endsWith('/api/p/edit')), false)
})
test('accepted cancellation archives its AWB and returns the order to PACKED', async () => {
  const f = fixture({ shipped: true })
  const fetcher: typeof fetch = async input => String(input).includes('packages/json')
    ? Response.json({ ShipmentData: [{ Shipment: { Status: { Status: 'Manifested' } } }] })
    : Response.json({ status: 'Success' })
  const result = await createShippingService(f.db, company, fetcher).run({ method: 'POST', path: 'cancel', body: { awb: 'AWB-1' } })
  assert.equal(result.released, true); assert.equal(f.order.meta.awb, undefined)
  assert.equal(f.order.meta.shipping.cancelled[0].awb, 'AWB-1'); assert.equal(f.order.status, 'PACKED')
})
test('label PDF regenerates expired stored URLs and returns bytes', async () => {
  const f = fixture({ shipped: true }), result = await f.run({ method: 'GET', path: 'label/AWB-1/pdf' })
  assert.equal(result.contentType, 'application/pdf'); assert.equal(result.body.toString(), '%PDF-label')
  assert.equal(f.requests[0]!.url, 'https://labels.example/expired')
  assert.ok(f.requests.some(r => r.url.includes('packing_slip')))
})
test('custom label data falls back to the seller trading name and address', async () => {
  const f = fixture({ shipped: true }), result = await f.run({ method: 'GET', path: 'label-data', query: { waybills: 'AWB-1' } })
  assert.equal(result.packages[0].snm, 'Seller'); assert.match(result.packages[0].sadd, /Warehouse address/)
})
test('approved return manifests Pickup flow and persists both request and order AWBs atomically', async () => {
  const f = fixture({ shipped: true }), result = await f.run({ method: 'POST', path: 'reverse', body: { requestId: 'request-1' } })
  assert.equal(result.awb, 'AWB-1')
  const data = JSON.parse(String(f.requests.find(r => r.url.includes('create.json'))!.init.body).replace('format=json&data=', ''))
  assert.equal(data.shipments[0].payment_mode, 'Pickup'); assert.equal(data.shipments[0].return_name, 'Seller')
  assert.ok(f.queries.some(q => q.sql.includes('UPDATE ecomm_order_requests') && q.params[0] === company))
})
test('NDR queues and persists UPL ID, and registration stores exact registered warehouse name', async () => {
  const f = fixture({ shipped: true }), result = await f.run({ method: 'POST', path: 'ndr', body: { awb: 'AWB-1', action: 'RE-ATTEMPT' } })
  assert.equal(result.uplId, 'UPL-1'); assert.ok(f.queries.some(q => q.sql.includes('{shipping,ndr,upl}') && q.params[0] === company))
  f.location.registered_with_carrier = false
  const registration = await f.run({ method: 'POST', path: 'pickup-locations/location-1/register' })
  assert.equal(registration.registered, true); assert.equal(registration.carrierMeta.registeredName, 'Warehouse')
})
test('webhook verifies company-specific token and forwards only to customer event intake', async () => {
  const f = fixture()
  await assert.rejects(handleShippingWebhook(f.db, company, 'delhivery', {}, 'wrong', 'https://custom.example/api', 'service-secret', f.fetcher), { statusCode: 401 })
  assert.equal(f.requests.length, 0)
  await handleShippingWebhook(f.db, company, 'delhivery', { awb: 'AWB-1' }, 'webhook-secret', 'https://custom.example/api', 'service-secret', f.fetcher)
  assert.equal(f.requests[0]!.url, 'https://custom.example/api/custom/seller-company/shipping/internal/webhook/delhivery')
  assert.equal((f.requests[0]!.init.headers as any)['X-Service-Token'], 'service-secret')
  await assert.rejects(handleShippingWebhook(f.db, company, 'unknown', {}, 'x', 'https://custom.example', 'secret', f.fetcher), { statusCode: 404 })
})
test('Delhivery preserves status leg distinctions and body-level failures', async () => {
  assert.equal(normalizeStatus('Delivered', 'RT'), 'RTO_DELIVERED'); assert.equal(normalizeStatus('DTO', 'DL'), 'RETURNED')
  assert.equal(normalizeStatus('Dispatched', 'PP'), 'OUT_FOR_PICKUP'); assert.equal(normalizeStatus('In Transit', 'PU'), 'RETURNING')
  assert.equal(normalizeStatus('Undelivered', 'UD'), 'UNDELIVERED'); assert.equal(normalizeStatus('new carrier wording'), null)
  const adapter = createDelhivery(async () => Response.json({ status: 'Failure', error: 'Invalid waybill' }))
  await assert.rejects(adapter.cancel({}, { awb: 'X' }), /Invalid waybill/)
})
test('Delhivery edit validation and warehouse/pickup body failures never report success', async () => {
  let requests = 0
  const adapter = createDelhivery(async () => { requests++; return Response.json({ success: false, error: 'Carrier refused' }) })
  await assert.rejects(adapter.update({}, { awb: 'X', paymentMode: 'COD' }), /requires a COD amount/)
  assert.equal(requests, 0)
  await assert.rejects(adapter.location({}, { name: 'Warehouse' }, false), /Carrier refused/)
  await assert.rejects(adapter.pickup({}, { pickupLocation: 'Warehouse' }), /Carrier refused/)
  await assert.rejects(adapter.ewaybill({}, 'X', 'INV-1', '123'), /Carrier refused/)

  const ambiguousPickup = createDelhivery(async () => Response.json({ success: true, message: 'Request received' }))
  await assert.rejects(
    ambiguousPickup.pickup({}, { pickupLocation: 'Warehouse', pickupDate: '2026-11-16' }),
    /did not create the pickup request/,
  )
})
test('legacy carrier transports retain existing create/track operations without calling another app', async () => {
  for (const provider of ['shiprocket', 'ecomexpress', 'xpressbees', 'shadowfax', 'dtdc', 'pickrr', 'dunzo', 'ekart']) {
    const requests: string[] = []
    const fetcher: typeof fetch = async input => {
      requests.push(String(input))
      return Response.json({ token: 'token', data: { token: 'token' }, tracking_data: {}, awb: 'X', awb_code: 'X' })
    }
    const body = { awb: 'X', orderNumber: '16', customerName: 'Customer', customerPhone: '123', deliveryAddress: 'Street', deliveryCity: 'City', deliveryState: 'State', deliveryPincode: '575001',
      paymentMethod: 'Prepaid', codAmount: 0, totalAmount: 100, weight: 1, length: 10, width: 10, height: 10, items: [] }
    assert.equal((await legacyCarrier(fetcher, provider, {}, 'create', body)).provider, provider)
    assert.equal((await legacyCarrier(fetcher, provider, {}, 'track', body)).provider, provider)
    assert.ok(requests.length >= 2)
    assert.ok(requests.every(url => url.startsWith('https://') && !url.includes('localhost') && !url.includes('/api/seller/')))
  }
})
test('cartonization rejects oversized items and caps the number of boxes', () => {
  const line = { name: 'Rod', resolved: true, qty: 1, weight: 1, length: 100, width: 1, height: 1 }
  const box = { name: 'Small', weight: 0.1, length: 10, width: 10, height: 10 }
  assert.match(pickBoxes([line], [box]).error!, /Too large/)
  assert.match(pickBoxes([{ ...line, length: 10, width: 10, height: 10, qty: 201 }], [box]).error!, /more than 200/)
})
test('dimension resolution falls back to complete product dimensions', async () => {
  const result = await resolveOrderLines({ query: async (_sql, params) => {
    assert.equal(params?.[0], company)
    return { rows: [{ item_id: 'item', iw: null, il: 1, iwd: 1, ih: 1, pw: 0.5, pl: 20, pwd: 10, ph: 2 }] }
  } }, company, [{ itemId: 'item', qty: 2 }])
  assert.equal(result.lines[0]!.source, 'product'); assert.equal(result.lines[0]!.weight, 0.5)
})
test('label ZIP contains decompressible PDF bytes with correct directory count', () => {
  const zip = zipFiles([{ name: 'label.pdf', body: Buffer.from('%PDF-label') }, { name: 'errors.txt', body: Buffer.from('Skipped one') }])
  assert.equal(zip.readUInt32LE(0), 0x04034b50)
  const offset = 30 + zip.readUInt16LE(26), length = zip.readUInt32LE(18)
  assert.equal(inflateRawSync(zip.subarray(offset, offset + length)).toString(), '%PDF-label')
  assert.equal(zip.readUInt16LE(zip.length - 22 + 10), 2)
})
test('seller route entry authenticates before opening the database and no shipping URL remains', () => {
  const entry = readFileSync(new URL('../server/utils/shipping/index.ts', import.meta.url), 'utf8')
  assert.ok(entry.indexOf('await useCompanyRequestSession(event)') < entry.indexOf('await pool.connect()'))
  const config = readFileSync(new URL('../nuxt.config.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(config, /SHIPPING_SERVICE_URL|shippingServiceUrl|localhost:8001/)
  const dir = new URL('../server/api/ecommerce-cms/shipping/', import.meta.url)
  for (const file of readdirSync(dir).filter(f => f.endsWith('.ts'))) assert.doesNotMatch(readFileSync(new URL(file, dir), 'utf8'), /shipping-proxy|shippingProxy/)
})

function entryHarness(auth: () => Promise<any>) {
  const source = readFileSync(new URL('../server/utils/shipping/index.ts', import.meta.url), 'utf8')
  const exports: any = {}, state = { connections: 0, released: 0, companyId: '', called: null as any }
  const connection = { query: async () => ({ rows: [] }), release: () => { state.released++ } }
  const modules: Record<string, any> = {
    '../../db': { pool: { connect: async () => { state.connections++; return connection } } },
    '../companyRequestScope': { useCompanyRequestSession: auth },
    './http': { shippingError: (message: string, statusCode: number) => Object.assign(Error(message), { statusCode }) },
    './service': { createShippingService: (_db: any, companyId: string) => {
      state.companyId = companyId
      return { run: async (options: any) => { state.called = options; return { body: Buffer.from('%PDF-fixture'), contentType: 'application/pdf' } } }
    } },
  }
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, { exports, Buffer, require: (name: string) => { assert.ok(modules[name], name); return modules[name] }, globalThis: { fetch: () => assert.fail('Unexpected HTTP') } })
  return { ...exports, state }
}
test('seller route rejects unauthenticated calls before connecting to the database', async () => {
  const harness = entryHarness(async () => { throw Object.assign(Error('Unauthorized'), { statusCode: 401 }) })
  await assert.rejects(harness.runShippingOperation({}, { method: 'GET', path: 'providers' }), { statusCode: 401 })
  assert.equal(harness.state.connections, 0)
})
test('seller route uses authorized company scope and releases its connection for binary responses', async () => {
  const harness = entryHarness(async () => ({ data: { companyId: company, id: 'seller' } }))
  const result = await harness.runShippingBinary({}, { method: 'GET', path: 'label/AWB/pdf', body: { companyId: 'foreign' } })
  assert.equal(harness.state.companyId, company); assert.equal(harness.state.released, 1)
  assert.equal(result.body.toString(), '%PDF-fixture')
})
