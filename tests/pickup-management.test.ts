import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { addPickupShipments, carrierScheduleInput, requirePickupScheduleSchema } from '../server/utils/pickup-management'

function fixture(options: { missing?: boolean; status?: string; carrierId?: string; existing?: string[]; eligible?: any[] } = {}) {
  const calls: { sql: string; params: any[] }[] = []
  const db = { query: async (sql: string, params: any[] = []) => {
    calls.push({ sql, params })
    if (sql.includes('FROM ecomm_pickup_requests')) return { rows: options.missing ? [] : [{ id: 'pickup', location: 'Warehouse', carrier: 'delhivery',
      status: options.status ?? 'REQUESTED', carrier_pickup_id: options.carrierId ?? '336888426', order_ids: options.existing ?? [] }] }
    if (sql.includes('SELECT s.id')) return { rows: options.eligible ?? [{ id: 'order:forward', orderId: 'order', kind: 'forward' }] }
    return { rows: [] }
  } }
  return { db, calls }
}
test('adding parcels scopes every read/write, locks orders and updates handover count without a carrier call', async () => {
  const f = fixture({ existing: ['old:exchange'] })
  assert.deepEqual(await addPickupShipments(f.db, 'company', 'pickup', ['order:forward', 'order:forward']), { added: 1, count: 2 })
  for (const call of f.calls) assert.equal(call.params[0], 'company')
  const selection = f.calls.find(call => call.sql.includes('SELECT s.id'))!
  assert.deepEqual(selection.params, ['company', 'delhivery', 'Warehouse', ['order:forward']])
  assert.ok(f.calls.findIndex(call => call.sql.includes('ORDER BY id FOR UPDATE')) < f.calls.indexOf(selection))
  const tag = f.calls.find(call => call.sql.startsWith('UPDATE ecomm_orders'))!
  assert.match(tag.sql, /\{shipping,pickupRequestId\}/)
  assert.deepEqual(tag.params, ['company', ['order'], 'pickup'])
  const update = f.calls.find(call => call.sql.startsWith('UPDATE ecomm_pickup_requests'))!
  assert.deepEqual(JSON.parse(update.params[2]), ['old:exchange', 'order:forward'])
  assert.equal(update.params[3], 2)
})
test('exchange parcels retain independent tags and can coexist with their original forward parcel', async () => {
  const f = fixture({ existing: ['order:forward'], eligible: [{ id: 'order:exchange', orderId: 'order', kind: 'exchange' }] })
  assert.deepEqual(await addPickupShipments(f.db, 'company', 'pickup', ['order:exchange']), { added: 1, count: 2 })
  assert.match(f.calls.find(call => call.sql.startsWith('UPDATE ecomm_orders'))!.sql, /\{shipping,exchange,pickupRequestId\}/)
})
test('retries and legacy bare-order assignments do not duplicate parcels', async () => {
  for (const existing of [['order:forward'], ['order']]) {
    const f = fixture({ existing })
    assert.deepEqual(await addPickupShipments(f.db, 'company', 'pickup', ['order:forward']), { added: 0, count: 1 })
    assert.equal(f.calls.length, 1)
  }
})
test('foreign, closed or missing-carrier pickups cannot receive parcels', async () => {
  for (const options of [{ missing: true }, { status: 'PICKED' }, { status: 'CANCELLED' }, { carrierId: '' }]) {
    const f = fixture(options)
    await assert.rejects(addPickupShipments(f.db, 'company', 'pickup', ['order:forward']))
    assert.equal(f.calls.length, 1)
  }
})
test('stale, assigned, wrong-carrier or wrong-warehouse selections fail atomically before any writes', async () => {
  const f = fixture({ eligible: [] })
  await assert.rejects(addPickupShipments(f.db, 'company', 'pickup', ['order:forward']), { statusCode: 409 })
  assert.ok(f.calls.every(call => !call.sql.startsWith('UPDATE')))
})
test('invalid parcel ids and empty selections fail before querying', async () => {
  const f = fixture()
  for (const ids of [[], ['order'], ['order:reverse']]) await assert.rejects(addPickupShipments(f.db, 'company', 'pickup', ids), { statusCode: 400 })
  assert.equal(f.calls.length, 0)
})
test('carrier slot is explicitly recorded without replacing the requested schedule', () => {
  const slot = carrierScheduleInput({ date: '2026-11-16', startTime: '14:00', endTime: '18:00' })
  assert.equal(slot.date, '2026-11-16'); assert.equal(slot.source, 'manual')
  assert.equal(slot.startTime, '14:00'); assert.equal(slot.endTime, '18:00')
  assert.ok(slot.recordedAt)
  for (const change of [{ date: '2026-02-30' }, { startTime: '25:00' }, { endTime: '13:00' }, { endTime: '' }]) {
    assert.throws(() => carrierScheduleInput({ date: '2026-11-16', startTime: '14:00', endTime: '18:00', ...change }), { statusCode: 400 })
  }
})
test('pending migration fails explicitly before carrier booking; other database errors are preserved', async () => {
  const missing = { query: async () => { throw Object.assign(Error('missing column'), { code: '42703' }) } }
  await assert.rejects(requirePickupScheduleSchema(missing), { statusCode: 503 })
  const outage = Error('connection unavailable')
  await assert.rejects(requirePickupScheduleSchema({ query: async () => { throw outage } }), outage)
})

