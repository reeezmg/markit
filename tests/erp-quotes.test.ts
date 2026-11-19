import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeQuote, newQuoteLine, quoteTotals } from '../utils/erp-quote'
import { readQuote, writeQuote } from '../server/utils/erp-quotes'

const input = () => ({ clientId: 'customer', quoteDate: '2026-10-28', expiryDate: '2026-11-10',
  referenceNumber: 'REF-1', subject: 'Office order', salesperson: 'Alex', status: 'DRAFT', notes: '',
  termsAndConditions: '', paymentTerms: '50% advance', deliveryEstimate: '7 working days',
  discount: 10, discountType: 'percent', adjustment: -0.5,
  items: [{ ...newQuoteLine('line-1'), name: 'Chair', variantId: 'variant', quantity: 2, rate: 118, discount: 10, tax: 18 }],
  requestId: 'request-1', revision: '',
})
test('tax-inclusive pricing applies line and document discounts once and allocates included tax', () => {
  assert.deepEqual(quoteTotals(normalizeQuote(input())), { subTotal: 212.4, discountAmount: 21.24, includedTax: 29.16, total: 190.66 })
  const quote = input(); quote.discountType = 'amount'; quote.discount = 12.4; quote.adjustment = 0
  assert.deepEqual(quoteTotals(normalizeQuote(quote)), { subTotal: 212.4, discountAmount: 12.4, includedTax: 30.51, total: 200 })
  quote.items[0].quantity = 0.125; quote.items[0].rate = 100; quote.items[0].discount = 0; quote.discount = 0
  assert.equal(quoteTotals(normalizeQuote(quote)).subTotal, 12.5)
})
test('rejects missing customer, impossible dates, duplicate lines and non-finite, negative or excessive amounts', () => {
  for (const patch of [{ clientId: '' }, { quoteDate: '2026-02-30' }, { expiryDate: '2026-01-01' }, { status: 'PAID' },
    { discount: 101 }, { discountType: 'other' }, { adjustment: Infinity }, { items: [] },
    { items: [...input().items, ...input().items] }, { notes: {} }]) {
    assert.throws(() => normalizeQuote({ ...input(), ...patch }))
  }
  for (const patch of [{ quantity: 0 }, { quantity: -1 }, { quantity: 1.0001 }, { rate: NaN }, { rate: -1 },
    { rate: 1.001 }, { discount: 101 }, { tax: -18 }, { name: '' }]) {
    assert.throws(() => normalizeQuote({ ...input(), items: [{ ...input().items[0], ...patch }] }))
  }
  assert.throws(() => normalizeQuote({ ...input(), discountType: 'amount', discount: 213 }))
  assert.throws(() => normalizeQuote({ ...input(), adjustment: -10000 }))
  assert.throws(() => normalizeQuote({ ...input(), items: [{ ...input().items[0], quantity: 999999, rate: 999999999 }] }))
})

export function database(options: { foreignCustomer?: boolean; foreignVariant?: boolean; existing?: boolean; revision?: string; failItems?: boolean; accepted?: boolean; preferences?: any } = {}) {
  const calls: { sql: string; values: any[] }[] = []
  let receipt: any
  let metadata: any
  const db = { release() {}, async query(sql: string, values: any[] = []): Promise<any> {
    calls.push({ sql, values })
    if (sql.includes('SELECT "after" FROM accountant_v2_accountant_audit')) return { rows: receipt ? [{ after: receipt }] : [] }
    if (sql.includes('INSERT INTO accountant_v2_accountant_audit')) receipt = JSON.parse(values[5])
    if (sql.includes('SELECT id FROM companies')) return { rows: [{ id: 'company' }] }
    if (sql.includes('SELECT q.id, f.field_values')) return { rows: options.existing === false ? [] : [{ id: 'quote', revision: options.revision || '', status: options.accepted ? 'ACCEPTED' : 'DRAFT' }] }
    if (sql.includes('SELECT preference_value FROM general_preferences')) return { rows: options.preferences ? [{ preference_value: options.preferences }] : [] }
    if (sql.includes('SELECT c.name, c.phone FROM clients')) return { rows: options.foreignCustomer ? [] : [{ name: 'Customer', phone: '1234567890' }] }
    if (sql.includes('SELECT v.id FROM variants')) return { rows: options.foreignVariant ? [] : [{ id: 'variant' }] }
    if (sql.includes('GREATEST(COALESCE(quote_counter')) return { rows: [{ prefix: 'QT', counter: 1 }] }
    if (sql.includes('SELECT 1 FROM quotes')) return { rows: values[1] === 'QT-00001' ? [{ exists: 1 }] : [] }
    if (sql.includes('INSERT INTO quote_items') && options.failItems) throw Error('Line write failed')
    if (sql.includes('INSERT INTO quote_custom_field_values')) metadata = JSON.parse(values[3])._erpQuote
    if (sql.includes('SELECT quote_number AS')) return { rows: [{ quoteNumber: 'QT-00002' }] }
    return { rows: [], rowCount: 1 }
  } }
  return { db, calls, get metadata() { return metadata } }
}

