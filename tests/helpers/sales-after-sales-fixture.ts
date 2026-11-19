import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import * as h3 from 'h3'
import { pool } from '../../server/db'
import { prisma } from '../../server/prisma'
import { defaultServiceRules, serviceToday } from '../../utils/after-sales'
import { saveConfiguration, saveProductServiceLinks, serviceProductList, serviceProductDetail } from '../../server/utils/after-sales'
import { saveSalesWorkflow } from '../../server/utils/sales-workflow'

/** All source, stock, service, receipt and accounting writes share one rollback. */
export async function salesAfterSalesFixture() {
  const db = await pool.connect(), run = randomUUID(), today = serviceToday()
  const originalConnect = pool.connect, originalQuery = pool.query
  const originals = new Map<string, any>(), ormOriginals: Array<() => void> = []
  const owned = new Set<string>(), fixtureClients: string[] = []
  let depth = 0
  const query = async (sql: string, args?: any[]) => {
    const command = sql.trim().toUpperCase()
    if (command === 'BEGIN') return db.query(`SAVEPOINT sales_after_sales_${++depth}`)
    if (command === 'COMMIT') {
      await db.query('SET CONSTRAINTS ALL IMMEDIATE'); await db.query('SET CONSTRAINTS ALL DEFERRED')
      return db.query(`RELEASE SAVEPOINT sales_after_sales_${depth--}`)
    }
    if (command === 'ROLLBACK') {
      if (!depth) return { rows: [], rowCount: 0 }
      const name = `sales_after_sales_${depth--}`
      await db.query(`ROLLBACK TO SAVEPOINT ${name}`)
      return db.query(`RELEASE SAVEPOINT ${name}`)
    }
    return db.query(sql, args)
  }
  async function close() {
    pool.connect = originalConnect; pool.query = originalQuery
    ormOriginals.forEach(restore => restore())
    originals.forEach((value, key) => { if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value })
    try {
      await db.query('ROLLBACK')
      const remaining = await db.query('SELECT id FROM clients WHERE id=ANY($1::text[])', [fixtureClients])
      if (remaining.rowCount) throw Error('Sales-after-sales fixture clients persisted after rollback')
    } finally { db.release(); await pool.end(); await prisma.$disconnect() }
  }
  try {
    await db.query('BEGIN')
    await db.query("SET LOCAL lock_timeout='10s'")
    await db.query("SET LOCAL statement_timeout='30s'")
    const owner = (await db.query(`SELECT s.company_id,cu.user_id,s.enabled AS accounting_enabled FROM accountant_v2_erp_settings s
      JOIN companies c ON c.id=s.company_id JOIN company_users cu ON cu.company_id=s.company_id
      WHERE (s.enabled=true OR $1::text IS NOT NULL) AND c.status=true AND cu.status=true AND cu.deleted=false
      AND ($1::text IS NULL OR s.company_id=$1) ORDER BY s.company_id,cu.user_id LIMIT 1`,
    [process.env.AFTER_SALES_TEST_COMPANY_ID || null])).rows[0]
    if (!owner) throw Error('An active company with ERP settings and active staff is required; the default fixture also requires enabled accounting')
    const company = owner.company_id, actor = owner.user_id
    const initialAccountingEnabled=owner.accounting_enabled===true
    const temporaryAccounting=process.env.AFTER_SALES_TEST_ENABLE_ACCOUNTING==='1'
    if(temporaryAccounting){
      if(!process.env.AFTER_SALES_TEST_COMPANY_ID) throw Error('Temporary accounting opt-in requires an explicitly selected test company')
      await db.query('UPDATE accountant_v2_erp_settings SET enabled=true WHERE company_id=$1',[company])
    }
    const session = { data: { companyId: company, id: actor, role: 'manager' }, async update(value: any) { Object.assign(this.data, value) } }
    for (const [key, value] of Object.entries({ ...h3, requireAuthSession: async () => session, useAuthSession: async () => session })) {
      originals.set(key, (globalThis as any)[key]); (globalThis as any)[key] = value
    }
    ;(pool as any).connect = async () => ({ query, release() {} })
    ;(pool as any).query = query
    // The production middleware still performs all ownership checks. Its ORM
    // reader must see records on the same uncommitted fixture connection.
    for (const [name, table] of [['bill','bills'],['item','items'],['variant','variants'],['product','products'],['category','categories']] as const) {
      const delegate = (prisma as any)[name], original = delegate.findUnique
      delegate.findUnique = async (args: any) => owned.has(args.where.id) && args.select?.companyId
        ? (await db.query(`SELECT company_id AS "companyId" FROM ${table} WHERE id=$1`, [args.where.id])).rows[0] || null
        : original.call(delegate, args)
      ormOriginals.push(() => { delegate.findUnique = original })
    }
    const middleware = (await import('../../server/middleware/company-request')).default
    const modules = await Promise.all([
      import('../../server/api/bill/create.post'), import('../../server/api/bill/update.post'),
      import('../../server/api/billSale/deleteBill.post'), import('../../server/api/billEdit/deleteBill.post'),
      import('../../server/api/billSale/receipts.post'), import('../../server/api/billSale/reverseReceipt.post'),
      import('../../server/api/ecommerce-cms/orders/create.post'), import('../../server/api/ecommerce-cms/orders/status.post'),
      import('../../server/api/billSale/restoreBill.post')
    ])
    const handlers = Object.fromEntries(['/api/bill/create','/api/bill/update','/api/billSale/deleteBill','/api/billEdit/deleteBill',
      '/api/billSale/receipts','/api/billSale/reverseReceipt','/api/ecommerce-cms/orders/create','/api/ecommerce-cms/orders/status','/api/billSale/restoreBill']
      .map((path, index) => [path, modules[index].default]))
    for (const [path, module] of await Promise.all([
      ['GET /api/after-sales/products', import('../../server/api/after-sales/products/index.get')],
      ['GET /api/after-sales/products/:id', import('../../server/api/after-sales/products/[id].get')],
      ['POST /api/after-sales/products/update', import('../../server/api/after-sales/products/update.post')],
      ['GET /api/after-sales/maintenance', import('../../server/api/after-sales/maintenance.get')],
      ['GET /api/after-sales/jobs', import('../../server/api/after-sales/jobs/index.get')],
      ['POST /api/after-sales/jobs', import('../../server/api/after-sales/jobs/index.post')],
      ['POST /api/after-sales/jobs/invoice', import('../../server/api/after-sales/jobs/invoice.post')],
      ['POST /api/after-sales/process', import('../../server/api/after-sales/process.post')],
      ['GET /api/after-sales/catalog', import('../../server/api/after-sales/catalog/index.get')],
      ['GET /api/after-sales/staff', import('../../server/api/after-sales/staff.get')],
      ['GET /api/after-sales/configurations', import('../../server/api/after-sales/configurations/index.get')],
      ['GET /api/after-sales/sale-context', import('../../server/api/after-sales/sale-context.get')]
    ].map(async ([path, pending]) => [path, await pending] as const))) handlers[path as string] = (module as any).default
    async function call(path: string, body: any = {}, method = 'POST', requestCompany = company) {
      const raw = JSON.stringify(body), req: any = Readable.from([Buffer.from(raw)])
      req.method = method; req.url = path
      req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(raw)), 'x-company-id': requestCompany }
      const event = h3.createEvent(req, { setHeader() {} } as any)
      event.context.authorizedCompanyIds = Promise.resolve([company])
      const detailMatch = method === 'GET' ? path.match(/^\/api\/after-sales\/products\/([^/?]+)(?:\?|$)/) : null
      if (detailMatch) event.context.params = { id: detailMatch[1] }
      await middleware(event)
      const route = method === 'GET' && detailMatch ? '/api/after-sales/products/:id' : path.split('?')[0]
      const handler = handlers[method + ' ' + route] || handlers[route]
      if (!handler) throw Error('Unexpected sales-after-sales request ' + method + ' ' + path)
      return handler(event)
    }
    await saveSalesWorkflow(db, company, { includeAfterSales: true, includeInvoicing: true })
    const id = () => { const value = randomUUID(); owned.add(value); return value }
    const customers: string[] = []
    for (let i = 0; i < 2; i++) {
      const customer = id(); customers.push(customer); fixtureClients.push(customer)
      await db.query('INSERT INTO clients(id,name,phone) VALUES($1,$2,$3)', [customer, `Sales service fixture ${run} ${i}`, `AS-${run}-${i}`])
      await db.query('INSERT INTO company_clients(company_id,client_id) VALUES($1,$2)', [company, customer])
    }
    const category = id()
    await db.query('INSERT INTO categories(id,company_id,name,updated_at) VALUES($1,$2,$3,now())', [category, company, 'Sales service ' + run])
    const stock: any[] = []
    for (let i = 0; i < 3; i++) {
      const product = i === 1 ? stock[0].product : id(), variant = id(), item = id()
      if (i !== 1) await db.query('INSERT INTO products(id,company_id,name,is_service_product,category_id,updated_at) VALUES($1,$2,$3,$4,$5,now())',
        [product, company, 'Sales service ' + run + ' ' + i, i === 2, category])
      await db.query("INSERT INTO variants(id,company_id,product_id,name,s_price,d_price,p_price,images,updated_at) VALUES($1,$2,$3,$4,100,100,25,'{}',now())", [variant, company, product, 'Variant ' + i])
      const row = (await db.query('INSERT INTO items(id,company_id,variant_id,qty,initial_qty,sold_qty,updated_at) VALUES($1,$2,$3,200,200,0,now()) RETURNING barcode', [item, company, variant])).rows[0]
      stock.push({ product, variant, item, barcode: row.barcode, name: 'Sales service ' + run + ' ' + i })
    }
    const configs: Record<string, any> = {}
    for (const kind of ['WARRANTY','GUARANTEE','MAINTENANCE']) configs[kind] = await saveConfiguration(db, company, actor, {
      kind, name: 'Sales ' + kind + ' ' + run,
      rules: { ...defaultServiceRules(), frequency: 'DAY', interval: 1, freeVisits: 1, charge: 100, tax: 18,
        fields: kind === 'MAINTENANCE' ? [{ key: 'meter', label: 'Meter', type: 'NUMBER', unit: 'hours', required: true }] : [] }
    })
    const coverage = async (kinds: string[], index = 0) => saveProductServiceLinks(db, company, stock[index].product, kinds.map(kind => configs[kind].id))
    const line = (index = 0, qty = 1, returned = false) => ({ name: stock[index].name, qty, rate: 100, value: qty * 100,
      discount: 0, tax: 0, return: returned, barcode: stock[index].barcode, item: { connect: { id: stock[index].item } },
      variant: { connect: { id: stock[index].variant } }, category: { connect: { id: category } } })
    function saleBody(entries = [line()], tender = 'Cash', clientId: string | null = customers[0]) {
      const total = entries.reduce((sum, entry) => sum + entry.value * (entry.return ? -1 : 1), 0), uuid = id()
      return { uuid, companyId: company, userId: actor, items: entries.map((entry, index) => ({ id: entry.item.connect.id, qty: entry.qty, serviceLineKey: 'line-' + index })),
        returnedServiceUnitIds: [] as string[], serviceUnits: [] as any[], billPoints: 0,
        payload: { subtotal: total, grandTotal: total, discount: 0, returnAmt: entries.filter(e => e.return).reduce((s,e) => s + e.value,0),
          discountType: 'percentage', paymentMethod: tender === 'invoice' ? 'Credit' : tender, paymentStatus: ['Credit','invoice','Split'].includes(tender) ? 'PENDING' : 'PAID', type: 'BILL',
          createdAt: today + 'T10:00:00+05:30', company: { connect: { id: company } }, ...(clientId ? { client: { connect: { id: clientId } } } : {}),
          companyUser: { connect: { companyId_userId: { companyId: company, userId: actor } } }, entries: { create: entries },
          ...(tender === 'Split' ? { splitPayments: [{ method: 'Cash', amount: total / 2 }, { method: 'Credit', amount: total / 2 }] } : {}),
          ...(tender === 'invoice' ? { billingMode: 'invoice', dueDate: today, invoicePaymentTerms: 'Due on receipt' } : {}) }
      }
    }
    async function sale(entries = [line()], tender = 'Cash', clientId: string | null = customers[0], details: any[] = []) {
      const body = saleBody(entries, tender, clientId); body.serviceUnits = details
      const result = await call('/api/bill/create', body)
      return { ...result, body, units: await serviceProductList(db, company, { billId: result.billId }) }
    }
    async function edit(billId: string, change: any = {}) {
      const bill = (await db.query('SELECT * FROM bills WHERE id=$1', [billId])).rows[0]
      const entries = (await db.query('SELECT * FROM entries WHERE bill_id=$1 ORDER BY id', [billId])).rows
      const items = entries.map(e => ({ entryId: e.id, id: e.item_id, variantId: e.variant_id, name: e.name, qty: e.qty, rate: e.rate,
        value: e.value, discount: e.discount, tax: e.tax, return: e.return, barcode: e.barcode, category: [{ id: e.category_id }] }))
      return call('/api/bill/update', { items, entriesToDelete: [], ...change, billData: { id: billId, companyId: company,
        clientId: bill.client_id, subtotal: bill.subtotal, grandTotal: bill.grand_total, discount: bill.discount, discountType: bill.discount_type,
        paymentMethod: bill.payment_method, paymentStatus: bill.payment_status, splitPayments: bill.split_payments, date: bill.created_at.toISOString(), ...change.billData } })
    }
    return { db, run, today, company, actor, initialAccountingEnabled, accountingEnabled:initialAccountingEnabled||temporaryAccounting, customers, category, stock, configs, id, call, coverage, line, saleBody, sale, edit, track: (value: string) => owned.add(value),
      units: (billId: string) => serviceProductList(db, company, { billId }), detail: (unitId: string) => serviceProductDetail(db, company, unitId),
      flush: async () => { await db.query('SET CONSTRAINTS ALL IMMEDIATE'); await db.query('SET CONSTRAINTS ALL DEFERRED') }, close }
  } catch (error) { await close(); throw error }
}
