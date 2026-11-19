import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Readable } from 'node:stream'
import { createEvent } from 'h3'
import { ref } from 'vue'
import { customPaymentTerm, invoicePaymentTerms, newPaymentTerm, paymentTermDueDate, savedPaymentTerms } from '../utils/invoice-payment-terms'
import { addInvoicePaymentTerm, readInvoicePaymentTerms } from '../server/utils/invoice-payment-terms'
import { harness, plain } from './billing/harness'
import { pool } from '../server/db'

const byName = (name: string) => invoicePaymentTerms.find(term => term.name === name)!

test('invoice term dates handle receipt, net days, leap years, month ends and invalid partial dates', () => {
  for (const [name, date, expected] of [
    ['Due on Receipt', '2026-10-29', '2026-10-29'], ['Net 15', '2026-12-25', '2027-01-09'],
    ['Net 30', '2028-01-31', '2028-03-01'], ['Net 45', '2026-10-29', '2026-12-13'], ['Net 60', '2026-10-29', '2026-12-28'],
    ['Due end of the month', '2028-02-10', '2028-02-29'], ['Due end of the month', '2026-01-31', '2026-01-31'],
    ['Due end of next month', '2026-01-31', '2026-02-28'], ['Due end of next month', '2026-12-15', '2027-01-31'],
  ]) assert.equal(paymentTermDueDate(byName(name), date), expected)
  assert.equal(paymentTermDueDate(customPaymentTerm, '2026-10-29'), null)
  for (const date of ['', '2026-02-30', '2026-1-1', 'not-a-date']) assert.equal(paymentTermDueDate(byName('Net 30'), date), null)
})

test('new terms require a name and bounded whole days; persisted rules reject collisions and corruption', () => {
  assert.deepEqual(newPaymentTerm({ name: '  Wholesale 21  ', days: 21 }), { name: 'Wholesale 21', days: 21 })
  for (const value of [{ name: '', days: 1 }, { name: 'x'.repeat(101), days: 1 }, { name: 'Test', days: '' }, { name: 'Test', days: -1 }, { name: 'Test', days: 1.5 }, { name: 'Test', days: 3651 }]) assert.throws(() => newPaymentTerm(value))
  assert.deepEqual(savedPaymentTerms(null), [])
  for (const value of [{ version: 2, terms: [] }, { version: 1, terms: [{ id: 'term', name: 'net 30', days: 30 }] }, { version: 1, terms: [{ id: 'on-receipt', name: 'Other', days: 1 }] }]) assert.throws(() => savedPaymentTerms(value))
})

function component(overrides: Record<string, any> = {}) {
  const calls: any[] = []
  const state = {
    props: { invoiceDate: '2026-10-29', disabled: false }, terms: ref('Due on receipt'), dueDate: ref('2026-10-29'),
    customTerms: ref([]), menuOpen: ref(true), createOpen: ref(false), loading: ref(false), saving: ref(false), canCreate: ref(true),
    search: ref(''), termName: ref(''), dueAfter: ref<number | string>(0), saveError: ref(''), lastInvoiceDate: ref('2026-10-29'), active: true,
    scope: { fetch: async (url: string, options: any) => { calls.push({ url, ...options }); throw Error('Simulated save failure') } },
    invoicePaymentTerms, customPaymentTerm, newPaymentTerm, paymentTermDueDate, ...overrides,
  }
  const h = harness('components/Billing/PaymentTerms.vue', ['options', 'selectedTerm', 'filteredOptions', 'selectTerm', 'syncInvoiceDate', 'openNewTerm', 'saveTerm'], state)
  return { ...h, calls }
}

test('the real payment term control selects, searches, preserves manual dates and handles incomplete date entry', t => {
  const h = component(); t.after(h.stop)
  assert.equal(h.context.selectedTerm.value.id, 'on-receipt')
  h.context.selectTerm('net-30'); assert.equal(h.context.terms.value, 'Net 30'); assert.equal(h.context.dueDate.value, '2026-11-28')
  h.context.search.value = 'NET 4'; assert.deepEqual(plain(h.context.filteredOptions.value.map((term: any) => term.name)), ['Net 45'])
  h.context.syncInvoiceDate(''); h.context.syncInvoiceDate('2026-10-30'); assert.equal(h.context.dueDate.value, '2026-11-29')
  h.context.dueDate.value = '2026-12-15'; h.context.syncInvoiceDate('2026-10-31'); assert.equal(h.context.dueDate.value, '2026-12-15')
  h.context.selectTerm('custom'); assert.equal(h.context.selectedTerm.value.id, 'custom'); assert.equal(h.context.dueDate.value, '2026-12-15')
  h.context.terms.value = 'Payment following inspection'; assert.equal(h.context.selectedTerm.value.id, 'custom')
})