test('source writes recompute totals, skip old number collisions, preserve metadata and have no billing effects', async () => {
  const fixture = database()
  const result = await writeQuote(fixture.db, { companyId: 'company', userId: 'user' }, { ...input(), total: 999, subTotal: 999 })
  assert.equal(result.quoteNumber, 'QT-00002')
  const update = fixture.calls.find(c => c.sql.startsWith('UPDATE quotes SET client_id'))!
  assert.deepEqual(update.values.slice(13, 15), [212.4, 190.66])
  assert.ok(update.sql.includes('WHERE id=$1 AND company_id=$2'))
  assert.deepEqual(fixture.calls.find(c => c.sql.startsWith('UPDATE companies'))?.values, ['company', 3])
  assert.deepEqual(fixture.metadata.customer, { name: 'Customer', phone: '1234567890' })
  assert.equal(Object.values(fixture.metadata.lines as Record<string, any>)[0].tax, 18)
  const metadata = fixture.calls.find(c => c.sql.includes('ON CONFLICT(quote_id)'))!
  assert.ok(metadata.sql.includes('quote_custom_field_values.field_values || EXCLUDED.field_values'))
  for (const call of fixture.calls) {
    assert.doesNotMatch(call.sql, /(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:bills|entries|items|payments|company_clients|coupon_usages|accountant_v2_journals)\b/i)
    assert.doesNotMatch(call.sql, /\b(?:CREATE|ALTER|DROP|TRUNCATE)\b/)
  }
  // Identical retries replay the saved result; changed details never reuse a receipt.
  const inserts = fixture.calls.filter(c => c.sql.includes('INSERT INTO quotes')).length
  assert.deepEqual(await writeQuote(fixture.db, { companyId: 'company', userId: 'user' }, input()), result)
  assert.equal(fixture.calls.filter(c => c.sql.includes('INSERT INTO quotes')).length, inserts)
  await assert.rejects(writeQuote(fixture.db, { companyId: 'company', userId: 'user' }, { ...input(), subject: 'Changed' }), { statusCode: 409 })
})
test('foreign customers/products and stale or foreign quotes fail before source changes', async () => {
  for (const options of [{ foreignCustomer: true }, { foreignVariant: true }]) {
    const fixture = database(options)
    await assert.rejects(writeQuote(fixture.db, { companyId: 'company', userId: 'user' }, input()), { statusCode: 400 })
    assert.ok(!fixture.calls.some(c => c.sql.startsWith('UPDATE quotes') || c.sql.includes('INSERT INTO quotes')))
  }
  for (const [options, code] of [[{ existing: false }, 404], [{ revision: 'newer' }, 409]] as const) {
    const fixture = database(options)
    await assert.rejects(writeQuote(fixture.db, { companyId: 'company', userId: 'user' }, input(), 'quote'), { statusCode: code })
    assert.ok(!fixture.calls.some(c => c.sql.startsWith('UPDATE quotes')))
  }
})
test('detail reads scope the document and its items, and restore line pricing metadata', async () => {
  const calls: any[] = []
  const db = { async query(sql: string, values: any[]) {
    calls.push({ sql, values })
    return sql.includes('FROM quotes q') ? { rows: [{ id: 'quote', metadata: { revision: 'r', paymentTerms: 'Advance', lines: { line: { discount: 5, tax: 18, barcode: 'ABC', size: 'M' } } } }] }
      : { rows: [{ id: 'line', name: 'Shirt', quantity: 1, rate: 118 }] }
  } }
  const result = await readQuote(db, 'company', 'quote')
  assert.equal(result.items[0].discount, 5); assert.equal(result.items[0].tax, 18); assert.equal(result.items[0].barcode, 'ABC')
  assert.equal(result.revision, 'r')
  for (const call of calls) { assert.match(call.sql, /q\.company_id=\$2/); assert.deepEqual(call.values, ['quote', 'company']) }
  await assert.rejects(readQuote({ query: async () => ({ rows: [] }) }, 'company', 'foreign'), { statusCode: 404 })
})

