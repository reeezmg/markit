import assert from 'node:assert/strict'
import { test } from 'node:test'
import { jobChargeLines, normalizeServiceLines, serviceChargeLine, serviceInvoiceItems, serviceJobTotal } from '../utils/service-items'
import { invoiceServiceJob } from '../server/utils/after-sales'
import { saveServiceCharge, validateServiceParts, saveProductServiceFlag } from '../server/utils/after-sales-catalog'
import { validateInvoiceSource } from '../server/utils/invoice-flow'
import { quoteInvoiceEntries } from '../server/utils/quote-workflow'
import { ensureServiceChargeCategory, readServiceChargeCategory, applyServiceChargeCategory } from '../server/utils/after-sales-charge-category'

const labour = () => serviceChargeLine({ name: 'Labour', rate: 100, tax: 18, unit: 'Hour' }, 'labour')
const part = (id = 'part', variantId = 'variant') => ({ ...serviceChargeLine({ name: 'Filter', rate: 50 }, id), variantId, barcode: id, size: '' })
const result = (rows: any[] = []) => ({ rows, rowCount: rows.length })

test('service charge category creates once, reuses case/space matches, follows renames and restores inactive categories', async () => {
  const calls: any[] = [], categories: any[] = [], preferences: Record<string, any> = {}
  const db = { async query(sql: string, args: any[] = []) {
    calls.push({ sql, args })
    if (sql.startsWith('SELECT c.id')) return result(categories.filter(c => c.company === args[0] &&
      (c.id === preferences[args[0]]?.categoryId || c.name.trim().toLowerCase() === 'service charges')).slice(0, 1).map(c => ({ id: c.id, name: c.name, status: c.status })))
    if (sql.startsWith('INSERT INTO categories')) categories.push({ id: args[0], company: args[1], name: args[2], status: true })
    if (sql.startsWith('INSERT INTO general_preferences')) preferences[args[1]] = JSON.parse(args[2])
    if (sql.startsWith('UPDATE categories')) categories.find(c => c.id === args[0] && c.company === args[1]).status = true
    return result()
  } }
  assert.equal(await readServiceChargeCategory(db, 'company'), null)
  assert.equal(calls.filter(c => c.sql.startsWith('INSERT')).length, 0, 'Catalogue lookup never creates records')
  const created = await ensureServiceChargeCategory(db, 'company', 'staff')
  assert.equal(created.name, 'Service Charges')
  assert.match(calls.find(c => c.sql.includes('pg_advisory_xact_lock')).args[0], /after-sales:company/)
  assert.equal((await ensureServiceChargeCategory(db, 'company', 'staff')).id, created.id)
  categories[0].name = 'Workshop fees'; categories[0].status = false
  assert.equal((await ensureServiceChargeCategory(db, 'company', 'staff')).id, created.id)
  assert.equal(categories[0].status, true)
  categories.push({ id: 'existing', company: 'branch', name: '  SERVICE CHARGES  ', status: true })
  preferences.branch = { categoryId: created.id }
  assert.equal((await ensureServiceChargeCategory(db, 'branch', 'staff')).id, 'existing')
  assert.equal(calls.filter(c => c.sql.startsWith('INSERT INTO categories')).length, 1)
  assert.equal(calls.filter(c => c.sql.startsWith('UPDATE categories')).length, 1)
  assert.ok(calls.filter(c => c.sql.startsWith('UPDATE categories')).every(c => !/tax/.test(c.sql)))
})

test('category assignment validates company ownership and preserves charge tax/rates and part categories', async () => {
  const entries: any[] = [{ name: 'Labour', tax: 18, rate: 118 }, { variant: { connect: { id: 'variant' } }, category: { connect: { id: 'parts' } }, tax: 5 }]
  const db = { async query(sql: string, args: any[]) { assert.match(sql, /company_id=\$2/); return result(args[1] === 'company' ? [{ id: args[0] }] : []) } }
  await assert.rejects(applyServiceChargeCategory(db, 'foreign', entries, 'service-category'), { statusCode: 400 })
  await applyServiceChargeCategory(db, 'company', entries, 'service-category')
  assert.deepEqual(entries[0], { name: 'Labour', tax: 18, rate: 118, category: { connect: { id: 'service-category' } } })
  assert.equal(entries[1].category.connect.id, 'parts')
})

