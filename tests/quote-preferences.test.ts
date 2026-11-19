import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Readable } from 'node:stream'
import { createEvent } from 'h3'
import { emptyQuotePreferences, normalizeQuotePreferences, visibleQuoteItems } from '../utils/quote-preferences'
import { defaultQuoteDesign, newQuoteDesignSection, normalizeQuoteDesign } from '../utils/quote-design'
import { normalizeQuote, newQuoteLine, quoteTotals } from '../utils/erp-quote'
import { readQuotePreferences, saveQuotePreferences } from '../server/utils/quote-preferences'
import { convertAcceptedQuote, quoteInvoiceEntries } from '../server/utils/quote-workflow'
import { createQuoteShare, verifyQuoteShare, sharedQuote } from '../server/utils/quote-share'
import { deliverQuoteInvoiceEmail, sendQuoteInvoiceEmail } from '../server/utils/quote-invoice-email'
import nodemailer from 'nodemailer'
import { scopeOrganizationModelReads } from '../server/utils/organizationModelScope'
import { pool } from '../server/db'

function quote() {
  const value = normalizeQuote({ clientId: 'customer', quoteDate: '2026-10-28', expiryDate: '2099-11-10', referenceNumber: 'PO-1',
    subject: 'Chairs', salesperson: 'Alex', status: 'ACCEPTED', notes: '', termsAndConditions: '', paymentTerms: 'Net 30',
    deliveryEstimate: '', discount: 10, discountType: 'percent', adjustment: -0.5,
    items: [{ ...newQuoteLine('line'), name: 'Chair', rate: 118, quantity: 2, discount: 10, tax: 18 }] })
  return { ...value, ...quoteTotals(value), id: 'quote', quoteNumber: 'QT-1', clientName: 'Customer', clientPhone: '1234567890' }
}
function workflowDb(preferences: any = {}) {
  const initial = quote()
  const state: any = { quote: initial, preferences: { ...emptyQuotePreferences(), ...preferences },
    metadata: { revision: 'revision', customer: { name: 'Customer', phone: '1234567890' }, createdByUserId: 'staff', workflow: {}, lines: { line: { tax: 18, discount: 10 } } },
    bills: [], entries: [], audit: {}, stockWrites: 0, failInvoice: false }
  const calls: any[] = []; let savepoint: any
  const result = (rows: any[] = [], rowCount = rows.length) => ({ rows, rowCount })
  const db = { release() {}, async query(sql: string, values: any[] = []): Promise<any> {
    calls.push({ sql, values })
    if (sql.startsWith('SAVEPOINT')) { savepoint = structuredClone(state); return result() }
    if (sql.startsWith('ROLLBACK TO')) { Object.assign(state, savepoint); return result() }
    if (sql.includes('SELECT preference_value')) return result([{ preference_value: state.preferences }])
    if (sql.includes('INSERT INTO general_preferences') && sql.includes("'defaults',$3")) { state.preferences = JSON.parse(values[2]); return result([], 1) }
    if (sql.includes('FROM quotes q')) return result([{ ...state.quote, metadata: structuredClone(state.metadata) }])
    if (sql.includes('FROM quote_items i')) return result(state.quote.items.map((line: any) => ({ ...line, amount: line.quantity * line.rate * (1 - line.discount / 100) })))
    if (sql.includes('INSERT INTO quote_custom_field_values')) { state.metadata.workflow = JSON.parse(values[3]); return result([], 1) }
    if (sql.includes("'{_erpQuote,revision}'")) { state.metadata.revision = values[2]; return result([], 1) }
    if (sql.startsWith('UPDATE quotes SET status')) { state.quote.status = values[2]; return result([], 1) }
    if (sql.includes('SELECT "after" FROM accountant_v2_accountant_audit')) return result(state.audit[values[0]] ? [{ after: state.audit[values[0]] }] : [])
    if (sql.includes('INSERT INTO accountant_v2_accountant_audit')) { state.audit[values[0]] = JSON.parse(values[5]); return result([], 1) }
    if (sql.includes('FROM accountant_v2_erp_settings')) return result([{ company_id: 'company' }])
    if (sql.includes('SELECT c.id FROM clients')) return result([{ id: 'customer' }])
    if (sql.includes('SELECT 1 FROM clients')) return result([{ exists: true }])
    if (sql.includes('SELECT c.email')) return result([{ email: 'customer@example.invalid' }])
    if (sql.includes('SELECT user_id FROM company_users')) return result([{ user_id: 'staff' }])
    if (sql.includes('INSERT INTO bills')) {
      if (state.failInvoice) throw Error('Invoice posting failed')
      const payload = JSON.parse(values[0]), bill = { id: values[1], ...payload, grand_total: payload.grandTotal, currency: 'INR', client_id: 'customer', invoice_number: 101, created_at: new Date().toISOString() }
      state.bills.push(bill); return result([bill])
    }
    if (sql.includes('UPDATE bills SET invoice_code')) { Object.assign(state.bills[0], { invoice_code: 'INV-101', due_date: values[2], invoice_payment_terms: values[3] }); return result([], 1) }
    if (sql.includes('INSERT INTO entries')) { state.entries = JSON.parse(values[0]); return result([], state.entries.length) }
    if (sql.includes('SELECT item_id, qty, return FROM entries')) return result(state.entries.map((entry: any) => ({ qty: entry.qty, return: entry.return, item_id: entry.item?.connect.id || null })))
    if (sql.includes('FROM items i')) return result([{ id: 'stock', category_id: 'category' }])
    if (sql.includes('SELECT id FROM items WHERE id = ANY')) return result(values[0].map((id: string) => ({ id })))
    if (sql.includes('UPDATE items i')) { state.stockWrites++; return result([], 1) }
    if (sql.includes('FROM bills b WHERE b.id=')) return result(state.bills)
    if (sql.includes('SELECT name,qty,rate,discount,value,tax,return FROM entries')) return result(state.entries)
    if (sql.includes('AS received FROM payments')) return result([{ received: state.received || 0 }])
    if (sql.includes('SELECT name,currency FROM companies')) return result([{ name: 'Store', currency: 'INR' }])
    if (sql.includes('AS "companyName"')) return result([{ companyName: 'Store', currency: 'INR' }])
    return result()
  } }
  return { db, state, calls, pool: { connect: async () => db } }
}