test('accepted quote edits obey company preferences in the source writer', async () => {
  const locked = database({ accepted: true })
  await assert.rejects(writeQuote(locked.db, { companyId: 'company', userId: 'user' }, input(), 'quote'), { statusCode: 409 })
  const unlocked = database({ accepted: true, preferences: { allowAcceptedEdits: true } })
  await writeQuote(unlocked.db, { companyId: 'company', userId: 'user' }, input(), 'quote')
  assert.ok(unlocked.calls.some(call => call.sql.startsWith('UPDATE quotes SET client_id')))
})

test('create/update handlers roll back failures and delete scopes its soft deletion', async () => {
  const { Readable } = await import('node:stream')
  const { createEvent } = await import('h3')
  const { pool } = await import('../server/db')
  const create = (await import('../server/api/quotes/index.post')).default as any
  const update = (await import('../server/api/quotes/[quoteId].put')).default as any
  const remove = (await import('../server/api/quotes/[quoteId].delete')).default as any
  const originalAuth = (globalThis as any).requireAuthSession
  const originalConnect = pool.connect; const originalQuery = pool.query
  let role = 'biller'; let connections = 0
  const event = (method: string, company = 'company') => {
    const json = JSON.stringify(input()); const req = Readable.from([Buffer.from(json)]) as any
    req.url = '/api/quotes/quote'; req.method = method; req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(json)), 'x-company-id': company }
    const event = createEvent(req, {} as any); event.context.params = { quoteId: 'quote' }; event.context.authorizedCompanyIds = Promise.resolve(['company']); return event
  }
  ;(globalThis as any).requireAuthSession = async () => ({ data: { id: 'user', companyId: 'company', role } })
  try {
    for (const handler of [create, update]) {
      const fixture = database({ failItems: true })
      pool.connect = (async () => { connections++; return fixture.db }) as any
      await assert.rejects(handler(event(handler === create ? 'POST' : 'PUT')), /Line write failed/)
      assert.equal(fixture.calls.at(-1)?.sql, 'ROLLBACK')
      assert.ok(!fixture.calls.some(c => c.sql === 'COMMIT'))
    }
    connections = 0; role = 'investor'
    await assert.rejects(create(event('POST')), { statusCode: 403 }); assert.equal(connections, 0)
    role = 'biller'
    await assert.rejects(create(event('POST', 'foreign')), { statusCode: 403 }); assert.equal(connections, 0)
    let deletion: any
    pool.query = (async (sql: string, values: any[]) => { deletion = { sql, values }; return { rowCount: 1 } }) as any
    await remove(event('DELETE')); assert.match(deletion.sql, /SET deleted=true WHERE id=\$1 AND company_id=\$2/)
    assert.deepEqual(deletion.values, ['quote', 'company'])
  } finally { (globalThis as any).requireAuthSession = originalAuth; pool.connect = originalConnect; pool.query = originalQuery }
})

test('quote write SQL plans against the configured schema without executing writes', { skip: process.env.QUOTE_READONLY_DATABASE !== '1' }, async () => {
  const dotenv = await import('dotenv'); dotenv.config({ quiet: true } as any)
  const { Client } = await import('pg')
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 })
  try {
    await db.connect(); await db.query('BEGIN READ ONLY')
    const fixture = database()
    await writeQuote(fixture.db, { companyId: 'company', userId: 'user' }, input())
    for (const { sql, values } of fixture.calls) {
      // EXPLAIN without ANALYZE parses/plans DML without running it, even in READ ONLY.
      if (/^(?:INSERT|UPDATE|DELETE)\b/.test(sql)) await db.query('EXPLAIN ' + sql, values)
    }
    const reads = { async query(sql: string, values: any[]) {
      await db.query('EXPLAIN ' + sql, values)
      return { rows: sql.includes('FROM quotes q') ? [{ id: 'quote' }] : [] }
    } }
    await readQuote(reads, 'company', 'quote')
    await db.query('ROLLBACK')
  } finally { await db.end() }
})