test('named charges, regular products and service products retain separate prices, taxes and stock links', () => {
  const job = { details: { charges: [labour(), serviceChargeLine({ name: 'Travel', rate: 20, tax: 5 }, 'travel')], parts: [part('regular'), part('repair', 'service-variant')] } }
  assert.equal(serviceJobTotal(job), 239)
  const items = serviceInvoiceItems(job)
  const entries = quoteInvoiceEntries({ items, discount: 0, discountType: 'amount', adjustment: 0 })
  assert.equal(entries[0].name, 'Labour'); assert.equal(entries[0].tax, 18); assert.equal(entries[0].value, 118)
  assert.ok(!entries[0].variant); assert.equal(entries[2].variant.connect.id, 'variant'); assert.equal(entries[3].variant.connect.id, 'service-variant')
  assert.equal(entries.reduce((sum, line) => sum + line.value, 0), 239)
})

test('free jobs produce descriptive zero lines and legacy single charges remain readable', () => {
  const free = { snapshot: { name: 'Included maintenance' }, details: { charges: [], parts: [] }, charge: 500 }
  assert.equal(serviceInvoiceItems(free)[0].name, 'Included maintenance'); assert.equal(serviceInvoiceItems(free)[0].rate, 0)
  const legacy = { snapshot: { name: 'Inspection' }, charge: 100, tax: 18, details: {} }
  assert.equal(jobChargeLines(legacy)[0].rate, 118)
  assert.equal(serviceJobTotal(legacy), 118)
  const freePart = { ...part(), rate: 0 }
  assert.equal(serviceInvoiceItems({ details: { charges: [], parts: [freePart] } })[0].variantId, 'variant')
})

test('charge/product line validation rejects disguised stock, invalid amounts and duplicate IDs', () => {
  assert.throws(() => normalizeServiceLines([part()], false), /non-stock/)
  assert.throws(() => normalizeServiceLines([labour()], true), /catalog/)
  assert.throws(() => normalizeServiceLines([{ ...labour(), rate: -1 }], false), /rate/)
  assert.throws(() => serviceInvoiceItems({ details: { charges: [labour()], parts: [part('labour')] } }), /unique/)
  assert.throws(() => normalizeServiceLines([{ ...labour(), quantity: Infinity }], false), /quantity/)
})

test('service part saves reject foreign or ambiguous stock before invoicing', async () => {
  const db = { async query(sql: string, args: any[]) { assert.match(sql, /i.company_id=\$1/); assert.equal(args[0], 'company'); return result() } }
  await assert.rejects(validateServiceParts(db, 'company', [part()]), /belonging to this company/)
})

test('charge catalogue updates are company-scoped, audited, and cannot mutate foreign rows', async () => {
  const calls: any[] = []
  const db = { async query(sql: string, args: any[] = []) {
    calls.push({ sql, args })
    if (sql.includes('to_regclass')) return result([{ ready: true }])
    if (sql.startsWith('SELECT *')) { assert.deepEqual(args, ['foreign', 'company']); return result() }
    return result()
  } }
  await saveServiceCharge(db, 'company', 'staff', { name: 'Labour', rate: 0, tax: 18 })
  assert.ok(calls.some(c => c.sql.startsWith('INSERT INTO service_audit')))
  const writes = calls.filter(c => c.sql.startsWith('INSERT')).length
  await assert.rejects(saveServiceCharge(db, 'company', 'staff', { id: 'foreign', name: 'Bad' }), /not found/)
  assert.equal(calls.filter(c => c.sql.startsWith('INSERT')).length, writes)
  await assert.rejects(saveServiceCharge(db, 'company', 'staff', { name: 'Bad', tax: 101 }), /Tax/)
})

test('service-product flag is optional for old callers and refuses true before migration', async () => {
  let writes = 0
  const db = { async query(sql: string) { if (sql.startsWith('UPDATE')) writes++; return result([{ ready: false }]) } }
  await saveProductServiceFlag(db, 'company', 'product', undefined)
  await saveProductServiceFlag(db, 'company', 'product', false)
  await assert.rejects(saveProductServiceFlag(db, 'company', 'product', true), { statusCode: 503 })
  assert.equal(writes, 0)
})