test('preferences validate supported policies, template and text bounds, and preserve zero-total quotes', () => {
  assert.equal(normalizeQuotePreferences({}).conversion, 'none')
  for (const patch of [{ defaultTemplate: 'bad' }, { conversion: 'bad' }, { allowCustomerApproval: 'yes' }, { hideZeroValueItems: 1 }, { retainCustomerNotes: 'yes' }, { retainTermsAndConditions: 1 }, { invoiceDueDays: -1 }, { invoiceDueDays: 1.5 }, { customerNotes: 'x'.repeat(5001) }])
    assert.throws(() => normalizeQuotePreferences(patch))
  const document = { ...quote(), hideZeroValueItems: true, items: [{ ...newQuoteLine('zero'), name: 'Free sample', amount: 0 }, { ...newQuoteLine('paid'), name: 'Chair', amount: 10 }] }
  assert.deepEqual(visibleQuoteItems(document).map((line: any) => line.id), ['paid'])
  document.total = 0; assert.equal(visibleQuoteItems(document).length, 2)
})

test('one quote design validates images, columns and sections and upgrades legacy preferences', () => {
  const design = defaultQuoteDesign(), header = newQuoteDesignSection('image', 'header')
  header.image = 'data:image/png;base64,aGVsbG8='
  design.sections.unshift(header)
  assert.deepEqual(normalizeQuotePreferences({ documentDesign: design }).documentDesign, design)
  assert.deepEqual(normalizeQuotePreferences({ defaultTemplate: 'modern' }).documentDesign, defaultQuoteDesign())
  assert.equal(normalizeQuotePreferences({ defaultTemplate: 'modern' }).defaultTemplate, 'classic')
  const bad = (mutate: (copy: typeof design) => void) => { const copy = structuredClone(design); mutate(copy); assert.throws(() => normalizeQuoteDesign(copy)) }
  bad(copy => copy.sections[0].image = 'https://external.example/header.png')
  bad(copy => copy.sections[0].image = 'data:image/svg+xml;base64,aGVsbG8=')
  bad(copy => copy.sections[0].image = 'data:image/png;base64,' + 'A'.repeat(350000))
  bad(copy => copy.sections.find(s => s.kind === 'items')!.visible = false)
  bad(copy => copy.sections.push({ ...copy.sections[0] }))
  bad(copy => copy.columns.find(c => c.field === 'amount')!.visible = false)
  bad(copy => copy.accentColor = 'url(https://example.com)')
  bad(copy => copy.padding = 200)
})