function raiseHarness(migrationPending = false) {
  const calls: { sql: string; params: any[] }[] = []
  let carrierCalls = 0
  const db = { query: async (sql: string, params: any[] = []) => {
    calls.push({ sql, params })
    if (sql.includes('LIMIT 0') && migrationPending) throw Object.assign(Error('missing column'), { code: '42703' })
    if (sql.includes('SELECT id, "orderId", kind, awb')) return { rows: [{ id: 'order:forward', orderId: 'order', kind: 'forward', awb: 'AWB' }] }
    if (sql.includes('UPDATE ecomm_orders')) return { rows: [{ id: 'order' }] }
    return { rows: [] }
  } }
  const response = { pickup_id: '336888426' }
  const modules: Record<string, any> = {
    h3: { defineEventHandler: (handler: any) => handler, readBody: async () => ({ location: 'Warehouse', date: '2026-11-15', time: '16:00:00', carriers: ['delhivery'], shipmentIds: ['order:forward'] }),
      createError: (error: any) => Object.assign(Error(error.statusMessage), error) },
    crypto: { randomUUID: () => 'new-pickup' },
    '~/server/db': { pool: { ...db, connect: async () => ({ ...db, release() {} }) } },
    '~/server/utils/shipping': { runShippingOperation: async () => { carrierCalls++; return { pickupId: '336888426', response } } },
    '~/server/utils/pickup-shipments': { PICKUP_SHIPMENTS_SQL: 'eligible', pickupTagPath: (kind: string) => kind === 'exchange' ? '{shipping,exchange,pickupRequestId}' : '{shipping,pickupRequestId}' },
    '~/server/utils/pickup-management': { requirePickupScheduleSchema },
  }
  const exports: any = {}
  const source = readFileSync(new URL('../server/api/ecommerce-cms/pickup/raise.post.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(code, { exports, require: (name: string) => { assert.ok(modules[name], name); return modules[name] },
    useAuthSession: async () => ({ data: { companyId: 'company' } }) })
  return { run: exports.default, calls, response, carrierCalls: () => carrierCalls }
}
test('creation retains requested date/time and original response without claiming an allocated slot', async () => {
  const harness = raiseHarness()
  const result = await harness.run({})
  assert.equal(result.results[0].ok, true)
  const insert = harness.calls.find(call => call.sql.includes('INSERT INTO ecomm_pickup_requests'))!
  assert.match(insert.sql, /requested_pickup_date, requested_pickup_time, carrier_response/)
  assert.equal(insert.params[4], '2026-11-15'); assert.equal(insert.params[5], '16:00:00')
  assert.deepEqual(JSON.parse(insert.params[9]), harness.response)
  assert.doesNotMatch(insert.sql, /carrier_schedule/)
  assert.equal(harness.carrierCalls(), 1)
})
test('creation checks migration before contacting Delhivery or attempting persistence', async () => {
  const harness = raiseHarness(true)
  await assert.rejects(harness.run({}), { statusCode: 503 })
  assert.equal(harness.carrierCalls(), 0)
  assert.equal(harness.calls.length, 1)
})