/** Actual invoice services and source writer, without a DB connection or DDL. */
function invoiceFixture(job: any) {
  const calls: any[] = [], entries: any[] = [], stock: any = {}
  const db = { async query(sql: string, args: any[] = []): Promise<any> {
    calls.push({ sql, args })
    if (sql.includes('FROM service_jobs j')) return result([{ ...job }])
    if (sql.includes('FROM clients c JOIN company_clients') || sql.includes('SELECT 1 FROM clients')) return result([{ id: 'customer' }])
    if (sql.includes('FROM accountant_v2_erp_settings')) return result([{ company_id: 'company' }])
    if (sql.includes('FROM items i') && sql.includes('FOR UPDATE OF i')) return result([{ id: args[2], category_id: null }])
    if (sql.includes('RETURNING invoice_number')) return result([{ invoice_number: 12, created_at: '2026-10-30' }])
    if (sql.includes('INSERT INTO entries')) { entries.push(...JSON.parse(args[0])); return result() }
    if (sql.startsWith('SELECT item_id, qty, return')) return result(entries.map(e => ({ item_id: e.item?.connect.id, qty: e.qty, return: false })))
    if (sql.startsWith('SELECT id FROM items')) return result(args[0].map((id: string) => ({ id })))
    if (sql.includes('UPDATE items i')) { args[0].forEach((id: string, i: number) => stock[id] = (stock[id] || 0) + args[1][i]); return result() }
    if (sql.startsWith('UPDATE service_jobs SET bill_id')) { job.bill_id = args[2]; return result() }
    if (sql.includes('to_regclass')) return result([{ ready: false }])
    if (sql.startsWith('SELECT c.id')) return result([{ id: 'service-category', name: 'Service Charges', status: true }])
    if (sql.startsWith('SELECT id FROM categories')) return result([{ id: 'service-category' }])
    return result()
  } }
  return { db, calls, entries, stock }
}

test('completed zero service invoices issue once without payments, including free stock parts', async () => {
  const job = { id: 'job', client_id: 'customer', reference: 'MP-1', status: 'COMPLETED', snapshot: { name: 'Free maintenance' }, details: { charges: [], parts: [{ ...part(), rate: 0 }] } }
  const f = invoiceFixture(job)
  const invoice = await invoiceServiceJob(f.db, 'company', 'staff', { id: 'job' })
  assert.equal(invoice.invoiceNumber, 12); assert.equal(f.entries[0].value, 0); assert.equal(f.stock.part, 1)
  assert.equal(JSON.parse(f.calls.find(c => c.sql.includes('INSERT INTO bills')).args[0]).grandTotal, 0)
  assert.ok(!f.calls.some(c => c.sql.includes('INSERT INTO payments')))
  assert.deepEqual(await invoiceServiceJob(f.db, 'company', 'staff', { id: 'job' }), { billId: invoice.billId })
  assert.equal(f.calls.filter(c => c.sql.includes('INSERT INTO bills')).length, 1); assert.equal(f.stock.part, 1)
})

test('charge-only free completion issues an invoice; open services and ordinary zero invoices reject', async () => {
  const job: any = { id: 'job', client_id: 'customer', reference: 'MP-1', status: 'OPEN', snapshot: { name: 'Included visit' }, details: { charges: [], parts: [] } }
  const f = invoiceFixture(job)
  await assert.rejects(invoiceServiceJob(f.db, 'company', 'staff', { id: 'job' }), /Complete the service/)
  job.status = 'COMPLETED'
  await invoiceServiceJob(f.db, 'company', 'staff', { id: 'job' })
  assert.equal(f.entries.length, 1); assert.equal(f.entries[0].name, 'Included visit'); assert.equal(f.entries[0].value, 0)
  assert.equal(f.entries[0].category.connect.id, 'service-category')
  await assert.rejects(validateInvoiceSource(f.db, 'company', { grandTotal: 0, createdAt: '2026-10-30', dueDate: '2026-10-30', client: { connect: { id: 'customer' } }, paymentMethod: 'Credit' }), { statusCode: 400 })
})