test('company preferences use existing storage and retain a backup, without schema changes', async () => {
  const f = workflowDb()
  const value = normalizeQuotePreferences({ defaultTemplate: 'modern', termsAndConditions: 'Net 30', conversion: 'draft' })
  const banner = newQuoteDesignSection('image', 'banner')
  banner.image = 'data:image/png;base64,aGVsbG8='
  value.documentDesign.sections.unshift(banner)
  await saveQuotePreferences(f.db, 'company', value)
  assert.deepEqual(await readQuotePreferences(f.db, 'company'), value)
  assert.match(f.calls[0].sql, /defaults-backup/)
  for (const call of f.calls) { assert.doesNotMatch(call.sql, /\b(?:CREATE|ALTER|DROP)\b/); assert.ok(call.values.includes('company')) }
})

test('invoice entries allocate quote discounts and adjustments to the exact total', () => {
  for (const adjustment of [-0.5, 0, 10]) {
    const value = { ...quote(), adjustment }
    const entries = quoteInvoiceEntries(value)
    const sum = entries.reduce((total: number, entry: any) => total + (entry.return ? -1 : 1) * Math.round(entry.value * 100), 0)
    assert.equal(sum, Math.round(quoteTotals(value).total * 100))
    assert.equal(entries.at(-1).tax, adjustment ? 0 : 18)
    assert.equal(entries.reduce((total: number, entry: any) => total + entry.qty, 0), 2)
    assert.ok(entries.every((entry: any) => !entry.return))
  }
})

test('draft conversion creates no sale or stock effects; issue is linked once and retry never duplicates', async () => {
  const f = workflowDb({ conversion: 'draft' })
  f.state.quote.items[0].variantId = 'variant'
  const draft = await convertAcceptedQuote(f.db, 'company', 'quote', 'staff')
  assert.equal(draft.conversion, 'draft'); assert.equal(f.state.bills.length, 0); assert.equal(f.state.stockWrites, 0)
  const issued = await convertAcceptedQuote(f.db, 'company', 'quote', 'staff', true)
  assert.ok(issued.invoiceId); assert.equal(f.state.bills.length, 1); assert.equal(f.state.stockWrites, 1)
  assert.equal(f.state.bills[0].paymentStatus, 'PENDING'); assert.equal(f.state.bills[0].grand_total, 190.66)
  assert.equal((await convertAcceptedQuote(f.db, 'company', 'quote', 'staff', true)).invoiceId, issued.invoiceId)
  assert.equal(f.state.bills.length, 1)
})

test('quote retention choices control draft and issued invoice text without changing the quote', async () => {
  for (const retainCustomerNotes of [false, true]) for (const retainTermsAndConditions of [false, true]) {
    const f = workflowDb({ conversion: 'draft', retainCustomerNotes, retainTermsAndConditions })
    f.state.quote.notes = 'Call before delivery'; f.state.quote.termsAndConditions = 'Payment is due on receipt'
    const draft = await convertAcceptedQuote(f.db, 'company', 'quote', 'staff')
    const expected = { notes: retainCustomerNotes ? f.state.quote.notes : '', termsAndConditions: retainTermsAndConditions ? f.state.quote.termsAndConditions : '' }
    for (const key of ['notes', 'termsAndConditions'] as const) assert.equal(draft.invoiceDraft.quote[key], expected[key])
    const issued = await convertAcceptedQuote(f.db, 'company', 'quote', 'staff', true)
    for (const key of ['notes', 'termsAndConditions'] as const) {
      assert.equal(f.state.bills[0][key], expected[key]); assert.equal(issued.invoiceQuote[key], expected[key])
    }
    assert.equal(f.state.quote.notes, 'Call before delivery'); assert.equal(f.state.quote.termsAndConditions, 'Payment is due on receipt')
  }
})

test('failed invoice creation preserves accepted quote, rolls back conversion, and can be retried', async () => {
  const f = workflowDb({ conversion: 'email' }); f.state.failInvoice = true
  const failed = await convertAcceptedQuote(f.db, 'company', 'quote', 'staff')
  assert.match(failed.conversionError, /posting failed/); assert.equal(f.state.quote.status, 'ACCEPTED'); assert.equal(f.state.bills.length, 0)
  f.state.failInvoice = false
  const success = await convertAcceptedQuote(f.db, 'company', 'quote', 'staff')
  assert.equal(success.emailStatus, 'Pending'); assert.equal(f.state.bills.length, 1)
  let emails = 0
  f.state.received = 50
  const sent = await deliverQuoteInvoiceEmail(f.pool, 'company', 'quote', async message => { emails++; assert.equal(message.invoice.amount_received, 50); assert.ok(message.invoice.entries.length) })
  assert.equal(sent.emailStatus, 'Sent')
  await deliverQuoteInvoiceEmail(f.pool, 'company', 'quote', async () => { emails++ })
  assert.equal(emails, 1)
})

