import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Readable } from 'node:stream'
import { createEvent } from 'h3'
import { nextTick } from 'vue'
import { emptyBillingPreferences, normalizeBillingPreferences, newBillingDocumentValues } from '../utils/billing-preferences'
import { saveBillingPreferences, readBillingPreferences } from '../server/utils/billing-preferences'
import { pool } from '../server/db'
import { composable, plain } from './billing/harness'
import { scopeOrganizationModelReads } from '../server/utils/organizationModelScope'

test('invoice and sales preferences validate text, row counts, booleans and payment terms', () => {
  for (const kind of ['invoice','sale'] as const) {
    const defaults = emptyBillingPreferences(kind)
    assert.deepEqual(normalizeBillingPreferences(defaults, kind), defaults)
    for (const patch of [{ pageSize: 500 }, { showSummary: 'true' }, { customerNotes: 1 }, { customerNotes: 'x'.repeat(5001) }, { termsAndConditions: 'x'.repeat(10001) }, { paymentTermId: '../invalid' }, { version: 2 }]) assert.throws(() => normalizeBillingPreferences({ ...defaults, ...patch }, kind))
  }
  const defaults = { invoice: { ...emptyBillingPreferences(), paymentTermId: 'net-30', customerNotes: 'Invoice note' }, sale: { ...emptyBillingPreferences('sale'), customerNotes: 'Sale note' } }
  assert.deepEqual(newBillingDocumentValues('invoice', '2026-10-30', defaults), { notes: 'Invoice note', termsAndConditions: '', invoicePaymentTerms: 'Net 30', dueDate: '2026-11-29' })
  assert.equal(newBillingDocumentValues('paynow', '2026-10-30', defaults).notes, 'Sale note')
})

test('new/reset drafts adopt document defaults; reopening drafts and manual notes preserves their values', async t => {
  const defaults = { invoice: { ...emptyBillingPreferences(), paymentTermId: 'net-30', customerNotes: 'Invoice note', termsAndConditions: 'Invoice terms' }, sale: { ...emptyBillingPreferences('sale'), customerNotes: 'Sale note' } }
  const h = composable('composables/useBillingDraft.ts', 'useBillingDraft', [defaults]); t.after(h.stop); await h.mount()
  const d = h.result
  assert.equal(d.customerNotes.value, 'Sale note')
  d.applyBillingModeDefaults('invoice'); d.billingMode.value = 'invoice'
  assert.equal(d.customerNotes.value, 'Invoice note'); assert.equal(d.invoicePaymentTerms.value, 'Net 30')
  d.customerNotes.value = 'Entered by user'; await nextTick()
  d.applyBillingModeDefaults('paynow'); d.billingMode.value = 'paynow'; assert.equal(d.customerNotes.value, 'Entered by user')
  d.createNewBill(); await nextTick(); assert.equal(d.customerNotes.value, 'Sale note')
  d.loadBill('1'); await nextTick(); assert.equal(d.customerNotes.value, 'Entered by user')
  d.billingMode.value = 'invoice'; d.resetDraft(); assert.equal(d.customerNotes.value, 'Invoice note'); assert.equal(d.termsAndConditions.value, 'Invoice terms')
  assert.equal(d.invoicePaymentTerms.value, 'Net 30')
})

function database() {
  const records = new Map<string, any>(), backups = new Map<string, any>(), calls: any[] = []
  const db: any = { release() {}, query: async (sql: string, values: any[] = []) => {
    calls.push({ sql, values })
    assert.doesNotMatch(sql, /\b(?:ALTER|CREATE|DROP|TRUNCATE)\b/)
    if (sql.startsWith('SELECT id FROM companies')) return { rows: [{ id: values[0] }] }
    if (sql.includes("preference_key='payment-terms'")) return { rows: [] }
    const key = `${values[0]}:${values[1]}`
    if (sql.startsWith('SELECT preference_value')) return { rows: records.has(key) ? [{ preference_value: records.get(key) }] : [] }
    if (sql.includes('INSERT INTO general_preferences') && sql.includes("'defaults-backup'")) {
      const key = `${values[0]}:${values[2]}`; if (records.has(key)) backups.set(key, structuredClone(records.get(key)))
    } else if (sql.includes('INSERT INTO general_preferences')) records.set(`${values[1]}:${values[2]}`, JSON.parse(values[3]))
    return { rows: [], rowCount: 1 }
  } }
  return { db, records, backups, calls }
}

