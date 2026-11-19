import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { createEvent } from 'h3'
import { pool } from '../server/db'
import { prisma } from '../server/prisma'
import { saveProductServiceLinks } from '../server/utils/after-sales'
import { defaultServiceRules, serviceToday, addServiceDate } from '../utils/after-sales'
import { newQuoteLine } from '../utils/erp-quote'

// Real route handlers, PostgreSQL and installed posting/stock triggers. Authentication
// is supplied by the harness; no browser login is simulated. No DDL, migrations or
// committed data. Route commits are savepoints inside one outer rollback transaction.
test('after-sales API workflow against installed schema (rollback only)', async t => {
  if (!process.env.DATABASE_URL) { t.skip('DATABASE_URL is not configured.'); return }
  const db = await pool.connect()
  const originalConnect = pool.connect.bind(pool)
  const originalQuery = pool.query.bind(pool)
  const originalAuth = (globalThis as any).requireAuthSession
  let depth = 0
  const fixtureIds: string[] = []
  const client = { release() {}, async query(sql: string, args?: any[]) {
    const command = sql.trim().toUpperCase()
    if (command === 'BEGIN') return db.query(`SAVEPOINT after_sales_api_${++depth}`)
    if (command === 'COMMIT') {
      await db.query('SET CONSTRAINTS ALL IMMEDIATE')
      await db.query('SET CONSTRAINTS ALL DEFERRED')
      return db.query(`RELEASE SAVEPOINT after_sales_api_${depth--}`)
    }
    if (command === 'ROLLBACK') {
      const name = `after_sales_api_${depth--}`
      await db.query(`ROLLBACK TO SAVEPOINT ${name}`)
      return db.query(`RELEASE SAVEPOINT ${name}`)
    }
    return db.query(sql, args)
  } }
  try {
    await db.query('BEGIN')
    await db.query("SET LOCAL lock_timeout='10s'")
    if (!(await db.query("SELECT to_regclass('public.service_charges') IS NOT NULL AS ready")).rows[0].ready) {
      t.skip('After-sales and service catalog tables must already be installed.'); return
    }
    const owner = (await db.query(`SELECT cu.company_id,cu.user_id FROM company_users cu
      JOIN companies c ON c.id=cu.company_id JOIN users u ON u.id=cu.user_id
      WHERE c.status=true AND cu.status=true AND cu.deleted=false AND u.cleanup=false
      AND ($1::text IS NULL OR cu.company_id=$1) ORDER BY cu.company_id,cu.user_id LIMIT 1`,
      [process.env.AFTER_SALES_TEST_COMPANY_ID || null])).rows[0]
    if (!owner) { t.skip('An active company and staff membership are required.'); return }
    const company = owner.company_id, run = randomUUID(), today = serviceToday()
    const session = { data: { companyId: company, id: owner.user_id, role: 'manager' } }
    ;(globalThis as any).requireAuthSession = async () => session
    ;(pool as any).connect = async () => client
    ;(pool as any).query = (sql: string, args?: any[]) => db.query(sql, args)
    const modules = await Promise.all([
      import('../server/api/after-sales/staff.get'), import('../server/api/after-sales/configurations/index.get'),
      import('../server/api/after-sales/configurations/index.post'), import('../server/api/after-sales/configurations/archive.post'),
      import('../server/api/after-sales/configurations/preview.post'), import('../server/api/after-sales/products/index.get'),
      import('../server/api/after-sales/products/index.post'), import('../server/api/after-sales/products/[id].get'),
      import('../server/api/after-sales/products/update.post'), import('../server/api/after-sales/jobs/index.get'),
      import('../server/api/after-sales/jobs/index.post'), import('../server/api/after-sales/jobs/invoice.post'),
      import('../server/api/after-sales/catalog/index.get'), import('../server/api/after-sales/catalog/charges.post'),
      import('../server/api/after-sales/maintenance.get'), import('../server/api/after-sales/process.post'),
      import('../server/api/after-sales/links.get'), import('../server/api/after-sales/sale-context.get'),
      import('../server/api/after-sales/customers/[id].get')
    ])
    const [staff, configs, saveConfig, archive, preview, products, register, detail, update, jobs, saveJob, invoice, catalog, charge, maintenance, processDue, links, context, customerHistory] = modules.map(m => m.default)
    async function call(handler: any, method = 'GET', body: any = {}, id?: string, query = '', requestCompany = company) {
      const json = JSON.stringify(body), req: any = Readable.from([Buffer.from(json)])
      req.method = method; req.url = '/api/after-sales/test' + query
      req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(json)), 'x-company-id': requestCompany }
      const event = createEvent(req, { setHeader() {} } as any)
      event.context.authorizedCompanyIds = Promise.resolve([company])
      event.context.params = id ? { id } : {}
      return handler(event)
    }
    const id = () => { const value = randomUUID(); fixtureIds.push(value); return value }
    const customer = id()
    await db.query('INSERT INTO clients(id,name,phone) VALUES($1,$2,$3)', [customer, 'After-sales fixture ' + run, 'AS-' + run])
    await db.query('INSERT INTO company_clients(company_id,client_id) VALUES($1,$2)', [company, customer])
    const staffIds: string[] = []
    for (const [name, active, deleted, cleanup] of [['Fixture technician', true, false, false], ['', true, false, false], ['Inactive', false, false, false], ['Deleted', true, true, false], ['Cleanup', true, false, true]] as const) {
      const userId = id(); staffIds.push(userId)
      await db.query('INSERT INTO users(id,email,password,cleanup) VALUES($1,$2,$3,$4)', [userId, userId + '@after-sales.invalid', 'rollback-only', cleanup])
      await db.query('INSERT INTO company_users(company_id,user_id,name,status,deleted) VALUES($1,$2,$3,$4,$5)', [company, userId, name, active, deleted])
    }
    const stock: any[] = []
    const partsCategory = id()
    await db.query('INSERT INTO categories(id,company_id,name,updated_at) VALUES($1,$2,$3,now())', [partsCategory, company, 'AS parts ' + run])
    for (const service of [false, true]) {
      const productId = id(), variantId = id(), itemId = id()
      await db.query('INSERT INTO products(id,company_id,name,is_service_product,category_id,updated_at) VALUES($1,$2,$3,$4,$5,now())', [productId, company, 'AS fixture ' + run + (service ? ' service' : ' regular'), service, partsCategory])
      await db.query("INSERT INTO variants(id,company_id,product_id,name,s_price,p_price,images,updated_at) VALUES($1,$2,$3,'Standard',50,10,'{}',now())", [variantId, company, productId])
      const item = (await db.query('INSERT INTO items(id,company_id,variant_id,qty,initial_qty,sold_qty,updated_at) VALUES($1,$2,$3,10,10,0,now()) RETURNING barcode', [itemId, company, variantId])).rows[0]
      stock.push({ productId, variantId, itemId, barcode: item.barcode })
    }
    let warranty: any, guarantee: any, plan: any, unit: any, agreement: any, occurrence: any, completedJob: any
    const registration = { clientId: customer, name: 'AS registered fixture ' + run, purchasedOn: addServiceDate(today, -1, 'DAY'), evidence: 'Rollback-only API test', requestKey: run }
    if (process.env.AFTER_SALES_BROWSER_ONLY !== '1' || process.env.AFTER_SALES_BROWSER_E2E !== '1') {
    await t.test('staff list uses company names, email fallback and active assignable memberships', async () => {
      const rows = await call(staff)
      assert.equal(rows.find((r: any) => r.id === staffIds[0])?.name, 'Fixture technician')
      assert.equal(rows.find((r: any) => r.id === staffIds[1])?.name, staffIds[1] + '@after-sales.invalid')
      assert(staffIds.slice(2).every(value => !rows.some((r: any) => r.id === value)))
      await assert.rejects(call(staff, 'GET', {}, undefined, '', randomUUID()), { statusCode: 403 })
    })
    await t.test('configuration CRUD, product links, sale context and service catalogue', async () => {
      warranty = await call(saveConfig, 'POST', { kind: 'WARRANTY', name: 'AS warranty ' + run, rules: defaultServiceRules() })
      guarantee = await call(saveConfig, 'POST', { kind: 'GUARANTEE', name: 'AS guarantee ' + run, rules: { ...defaultServiceRules(), duration: 7, durationUnit: 'DAY' } })
      plan = await call(saveConfig, 'POST', { kind: 'MAINTENANCE', name: 'AS care ' + run, rules: { ...defaultServiceRules(), frequency: 'DAY', interval: 1, visitLimit: 3, freeVisits: 1, charge: 150,
        fields: [{ key: 'reading', label: 'Reading', type: 'NUMBER', unit: 'hours', required: true }] } })
      assert.equal((await call(configs, 'GET', {}, undefined, '?q=' + run)).length, 3)
      await saveProductServiceLinks(client, company, stock[0].productId, [plan.id, warranty.id, guarantee.id])
      assert.equal((await call(links, 'GET', {}, undefined, '?productIds=' + stock[0].productId)).length, 3)
      assert.equal((await call(context, 'GET', {}, undefined, '?itemIds=' + stock[0].itemId)).length, 3)
      const savedCharge = await call(charge, 'POST', { name: 'AS labour ' + run, rate: 100, tax: 18, unit: 'Hour' })
      const anotherCharge = await call(charge, 'POST', { name: 'AS inspection ' + run, rate: 25, tax: 5 })
      assert.equal(anotherCharge.category.id, savedCharge.category.id)
      assert.equal((await call(catalog)).chargeCategory.id, savedCharge.category.id)
      assert.equal((await db.query('SELECT company_id,status FROM categories WHERE id=$1', [savedCharge.category.id])).rows[0].company_id, company)
      assert((await call(catalog, 'GET', {}, undefined, '?q=' + run)).charges.some((r: any) => r.id === savedCharge.id))
      assert((await call(catalog, 'GET', {}, undefined, '?q=' + run)).products.some((r: any) => r.id === stock[1].productId))
      await call(archive, 'POST', { id: guarantee.id, archived: true })
      await saveProductServiceLinks(client, company, stock[0].productId, [plan.id, warranty.id, guarantee.id])
      await call(archive, 'POST', { id: guarantee.id, archived: false })
    })
    await t.test('registration, customer lookup, due generation and deduplication', async () => {
      unit = await call(register, 'POST', { ...registration, configurationIds: [warranty.id, guarantee.id, plan.id] })
      assert.equal((await call(register, 'POST', { ...registration, configurationIds: [plan.id] })).id, unit.id)
      const record = await call(detail, 'GET', {}, unit.id)
      assert.equal(record.agreements.length, 3); assert.equal(record.product.serial_number, null)
      assert((await call(products, 'GET', {}, undefined, '?clientId=' + customer)).some((p: any) => p.id === unit.id))
      agreement = record.agreements.find((a: any) => a.kind === 'MAINTENANCE')
      await call(processDue, 'POST')
      const due = (await call(maintenance)).filter((o: any) => o.customer_product_id === unit.id)
      assert(due.length > 0); occurrence = due.find((o: any) => o.due_on === today)
      assert(occurrence, 'The visit due today is listed')
      const count = (await db.query('SELECT count(*)::int AS count FROM maintenance_occurrences WHERE agreement_id=$1', [agreement.id])).rows[0].count
      await call(processDue, 'POST')
      assert.equal((await db.query('SELECT count(*)::int AS count FROM maintenance_occurrences WHERE agreement_id=$1', [agreement.id])).rows[0].count, count)
    })
    await t.test('assignment, cancellation, rebooking, completion and free allowance', async () => {
      const input = { agreementId: agreement.id, occurrenceId: occurrence.id, requestKey: run + '-visit', assignedTo: staffIds[0], status: 'SCHEDULED', appointmentOn: today + 'T09:00:00+05:30', details: { values: {} } }
      const booked = await call(saveJob, 'POST', input)
      await call(saveJob, 'POST', { ...input, id: booked.id, status: 'CANCELLED' })
      assert.equal((await call(detail, 'GET', {}, unit.id)).agreements.find((a: any) => a.id === agreement.id).completed_visits, 0)
      for (const invalidStaff of [...staffIds.slice(2), randomUUID()]) await assert.rejects(call(saveJob, 'POST', { ...input, requestKey: randomUUID(), assignedTo: invalidStaff }), { statusCode: 400 })
      completedJob = await call(saveJob, 'POST', { ...input, requestKey: run + '-rebook', status: 'COMPLETED', completedOn: today, details: { values: { reading: 123 }, charges: [], parts: [] } })
      const record = await call(detail, 'GET', {}, unit.id)
      assert.equal(record.agreements.find((a: any) => a.id === agreement.id).completed_visits, 1)
      assert.equal(record.jobs.find((j: any) => j.id === completedJob.id).assigned_to, staffIds[0])
      await call(saveJob, 'POST', { id: completedJob.id, status: 'COMPLETED' })
      assert.equal((await call(detail, 'GET', {}, unit.id)).agreements.find((a: any) => a.id === agreement.id).completed_visits, 1)
      assert((await call(jobs)).some((j: any) => j.id === completedJob.id))
    })
    await t.test('zero invoice is explicit, idempotent and does not collect payment', async () => {
      const issued = await call(invoice, 'POST', { id: completedJob.id })
      assert.equal((await call(invoice, 'POST', { id: completedJob.id })).billId, issued.billId)
      const bill = (await db.query('SELECT grand_total,payment_status,payment_method FROM bills WHERE id=$1', [issued.billId])).rows[0]
      assert.equal(Number(bill.grand_total), 0); assert.equal(bill.payment_status, 'PENDING'); assert.equal(bill.payment_method, 'Credit')
      assert((await db.query('SELECT category_id FROM entries WHERE bill_id=$1', [issued.billId])).rows.every((e:any)=>e.category_id))
    })
    await t.test('paid service invoices combine labour, ordinary products and service parts with stock once', async () => {
      const parts = stock.map((part, i) => ({ ...newQuoteLine(id()), variantId: part.variantId, name: 'AS repair part ' + i, barcode: part.barcode, rate: 50 }))
      const charges = [{ ...newQuoteLine(id()), name: 'Labour', rate: 118, tax: 18 }]
      const saved = await call(saveJob, 'POST', { agreementId: agreement.id, requestKey: run + '-paid', status: 'COMPLETED', completedOn: today, details: { values: { reading: 124 }, charges, parts } })
      const issued = await call(invoice, 'POST', { id: saved.id })
      const bill = (await db.query('SELECT grand_total,payment_status FROM bills WHERE id=$1', [issued.billId])).rows[0]
      assert.equal(Number(bill.grand_total), 218); assert.equal(bill.payment_status, 'PENDING')
      assert.equal((await db.query('SELECT count(*)::int AS count FROM entries WHERE bill_id=$1', [issued.billId])).rows[0].count, 3)
      const lines = (await db.query('SELECT item_id,category_id,tax,rate FROM entries WHERE bill_id=$1', [issued.billId])).rows
      assert(lines.filter((e:any)=>e.item_id).every((e:any)=>e.category_id===partsCategory))
      const labourLine = lines.find((e:any)=>!e.item_id)
      assert.equal(labourLine.category_id, (await call(catalog)).chargeCategory.id)
      assert.equal(labourLine.tax,18); assert.equal(labourLine.rate,118)
      const quantities = () => db.query('SELECT id,qty,sold_qty FROM items WHERE id=ANY($1::text[]) ORDER BY id', [stock.map(p => p.itemId)])
      const before = (await quantities()).rows
      assert(before.every((item: any) => item.qty === 9 && item.sold_qty === 1))
      assert.equal((await call(invoice, 'POST', { id: saved.id })).billId, issued.billId)
      assert.deepEqual((await quantities()).rows, before)
    })
    await t.test('free replacement parts issue a zero invoice and still consume physical stock', async () => {
      const freeUnit = await call(register, 'POST', { ...registration, requestKey: run + '-free-parts', configurationIds: [plan.id] })
      const freeAgreement = (await call(detail, 'GET', {}, freeUnit.id)).agreements[0]
      const parts = stock.map((part, i) => ({ ...newQuoteLine(id()), variantId: part.variantId, name: 'Included repair part ' + i, barcode: part.barcode, rate: 0 }))
      const saved = await call(saveJob, 'POST', { agreementId: freeAgreement.id, requestKey: run + '-free-parts-job', status: 'COMPLETED', details: { values: { reading: 1 }, charges: [], parts } })
      const issued = await call(invoice, 'POST', { id: saved.id })
      assert.equal(Number((await db.query('SELECT grand_total FROM bills WHERE id=$1', [issued.billId])).rows[0].grand_total), 0)
      assert((await db.query('SELECT qty,sold_qty FROM items WHERE id=ANY($1::text[])', [stock.map(p => p.itemId)])).rows.every((item: any) => item.qty === 8 && item.sold_qty === 2))
      assert.equal((await call(invoice, 'POST', { id: saved.id })).billId, issued.billId)
    })
    await t.test('customer history includes purchased products without duplicating registered units or listing labour', async () => {
      const before=(await db.query('SELECT count(*)::int AS count FROM customer_products WHERE company_id=$1 AND client_id=$2',[company,customer])).rows[0].count
      const history=await call(customerHistory,'GET',{},customer,'?pageSize=50')
      assert.equal(history.customer.id,customer)
      assert(history.rows.some((row:any)=>row.customer_product_id===unit.id))
      assert.equal(history.rows.filter((row:any)=>row.status==='UNREGISTERED').length,4,'Both paid and free invoices contain two unregistered part purchases')
      assert(history.rows.filter((row:any)=>row.status==='UNREGISTERED').every((row:any)=>row.purchased_on===today),'Purchase dates match the source invoice date')
      assert.equal(history.total,before+4,'Registered units replace their original purchased quantity')
      assert(!history.rows.some((row:any)=>row.name==='Labour'))
      assert.equal((await db.query('SELECT count(*)::int AS count FROM customer_products WHERE company_id=$1 AND client_id=$2',[company,customer])).rows[0].count,before,'Reading purchase history never backfills units')
      const page=await call(customerHistory,'GET',{},customer,'?pageSize=10&page=999')
      assert.equal(page.rows.length,0);assert.equal(page.total,history.total)
      await assert.rejects(call(customerHistory,'GET',{},randomUUID()),{statusCode:404})
    })
    await t.test('claims, readings, amendment previews, installation activation and returns', async () => {
      const record = await call(detail, 'GET', {}, unit.id), coverage = record.agreements.find((a: any) => a.kind === 'WARRANTY')
      const claim = await call(saveJob, 'POST', { agreementId: coverage.id, requestKey: run + '-claim', status: 'OPEN', details: { complaint: 'Test complaint' } })
      await assert.rejects(call(invoice, 'POST', { id: claim.id }), { statusCode: 400 })
      await call(saveJob, 'POST', { id: claim.id, status: 'RESOLVED', details: { complaint: 'Test complaint', assessment: 'Inspected', resolution: 'Repaired', charges: [] } })
      assert((await call(invoice, 'POST', { id: claim.id })).billId)
      await call(update, 'POST', { id: unit.id, action: 'READING', reason: 'Test inspection', agreementId: agreement.id, recordedOn: today, values: { reading: 125 } })
      assert.equal((await call(detail, 'GET', {}, unit.id)).readings[0].values.fields.reading, 125)
      const edit = { id: plan.id, revision: 1, kind: 'MAINTENANCE', name: 'AS amended ' + run, rules: { ...agreement.snapshot.rules, interval: 2 }, applyTo: 'SELECTED', reason: 'Test amendment', agreementIds: [agreement.id] }
      const change = await call(preview, 'POST', edit)
      await call(saveConfig, 'POST', { ...edit, previewToken: change.token })
      assert.equal((await call(detail, 'GET', {}, unit.id)).agreements.find((a: any) => a.id === agreement.id).revision, 2)
      const historical = (await call(detail, 'GET', {}, unit.id)).jobs.find((job: any) => job.id === completedJob.id)
      assert.equal(historical.agreement_name, agreement.snapshot.name, 'Completed work displays its booked plan name after amendments')
      assert.equal((await call(jobs, 'GET', {}, undefined, '?clientId=' + customer)).find((job: any) => job.id === completedJob.id).agreement_name, agreement.snapshot.name)
      const install = await call(saveConfig, 'POST', { kind: 'WARRANTY', name: 'AS installation ' + run, rules: { ...defaultServiceRules(), activation: 'INSTALLATION' } })
      const pending = await call(register, 'POST', { ...registration, requestKey: run + '-pending', configurationIds: [install.id] })
      assert.equal((await call(detail, 'GET', {}, pending.id)).agreements[0].status, 'PENDING')
      await call(update, 'POST', { id: pending.id, action: 'DATES', reason: 'Installed', installedOn: today })
      assert.equal((await call(detail, 'GET', {}, pending.id)).agreements[0].status, 'ACTIVE')
      await call(update, 'POST', { id: pending.id, action: 'RETURN', reason: 'Completed return' })
      assert.equal((await call(detail, 'GET', {}, pending.id)).agreements[0].status, 'CANCELLED')
    })
    await t.test('every feature handler rejects customer roles and unauthorized companies', async () => {
      for (const handler of modules.map(m => m.default)) {
        session.data.role = 'client'
        await assert.rejects(call(handler), { statusCode: 403 })
        session.data.role = 'manager'
        await assert.rejects(call(handler, 'GET', {}, undefined, '', randomUUID()), { statusCode: 403 })
      }
    })
    await t.test('jobs and maintenance search the server result set', async () => {
      const missing = randomUUID()
      assert.deepEqual(await call(jobs, 'GET', {}, undefined, '?q=' + missing), [])
      assert.deepEqual(await call(maintenance, 'GET', {}, undefined, '?q=' + missing), [])
      assert((await call(jobs, 'GET', {}, undefined, '?q=' + encodeURIComponent(registration.name))).some((row: any) => row.id === completedJob.id))
    })
    await t.test('jobs and maintenance apply client and document context before result limits', async () => {
      for (const key of ['clientId', 'billId', 'orderId']) {
        const query = '?' + key + '=' + randomUUID()
        assert.deepEqual(await call(jobs, 'GET', {}, undefined, query), [], key + ' scopes jobs')
        assert.deepEqual(await call(maintenance, 'GET', {}, undefined, query), [], key + ' scopes maintenance')
      }
    })
    await t.test('completed job dates remain date-only through JSON serialization', async () => {
      const record = JSON.parse(JSON.stringify(await call(detail, 'GET', {}, unit.id)))
      assert.equal(record.jobs.find((job: any) => job.id === completedJob.id).completed_on, today)
    })
    const newUnit = (suffix: string) => call(register, 'POST', { ...registration, requestKey: run + suffix, configurationIds: [plan.id] })
    await t.test('returned products cannot be replaced or have their terminal state rewritten', async () => {
      const original = await newUnit('-returned-source'), replacement = await newUnit('-returned-target')
      await call(update, 'POST', { id: original.id, action: 'RETURN', reason: 'Physical return' })
      await assert.rejects(call(update, 'POST', { id: original.id, action: 'REPLACE', replacementId: replacement.id, reason: 'Invalid replacement' }), { statusCode: 400 })
      assert.equal((await call(detail, 'GET', {}, original.id)).product.status, 'RETURNED')
    })
    await t.test('restarting replacement coverage retires the original bookings and due occurrences', async () => {
      const original = await newUnit('-restart-source'), replacement = await newUnit('-restart-target')
      const record = await call(detail, 'GET', {}, original.id), originalAgreement = record.agreements[0]
      await call(processDue, 'POST')
      const due = (await call(maintenance)).find((row: any) => row.customer_product_id === original.id)
      assert(due)
      const booking = await call(saveJob, 'POST', { agreementId: originalAgreement.id, occurrenceId: due.id, requestKey: run + '-restart-booking', status: 'SCHEDULED' })
      await call(update, 'POST', { id: original.id, action: 'REPLACE', replacementId: replacement.id, restart: true, reason: 'Restart replacement terms' })
      const after = await call(detail, 'GET', {}, original.id)
      assert.equal(after.product.status, 'REPLACED')
      assert.equal(after.jobs.find((job: any) => job.id === booking.id).status, 'CANCELLED')
      assert.equal((await db.query("SELECT count(*)::int AS count FROM maintenance_occurrences WHERE agreement_id=$1 AND status='DUE'", [originalAgreement.id])).rows[0].count, 0)
    })
    await t.test('carry-forward replacement retains readings and history with the moved agreement', async () => {
      const original = await newUnit('-carry-source'), replacement = await newUnit('-carry-target')
      const record = await call(detail, 'GET', {}, original.id), originalAgreement = record.agreements[0]
      await call(update, 'POST', { id: original.id, action: 'READING', agreementId: originalAgreement.id, recordedOn: today, values: { reading: 222 }, reason: 'Before replacement reading' })
      await call(update, 'POST', { id: original.id, action: 'REPLACE', replacementId: replacement.id, reason: 'Continue original terms' })
      const after = await call(detail, 'GET', {}, replacement.id)
      assert(after.agreements.some((a: any) => a.id === originalAgreement.id))
      assert(after.readings.some((reading: any) => reading.values.fields.reading === 222), 'Carried agreement retains its reading evidence')
      assert(after.history.some((entry: any) => entry.action === 'READING'), 'Carried agreement retains its audit evidence')
    })
    }
    if (process.env.AFTER_SALES_BROWSER_E2E === '1') await t.test('browser forms through real HTTP handlers and PostgreSQL (rollback only)', async () => {
      const { runAfterSalesBrowser } = await import('./after-sales-browser-bridge')
      const findClients = (await import('../server/api/bill/findManyClient.get')).default
      const routes: Record<string, any> = {
        'GET /api/after-sales/staff': staff, 'GET /api/after-sales/configurations': configs,
        'POST /api/after-sales/configurations': saveConfig, 'POST /api/after-sales/configurations/preview': preview,
        'POST /api/after-sales/configurations/archive': archive, 'GET /api/after-sales/products': products,
        'POST /api/after-sales/products': register, 'POST /api/after-sales/products/update': update,
        'GET /api/after-sales/maintenance': maintenance, 'GET /api/after-sales/jobs': jobs,
        'POST /api/after-sales/jobs': saveJob, 'POST /api/after-sales/jobs/invoice': invoice,
        'GET /api/after-sales/catalog': catalog, 'POST /api/after-sales/catalog/charges': charge,
        'POST /api/after-sales/process': processDue, 'GET /api/bill/findManyClient': findClients
      }
      await runAfterSalesBrowser({ company, customer, customerName: 'After-sales fixture ' + run, today, run }, async (path, method, body, query) => {
        const match = path.match(/^\/api\/after-sales\/(products|customers)\/([^/]+)$/)
        if (method === 'GET' && match) return call(match[1] === 'products' ? detail : customerHistory, method, body, match[2], query)
        const handler = routes[method + ' ' + path]
        assert(handler, 'Unknown browser fixture endpoint ' + method + ' ' + path)
        return call(handler, method, body, undefined, query)
      })
    })
  } finally {
    ;(pool as any).connect = originalConnect
    ;(pool as any).query = originalQuery
    ;(globalThis as any).requireAuthSession = originalAuth
    try {
      await db.query('ROLLBACK')
      if (fixtureIds.length) assert.equal((await db.query('SELECT count(*)::int AS count FROM clients WHERE id=ANY($1::text[])', [fixtureIds])).rows[0].count, 0, 'Fixture rows must not persist')
    } finally { db.release(); await pool.end(); await prisma.$disconnect() }
  }
})