test('email failures retain the single invoice and expose a retriable failed state', async () => {
  const f = workflowDb({ conversion: 'email' }); await convertAcceptedQuote(f.db, 'company', 'quote', 'staff')
  const failed = await deliverQuoteInvoiceEmail(f.pool, 'company', 'quote', async () => { throw Error('SMTP unavailable') })
  assert.equal(failed.emailStatus, 'Failed'); assert.match(failed.emailError, /SMTP/); assert.equal(f.state.bills.length, 1)
})

test('invoice email builds an actual PDF attachment without contacting an email service', async () => {
  const original = nodemailer.createTransport, keys = ['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS']
  const previous = keys.map(key => process.env[key]); let message: any
  try {
    Object.assign(process.env, { SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '465', SMTP_USER: 'sender@example.invalid', SMTP_PASS: 'test-only' })
    nodemailer.createTransport = (() => ({ sendMail: async (value: any) => { message = value } })) as any
    await sendQuoteInvoiceEmail({ to: 'customer@example.invalid', company: { name: 'Store', currency: 'INR' }, quote: { ...quote(), notes: 'Unselected original quote notes', termsAndConditions: 'Unselected original terms' },
      invoice: { id: 'bill', invoice_code: 'INV-101', due_date: '2026-11-28', grand_total: 190.66, invoice_payment_terms: 'Net 30', notes: 'Retained invoice notes', termsAndConditions: 'Retained invoice terms' } })
    assert.equal(message.to, 'customer@example.invalid')
    assert.equal(message.attachments[0].filename, 'INV-101.pdf')
    assert.ok(message.attachments[0].content.subarray(0, 4).equals(Buffer.from('%PDF')))
    assert.match(message.text, /190\.66/)
    assert.match(message.text, /Retained invoice notes/)
    assert.doesNotMatch(message.text, /Unselected original/)
    assert.doesNotMatch(message.attachments[0].content.toString('latin1'), /Unselected original/)
  } finally {
    nodemailer.createTransport = original
    keys.forEach((key, index) => previous[index] === undefined ? delete process.env[key] : process.env[key] = previous[index])
  }
})

test('preference writes enforce company access and management roles before persisting', async () => {
  const originalAuth = (globalThis as any).requireAuthSession, originalConnect = pool.connect
  const handler = (await import('../server/api/quotes/preferences.put')).default as any
  let role = 'biller', connections = 0
  const event = (owner = 'company') => {
    const json = JSON.stringify(emptyQuotePreferences()), req: any = Readable.from([Buffer.from(json)])
    req.url = '/api/quotes/preferences'; req.method = 'PUT'; req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(json)), 'x-company-id': owner }
    const e = createEvent(req, {} as any); e.context.authorizedCompanyIds = Promise.resolve(['company']); return e
  }
  try {
    const f = workflowDb()
    ;(globalThis as any).requireAuthSession = async () => ({ data: { companyId: 'company', id: 'staff', role } })
    pool.connect = (async () => { connections++; return f.db }) as any
    await assert.rejects(handler(event()), { statusCode: 403 }); assert.equal(connections, 0)
    role = 'admin'; await assert.rejects(handler(event('foreign')), { statusCode: 403 }); assert.equal(connections, 0)
    assert.equal((await handler(event())).preferences.defaultTemplate, 'classic')
    assert.equal(f.calls.at(-1).sql, 'COMMIT')
  } finally { (globalThis as any).requireAuthSession = originalAuth; pool.connect = originalConnect }
})

test('signed links reject tampering and expiry and expose only the intended document', async () => {
  const original = process.env.QUOTE_SHARE_SECRET; process.env.QUOTE_SHARE_SECRET = 'quote-test-secret-'.repeat(4)
  try {
    const token = createQuoteShare('quote', 'company', 'revision', 1000)
    assert.equal(verifyQuoteShare(token, 2000).quoteId, 'quote')
    assert.throws(() => verifyQuoteShare(token + 'x', 2000)); assert.throws(() => verifyQuoteShare(token, 1000 + 31 * 86400000))
    const f = workflowDb({ allowCustomerApproval: true }); f.state.quote.status = 'SENT'
    const live = createQuoteShare('quote', 'company', 'revision')
    const result = await sharedQuote(f.db, live)
    assert.deepEqual(result.publicData.quote.documentDesign, f.state.preferences.documentDesign)
    assert.equal(result.publicData.canRespond, true)
    assert.equal((result.publicData.quote as any).createdByUserId, undefined)
    assert.equal((result.publicData.quote as any).workflow, undefined)
    f.state.metadata.revision = 'updated'
    await assert.rejects(sharedQuote(f.db, live), /updated/)
  } finally { original === undefined ? delete process.env.QUOTE_SHARE_SECRET : process.env.QUOTE_SHARE_SECRET = original }
})

