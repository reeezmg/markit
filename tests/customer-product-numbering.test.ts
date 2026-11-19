import assert from 'node:assert/strict'
import { test } from 'node:test'
import { customerProductReference, productReferencePrefix } from '../utils/customer-product-numbering'
import { nextCustomerProductReference, readProductNumbering, saveProductNumbering } from '../server/utils/customer-product-numbering'
import { Readable } from 'node:stream'
import { createEvent } from 'h3'
import { pool } from '../server/db'

function fixture(ready = true) {
  const counters = new Map<string, any>(), issued = new Set<string>(), calls: any[] = []
  const result = (rows: any[] = []) => ({ rows, rowCount: rows.length })
  const db = { async query(sql: string, args: any[] = []) {
    calls.push({ sql, args })
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return result()
    if (sql.startsWith('SELECT id FROM companies')) return result([{ id: args[0] }])
    if (sql.includes('to_regclass')) return result([{ ready }])
    if (sql.startsWith('SELECT prefix,')) return result(counters.has(args[0]) ? [{ ...counters.get(args[0]) }] : [])
    if (sql.startsWith('INSERT INTO customer_product_numbering')) { if (!counters.has(args[0])) counters.set(args[0], { prefix: 'PR', last_number: '0' }); return result() }
    if (sql.startsWith('UPDATE customer_product_numbering SET last_number')) { counters.get(args[0]).last_number = args[1]; return result() }
    if (sql.startsWith('UPDATE customer_product_numbering SET prefix')) { counters.get(args[0]).prefix = args[1]; return result() }
    if (sql.startsWith('SELECT 1 FROM customer_products')) return result(issued.has(args.join(':')) ? [{}] : [])
    if (sql.startsWith('INSERT INTO service_audit')) return result()
    throw Error('Unexpected query: ' + sql)
  } }
  return { db, counters, issued, calls }
}
test('default PR references increment per company, survive prefix switches and skip previously issued references', async () => {
  const f = fixture()
  assert.deepEqual(await readProductNumbering(f.db, 'a'), { prefix: 'PR', nextNumber: '1', nextReference: 'PR-000001', available: true })
  assert.equal(await nextCustomerProductReference(f.db, 'a', 'uuid'), 'PR-000001')
  assert.equal(await nextCustomerProductReference(f.db, 'a', 'uuid2'), 'PR-000002')
  assert.equal(await nextCustomerProductReference(f.db, 'b', 'uuid3'), 'PR-000001')
  await saveProductNumbering(f.db, 'a', 'staff', ' oc- ')
  assert.equal(await nextCustomerProductReference(f.db, 'a', 'uuid4'), 'OC-000003')
  await saveProductNumbering(f.db, 'a', 'staff', 'PR')
  f.issued.add('a:PR-000004')
  assert.equal(await nextCustomerProductReference(f.db, 'a', 'uuid5'), 'PR-000005')
  assert.equal(f.counters.get('b').last_number, '1')
  assert(f.calls.some(c => c.sql.endsWith('FOR UPDATE')), 'Counter and prefix writes lock the same company row')
  assert(f.calls.filter(c => c.sql.startsWith('UPDATE')).every(c => c.sql.includes('WHERE company_id=$1')))
  assert.equal(f.calls.filter(c => c.sql.startsWith('INSERT INTO service_audit')).length, 2)
})
test('migration guard keeps legacy registration operational and blocks changing numbering before installation', async () => {
  const f = fixture(false)
  assert.equal(await nextCustomerProductReference(f.db, 'a', 'old-uuid'), 'MP-old-uuid')
  assert.equal((await readProductNumbering(f.db, 'a')).available, false)
  await assert.rejects(saveProductNumbering(f.db, 'a', 'staff', 'PR'), { statusCode: 503 })
  assert(f.calls.every(c => c.sql.startsWith('SELECT')))
})
test('prefix validation, six digit padding and bigint counters do not truncate or wrap', async () => {
  assert.equal(productReferencePrefix('pr-'), 'PR')
  for (const value of ['', '-', 'P R', '<script>', 'a'.repeat(17), null]) assert.throws(() => productReferencePrefix(value))
  assert.equal(customerProductReference('PR', '1000000'), 'PR-1000000')
  const f = fixture(); f.counters.set('a', { prefix: 'PR', last_number: '9007199254740992' })
  assert.equal(await nextCustomerProductReference(f.db, 'a', 'uuid'), 'PR-9007199254740993')
})

test('settings routes enforce roles and selected company without changing the login company', async () => {
  const f = fixture(), auth = { data: { id: 'staff', companyId: 'head', role: 'manager' } }
  const originalAuth = (globalThis as any).requireAuthSession, originalConnect = pool.connect, originalQuery = pool.query
  ;(globalThis as any).requireAuthSession = async () => auth
  ;(pool as any).connect = async () => ({ ...f.db, release() {} })
  ;(pool as any).query = f.db.query
  try {
    const get = (await import('../server/api/settings/customer-product-numbering.get')).default
    const put = (await import('../server/api/settings/customer-product-numbering.put')).default
    function event(company: string, method = 'GET', prefix = 'PR') {
      const json = JSON.stringify({ prefix }), req: any = Readable.from([Buffer.from(json)])
      req.url = '/api/settings/customer-product-numbering'; req.method = method
      req.headers = { 'x-company-id': company, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(json)) }
      const e = createEvent(req, { setHeader() {} } as any); e.context.authorizedCompanyIds = Promise.resolve(['head', 'branch']); return e
    }
    assert.equal((await get(event('branch'))).nextReference, 'PR-000001')
    assert.equal((await put(event('branch', 'PUT', 'br-'))).prefix, 'BR')
    assert.equal(auth.data.companyId, 'head'); assert.equal(f.counters.has('head'), false)
    await assert.rejects(put(event('foreign', 'PUT')), { statusCode: 403 })
    auth.data.role = 'user'
    assert.equal((await get(event('branch'))).canEdit, false)
    await assert.rejects(put(event('branch', 'PUT')), { statusCode: 403 })
  } finally {
    ;(globalThis as any).requireAuthSession = originalAuth; pool.connect = originalConnect; pool.query = originalQuery
  }
})