test('new-term modal does not change the invoice before save, retains failures, and selects a successfully saved rule', async t => {
  const h = component(); t.after(h.stop)
  h.context.openNewTerm(); assert.equal(h.context.createOpen.value, true); assert.equal(h.context.terms.value, 'Due on receipt')
  h.context.termName.value = 'Wholesale'; h.context.dueAfter.value = ''
  await h.context.saveTerm(); assert.equal(h.calls.length, 0); assert.match(h.context.saveError.value, /whole number/)
  h.context.dueAfter.value = 21; await h.context.saveTerm()
  assert.equal(h.context.createOpen.value, true); assert.equal(h.context.termName.value, 'Wholesale'); assert.equal(h.context.saving.value, false)
  const term = { id: 'saved-term', name: 'Wholesale', days: 21, kind: 'days' }
  h.context.scope.fetch = async () => ({ term, terms: [term] })
  await h.context.saveTerm(); assert.equal(h.context.createOpen.value, false)
  assert.equal(h.context.terms.value, 'Wholesale'); assert.equal(h.context.dueDate.value, '2026-11-19')
})

function database() {
  const state: any = { value: null, backup: null }, calls: any[] = []
  let snapshot: any
  const db = { release() {}, async query(sql: string, values: any[] = []) {
    calls.push({ sql, values }); assert.doesNotMatch(sql, /\b(CREATE|ALTER|DROP)\b/)
    if (sql === 'BEGIN') snapshot = structuredClone(state)
    if (sql === 'ROLLBACK') Object.assign(state, snapshot)
    if (sql.startsWith('SELECT id FROM companies')) return { rows: [{ id: values[0] }] }
    if (sql.startsWith('SELECT preference_value')) return { rows: state.value ? [{ preference_value: structuredClone(state.value) }] : [] }
    if (sql.includes('INSERT INTO general_preferences') && sql.includes('payment-terms-backup')) state.backup = structuredClone(state.value)
    else if (sql.includes('INSERT INTO general_preferences')) state.value = JSON.parse(values[2])
    return { rows: [] }
  } }
  return { db, state, calls }
}

test('custom terms persist per company, retain the preceding JSON, and reject duplicate preset or saved names', async () => {
  const f = database()
  await addInvoicePaymentTerm(f.db, 'company', newPaymentTerm({ name: 'Wholesale', days: 21 }))
  const previous = structuredClone(f.state.value)
  await addInvoicePaymentTerm(f.db, 'company', newPaymentTerm({ name: 'Project', days: 90 }))
  assert.deepEqual(f.state.backup, previous)
  assert.equal((await readInvoicePaymentTerms(f.db, 'company'))[0].name, 'Wholesale')
  const writes = f.calls.filter(call => call.sql.includes('INSERT')).length
  for (const name of ['NET 30', 'wholesale', 'Custom']) await assert.rejects(addInvoicePaymentTerm(f.db, 'company', newPaymentTerm({ name, days: 1 })), { statusCode: 409 })
  assert.equal(f.calls.filter(call => call.sql.includes('INSERT')).length, writes)
  assert.ok(f.calls.every(call => call.values.includes('company')))
})

test('term creation API enforces company and role access and saves only after locking the authorized company', async () => {
  const originalAuth = (globalThis as any).requireAuthSession, originalConnect = pool.connect
  const handler = (await import('../server/api/settings/payment-terms.post')).default as any
  const f = database(); let role = 'viewer', connections = 0
  const event = (company = 'company', body: any = { name: 'Wholesale', days: 21, companyId: 'foreign' }) => {
    const json = JSON.stringify(body), request: any = Readable.from([Buffer.from(json)])
    request.url = '/api/settings/payment-terms'; request.method = 'POST'
    request.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(json)), 'x-company-id': company }
    const value = createEvent(request, {} as any); value.context.authorizedCompanyIds = Promise.resolve(['company']); return value
  }
  try {
    ;(globalThis as any).requireAuthSession = async () => ({ data: { id: 'staff', companyId: 'company', role } })
    pool.connect = (async () => { connections++; return f.db }) as any
    await assert.rejects(handler(event()), { statusCode: 403 }); assert.equal(connections, 0)
    role = 'biller'; await assert.rejects(handler(event('foreign')), { statusCode: 403 }); assert.equal(connections, 0)
    await assert.rejects(handler(event('company', { name: 'Invalid', days: -1 })), { statusCode: 400 }); assert.equal(connections, 0)
    const result = await handler(event()); assert.equal(result.term.name, 'Wholesale')
    assert.equal(f.calls[0].sql, 'BEGIN'); assert.match(f.calls[1].sql, /companies.*FOR UPDATE/)
    assert.equal(f.calls.at(-1).sql, 'COMMIT'); assert.ok(f.calls.filter(call => call.values.length).every(call => call.values.includes('company')))
    await assert.rejects(handler(event()), { statusCode: 409 }); assert.equal(f.calls.at(-1).sql, 'ROLLBACK')
  } finally { (globalThis as any).requireAuthSession = originalAuth; pool.connect = originalConnect }
})