test('preference storage separates companies/documents and backs up the preceding settings', async () => {
  const f = database(), initial = emptyBillingPreferences()
  await saveBillingPreferences(f.db, 'company', 'invoice', initial)
  await saveBillingPreferences(f.db, 'company', 'invoice', { ...initial, customerNotes: 'Changed' })
  await saveBillingPreferences(f.db, 'company', 'sale', { ...emptyBillingPreferences('sale'), customerNotes: 'Sale only' })
  assert.deepEqual(f.backups.get('company:invoices'), initial)
  assert.equal((await readBillingPreferences(f.db, 'company', 'sale')).preferences.customerNotes, 'Sale only')
  assert.equal((await readBillingPreferences(f.db, 'branch', 'invoice')).configured, false)
})

test('preference save requires management role, authorized company and its payment term; writes lock and back up atomically', async () => {
  const originalAuth = (globalThis as any).requireAuthSession, originalConnect = pool.connect
  const handler = (await import('../server/api/settings/billing-preferences.put')).default as any
  const f = database(); let role = 'viewer', connects = 0
  function event(company = 'company', document = 'invoice', patch: any = {}) {
    const json = JSON.stringify({ ...emptyBillingPreferences(), ...patch, companyId: 'foreign' }), request: any = Readable.from([Buffer.from(json)])
    request.url = `/api/settings/billing-preferences?document=${document}`; request.method = 'PUT'
    request.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(json)), 'x-company-id': company }
    const event = createEvent(request, {} as any); event.context.authorizedCompanyIds = Promise.resolve(['company']); return event
  }
  try {
    ;(globalThis as any).requireAuthSession = async () => ({ data: { id: 'staff', companyId: 'company', role } })
    pool.connect = (async () => { connects++; return f.db }) as any
    await assert.rejects(handler(event()), { statusCode: 403 }); assert.equal(connects, 0)
    role = 'admin'; await assert.rejects(handler(event('foreign')), { statusCode: 403 }); assert.equal(connects, 0)
    await assert.rejects(handler(event('company', 'unknown')), { statusCode: 400 }); assert.equal(connects, 0)
    await assert.rejects(handler(event('company', 'invoice', { pageSize: 999 })), { statusCode: 400 }); assert.equal(connects, 0)
    await assert.rejects(handler(event('company', 'invoice', { paymentTermId: 'other-company-term' })), { statusCode: 400 }); assert.equal(f.calls.at(-1).sql, 'ROLLBACK')
    const result = await handler(event('company', 'invoice', { paymentTermId: 'net-30' }))
    assert.equal(result.preferences.paymentTermId, 'net-30'); assert.equal(f.calls.at(-1).sql, 'COMMIT')
    assert.ok(f.calls.some(call => /companies.*FOR UPDATE/.test(call.sql)))
    assert.equal(f.records.has('foreign:invoices'), false)
    await handler(event('company', 'sale', { customerNotes: 'Sale terms' }))
    assert.equal((await readBillingPreferences(f.db, 'company', 'sale')).preferences.customerNotes, 'Sale terms')
  } finally { (globalThis as any).requireAuthSession = originalAuth; pool.connect = originalConnect }
})

test('generated preference CRUD cannot bypass management permissions for invoices or sales', async () => {
  for (const pageName of ['invoices','sales']) {
    const delegate: any = Object.fromEntries(['create','update','updateMany','deleteMany','createManyAndReturn'].map(key => [key, async () => { throw Error('Bypass') }]))
    const db: any = { generalPreference: { ...delegate, findMany: async () => [{ pageName }] }, $transaction: async (fn: any) => fn(db) }
    const api = scopeOrganizationModelReads(db, 'company', ['company'])
    for (const operation of ['create','update','updateMany','deleteMany','createManyAndReturn']) await assert.rejects(api.generalPreference[operation]({ data: { pageName } }), /quote APIs/)
  }
})