test('public acceptance is final and idempotent, while decline and expired/disabled approval cannot issue invoices', async () => {
  const originalSecret = process.env.QUOTE_SHARE_SECRET, originalConnect = pool.connect
  process.env.QUOTE_SHARE_SECRET = 'quote-test-secret-'.repeat(4)
  const handler = (await import('../server/api/quote-share.post')).default as any
  const event = (token: string, decision: string) => {
    const body = JSON.stringify({ token, decision }), req: any = Readable.from([Buffer.from(body)])
    req.method = 'POST'; req.url = '/api/quote-share'; req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) }
    return createEvent(req, { setHeader() {} } as any)
  }
  try {
    for (const decision of ['ACCEPTED', 'DECLINED']) {
      const f = workflowDb({ allowCustomerApproval: true, conversion: 'draft' }); f.state.quote.status = 'SENT'
      pool.connect = (async () => f.db) as any
      const token = createQuoteShare('quote', 'company', 'revision')
      assert.equal((await handler(event(token, decision))).status, decision)
      assert.equal((await handler(event(token, decision))).status, decision)
      assert.equal(f.state.bills.length, 0)
      assert.equal(!!f.state.metadata.workflow.invoiceDraft, decision === 'ACCEPTED')
      await assert.rejects(handler(event(token, decision === 'ACCEPTED' ? 'DECLINED' : 'ACCEPTED')), { statusCode: 409 })
    }
    for (const patch of [{ allowCustomerApproval: false }, { expired: true }]) {
      const f = workflowDb({ allowCustomerApproval: !('allowCustomerApproval' in patch) }); f.state.quote.status = 'SENT'
      if (patch.expired) f.state.quote.expiryDate = '2000-01-01'
      pool.connect = (async () => f.db) as any
      await assert.rejects(handler(event(createQuoteShare('quote', 'company', 'revision'), 'ACCEPTED')), { statusCode: 409 })
    }
  } finally { pool.connect = originalConnect; originalSecret === undefined ? delete process.env.QUOTE_SHARE_SECRET : process.env.QUOTE_SHARE_SECRET = originalSecret }
})

test('generated CRUD cannot bypass accepted-quote and preference workflow protections', async () => {
  const method = async () => { throw Error('Bypass') }
  const delegate: any = Object.fromEntries(['create','update','updateMany','deleteMany','createManyAndReturn'].map(key => [key, method]))
  const db: any = { quote: delegate, quoteItem: delegate, quoteCustomFieldValue: delegate, salesOrder: delegate, salesOrderItem: delegate,
    generalPreference: { ...delegate, findMany: async () => [{ pageName: 'quotes' }] }, $transaction: async (fn: any) => fn(db) }
  const api = scopeOrganizationModelReads(db, 'company', ['company'])
  for (const model of ['quote', 'quoteItem', 'quoteCustomFieldValue', 'salesOrder', 'salesOrderItem', 'generalPreference'])
    for (const operation of ['create','update','updateMany','deleteMany','createManyAndReturn'])
      await assert.rejects(api[model][operation]({ data: { pageName: 'quotes' } }), /quote APIs/)
})

test('read-only database plans preference and conversion SQL without running writes', { skip: process.env.QUOTE_READONLY_DATABASE !== '1' }, async () => {
  const dotenv = await import('dotenv'); dotenv.config({ quiet: true } as any)
  const { Client } = await import('pg'), db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 })
  try {
    await db.connect(); await db.query('BEGIN READ ONLY')
    const f = workflowDb({ conversion: 'email' }); await convertAcceptedQuote(f.db, 'company', 'quote', 'staff')
    await deliverQuoteInvoiceEmail(f.pool, 'company', 'quote', async () => {})
    await saveQuotePreferences(f.db, 'company', emptyQuotePreferences())
    for (const call of f.calls) if (/^(?:INSERT|UPDATE|DELETE|SELECT)/.test(call.sql.trim()))
      await db.query('EXPLAIN ' + call.sql, call.values)
    await db.query('ROLLBACK')
  } finally { await db.end() }
})
