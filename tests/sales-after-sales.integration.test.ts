import 'dotenv/config'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { salesAfterSalesFixture } from './helpers/sales-after-sales-fixture'
import { saveSalesWorkflow } from '../server/utils/sales-workflow'
import { defaultServiceRules, addServiceDate } from '../utils/after-sales'
import { newQuoteLine } from '../utils/erp-quote'
import { saveConfiguration, saveProductServiceLinks, updateCustomerProduct, saveServiceJob, invoiceServiceJob, processServices, registerManualProduct } from '../server/utils/after-sales'
import { deliveredBillServices } from '../server/utils/after-sales-lifecycle'
import { returnOrderServiceUnits } from '../server/utils/after-sales-returns'
import { issueProgramInvoice } from '../server/utils/invoice-programs'
import { writeQuote } from '../server/utils/erp-quotes'
import { convertAcceptedQuote } from '../server/utils/quote-workflow'
import { readQuotePreferences, saveQuotePreferences } from '../server/utils/quote-preferences'
import { saveRecurringInvoice, readRecurringInvoice, generateRecurringOccurrence, recurringAction } from '../server/utils/recurring-invoices'

test('sale → coverage → service → invoice/return combinations on installed PostgreSQL (rollback only)', async t => {
  assert(process.env.DATABASE_URL, 'DATABASE_URL is required; this integration must execute rather than silently skip')
  const f = await salesAfterSalesFixture(), { db, company, actor, today } = f
  const identity=(await db.query('SELECT name FROM companies WHERE id=$1',[company])).rows[0]
  t.diagnostic(`Company: ${identity.name} (${company}); ERP saved=${f.initialAccountingEnabled}; ERP test transaction=${f.accountingEnabled}.`)
  let cases = 0
  async function scenario(name: string, run: () => Promise<void>) {
    if (process.env.SALES_AFTER_SALES_CASE && !new RegExp(process.env.SALES_AFTER_SALES_CASE).test(name)) return
    await t.test(name, async () => {
      await db.query('SAVEPOINT combination_case')
      try { await run(); await f.flush(); cases++ }
      finally { await db.query('ROLLBACK TO SAVEPOINT combination_case'); await db.query('RELEASE SAVEPOINT combination_case') }
    })
  }
  const stock = async (index = 0) => (await db.query('SELECT qty,sold_qty FROM items WHERE id=$1', [f.stock[index].item])).rows[0]
  const all = ['WARRANTY','GUARANTEE','MAINTENANCE']
  try {
    if(process.env.AFTER_SALES_TEST_COMPANY_ID) await scenario('selected company existing product/customer: sale, saved coverage and exact-unit return',async()=>{
      await db.query('UPDATE accountant_v2_erp_settings SET enabled=$2 WHERE company_id=$1',[company,f.initialAccountingEnabled])
      const row=(await db.query(`SELECT p.id AS product_id,p.name,p.category_id,v.id AS variant_id,i.id AS item_id,i.barcode,i.qty,i.sold_qty,v.d_price,
        (SELECT cc.client_id FROM company_clients cc WHERE cc.company_id=p.company_id AND NOT (cc.client_id=ANY($2::text[])) ORDER BY cc.client_id LIMIT 1) AS client_id
        FROM products p JOIN variants v ON v.product_id=p.id AND v.company_id=p.company_id
        JOIN items i ON i.variant_id=v.id AND i.company_id=p.company_id
        WHERE p.company_id=$1 AND NOT(p.id=ANY($3::text[])) AND i.qty>=1 AND v.d_price>0 AND p.category_id IS NOT NULL
        AND EXISTS(SELECT 1 FROM product_service_links l WHERE l.company_id=p.company_id AND l.product_id=p.id)
        ORDER BY p.id,v.id,i.id LIMIT 1`,[company,f.customers,f.stock.map(s=>s.product)])).rows[0]
      assert(row?.client_id,'Selected company must have an existing covered in-stock product and linked customer')
      const configs=(await db.query(`SELECT c.* FROM service_configurations c JOIN product_service_links l ON l.configuration_id=c.id AND l.company_id=c.company_id WHERE l.company_id=$1 AND l.product_id=$2 ORDER BY c.id`,[company,row.product_id])).rows
      const line={name:row.name,qty:1,rate:Number(row.d_price),value:Number(row.d_price),discount:0,tax:0,return:false,barcode:row.barcode,
        item:{connect:{id:row.item_id}},variant:{connect:{id:row.variant_id}},category:{connect:{id:row.category_id}}}
      const result=await f.sale([line],'Cash',row.client_id,[{lineKey:'line-0',unit:0,serialNumber:'ROLLBACK-'+f.run}])
      assert.equal(result.units.length,1);assert.equal(result.units[0].product_id,row.product_id)
      const detail=await f.detail(result.units[0].id)
      assert.deepEqual(detail.agreements.map((a:any)=>a.configuration_id).sort(),configs.map((c:any)=>c.id).sort())
      for(const agreement of detail.agreements) assert.deepEqual(agreement.snapshot.rules,configs.find((c:any)=>c.id===agreement.configuration_id).rules)
      const afterSale=(await db.query('SELECT qty,sold_qty FROM items WHERE id=$1',[row.item_id])).rows[0]
      assert.equal(Number(afterSale.qty),Number(row.qty)-1);assert.equal(Number(afterSale.sold_qty),Number(row.sold_qty)+1)
      const returned=f.saleBody([{...line,return:true}],'Cash',row.client_id);returned.returnedServiceUnitIds=[result.units[0].id]
      await f.call('/api/bill/create',returned)
      assert.equal((await f.detail(result.units[0].id)).product.status,'RETURNED')
      const afterReturn=(await db.query('SELECT qty,sold_qty FROM items WHERE id=$1',[row.item_id])).rows[0]
      assert.equal(Number(afterReturn.qty),Number(row.qty));assert.equal(Number(afterReturn.sold_qty),Number(row.sold_qty))
    })
    for (let mask = 1; mask < 8; mask++) {
      const kinds = all.filter((_, index) => mask & (1 << index))
      for (const tender of ['Cash','invoice']) await scenario(kinds.join('+') + ' / ' + tender + ' / two physical units', async () => {
        await f.coverage(kinds)
        const result = await f.sale([f.line(0, 2)], tender, f.customers[0], [{ lineKey: 'line-0', unit: 0, serialNumber: 'FIRST' }, { lineKey: 'line-0', unit: 1, serialNumber: 'SECOND' }])
        assert.equal(result.units.length, 2)
        assert.deepEqual(result.units.map((u: any) => u.serial_number).sort(), ['FIRST','SECOND'])
        assert(result.units.every((u: any) => u.agreements.length === kinds.length && u.agreements.every((a: any) => a.status === 'ACTIVE')))
        const before = result.units.map((u: any) => u.id).sort()
        await f.call('/api/bill/create', result.body)
        assert.deepEqual((await f.units(result.billId)).map((u: any) => u.id).sort(), before, 'Sale replay preserves units')
        assert.deepEqual(await stock(), { qty: 198, sold_qty: 2 })
        const journals = (await db.query(`SELECT count(*)::int AS count FROM accountant_v2_manual_journal_lines l
          JOIN accountant_v2_erp_sources s ON s.journal_id=l.journal_id WHERE s.company_id=$1 AND s.source_key=$2`, [company, 'bill:' + result.billId])).rows[0]
        if(f.accountingEnabled) assert(journals.count > 0, 'Enabled accounting posts the originating sale')
        else assert.equal(journals.count,0,'Disabled ERP accounting must not post the originating sale')
      })
    }
    for (const tender of ['UPI','Card','Credit','Split']) await scenario('all coverage / ' + tender + ' / replay', async () => {
      await f.coverage(all)
      const result = await f.sale([f.line(0, 2)], tender)
      assert.equal(result.units.length, 2); assert(result.units.every((u: any) => u.agreements.length === 3))
      await f.call('/api/bill/create', result.body)
      assert.equal((await f.units(result.billId)).length, 2); assert.deepEqual(await stock(), { qty: 198, sold_qty: 2 })
    })
    await scenario('duplicate stock rows and variants preserve the exact per-line serials', async () => {
      await f.coverage(all)
      const result = await f.sale([f.line(), f.line(), f.line(1)], 'Cash', f.customers[0], [
        { lineKey:'line-0',unit:0,serialNumber:'ROW-A' }, { lineKey:'line-1',unit:0,serialNumber:'ROW-B' }, { lineKey:'line-2',unit:0,serialNumber:'VARIANT-C' }
      ])
      assert.equal(result.units.length, 3)
      assert.deepEqual(result.units.map((u: any) => u.serial_number).sort(), ['ROW-A','ROW-B','VARIANT-C'])
      assert.equal(new Set(result.units.map((u: any) => u.entry_id)).size, 3)
    })
    await scenario('uncovered sales and disabled after-sales add no unit or client restrictions', async () => {
      const plain = await f.sale([f.line()], 'Cash', null)
      assert.equal(plain.units.length, 0)
      await f.coverage(all); await saveSalesWorkflow(db, company, { includeAfterSales:false })
      const disabled = await f.sale([f.line(0,1.5)], 'Cash', null)
      assert.equal(disabled.units.length, 0)
    })
    await scenario('covered missing-client and fractional sales roll back stock, bill and registrations', async () => {
      await f.coverage(all)
      for (const body of [f.saleBody([f.line()], 'Cash', null), f.saleBody([f.line(0,1.5)])]) {
        await assert.rejects(f.call('/api/bill/create',body), { statusCode:400 })
        assert.equal((await db.query('SELECT id FROM bills WHERE id=$1',[body.uuid])).rowCount,0)
        assert.equal((await f.units(body.uuid)).length,0); assert.deepEqual(await stock(),{qty:200,sold_qty:0})
      }
    })
    await scenario('sale / installation / delivery / explicit-date activation preserve the correct anchors', async () => {
      const configurations: any[]=[]
      for(const activation of ['SALE','INSTALLATION','DELIVERY','DATE']) configurations.push(await saveConfiguration(db,company,actor,{kind:'WARRANTY',name:activation+' '+f.run,
        rules:{...defaultServiceRules(),activation,startDate:today}}))
      await saveProductServiceLinks(db,company,f.stock[0].product,configurations.map(c=>c.id))
      const result=await f.sale(),unit=result.units[0]
      let detail=await f.detail(unit.id)
      assert.equal(detail.agreements.filter((a:any)=>a.status==='ACTIVE').length,2)
      assert.equal(detail.agreements.filter((a:any)=>a.status==='PENDING').length,2)
      await updateCustomerProduct(db,company,actor,{id:unit.id,action:'DATES',installedOn:today,deliveredOn:today,reason:'Recorded activation'})
      detail=await f.detail(unit.id);assert(detail.agreements.every((a:any)=>a.status==='ACTIVE'&&a.starts_on===today))
    })
    await scenario('ordinary invoice edits preserve unit references and service history', async () => {
      await f.coverage(all);const result=await f.sale(),unit=result.units[0]
      const agreement=(await f.detail(unit.id)).agreements.find((a:any)=>a.kind==='MAINTENANCE')
      await saveServiceJob(db,company,actor,{agreementId:agreement.id,requestKey:f.id(),status:'COMPLETED',details:{values:{meter:10},charges:[]}})
      await f.edit(result.billId,{billData:{notes:'Correct invoice note'}})
      const after=await f.units(result.billId);assert.equal(after.length,1);assert.equal(after[0].id,unit.id);assert.equal(after[0].reference,unit.reference)
      assert.equal((await f.detail(unit.id)).jobs.length,1)
    })
    await scenario('quantity increases add only new units; explicit reductions retire only selected units', async () => {
      await f.coverage(all);const result=await f.sale()
      const e=(await db.query('SELECT * FROM entries WHERE bill_id=$1',[result.billId])).rows[0]
      const item={entryId:e.id,id:e.item_id,variantId:e.variant_id,name:e.name,qty:2,rate:100,value:200,tax:0,category:[{id:f.category}],serviceLineKey:'edit-line'}
      await f.edit(result.billId,{items:[item],billData:{subtotal:200,grandTotal:200},serviceUnits:[{lineKey:'edit-line',unit:1,serialNumber:'ADDED'}]})
      let units=await f.units(result.billId);assert.equal(units.length,2);assert(units.some((u:any)=>u.serial_number==='ADDED'))
      await assert.rejects(f.edit(result.billId,{items:[{...item,qty:1,value:100}],billData:{subtotal:100,grandTotal:100}}))
      await f.edit(result.billId,{items:[{...item,qty:1,value:100}],billData:{subtotal:100,grandTotal:100},removedServiceUnitIds:[result.units[0].id]})
      units=await f.units(result.billId)
      assert.equal(units.length,2,'Reduction retains cancelled history instead of issuing another physical unit')
      assert.equal(units.filter((u:any)=>u.status==='ACTIVE').length,1)
      assert.equal(units.find((u:any)=>u.id===result.units[0].id).status,'CANCELLED')
    })
    await scenario('invoice customer reassignment cannot move existing service agreements', async () => {
      await f.coverage(all);const result=await f.sale()
      await assert.rejects(f.edit(result.billId,{billData:{clientId:f.customers[1]}}))
      assert.equal((await f.units(result.billId))[0].client_id,f.customers[0])
    })
    await scenario('changing a registered entry to another product requires explicit unit removal', async () => {
      await f.coverage(all);await f.coverage(['WARRANTY'],2)
      const result=await f.sale(),e=(await db.query('SELECT id FROM entries WHERE bill_id=$1',[result.billId])).rows[0]
      const changed={entryId:e.id,id:f.stock[2].item,variantId:f.stock[2].variant,name:f.stock[2].name,qty:1,rate:100,value:100,tax:0,category:[{id:f.category}]}
      await assert.rejects(f.edit(result.billId,{items:[changed]}))
      assert.deepEqual(await stock(2),{qty:200,sold_qty:0},'Rejected product swap rolls stock back')
      await f.edit(result.billId,{items:[changed],removedServiceUnitIds:[result.units[0].id]})
      const units=await f.units(result.billId),active=units.filter((u:any)=>u.status==='ACTIVE')
      assert.equal(active.length,1);assert.equal(active[0].product_id,f.stock[2].product);assert.equal(active[0].agreements.length,1)
    })
    await scenario('explicit unit removal permits a customer correction without moving old history',async()=>{
      await f.coverage(all);const result=await f.sale(),old=result.units[0]
      await f.edit(result.billId,{billData:{clientId:f.customers[1]},removedServiceUnitIds:[old.id]})
      const units=await f.units(result.billId)
      assert.equal(units.length,2);assert.equal(units.find((u:any)=>u.id===old.id).status,'CANCELLED')
      assert.equal(units.find((u:any)=>u.status==='ACTIVE').client_id,f.customers[1])
    })
    await scenario('product correction after a carried replacement requires explicit removal of its original unit',async()=>{
      await f.coverage(all);await f.coverage(['WARRANTY'],2)
      const result=await f.sale(),original=result.units[0]
      const replacement=await registerManualProduct(db,company,actor,{clientId:f.customers[0],name:'Carried replacement',purchasedOn:today,evidence:'Replacement',requestKey:f.id(),configurationIds:[f.configs.WARRANTY.id]})
      await updateCustomerProduct(db,company,actor,{id:original.id,action:'REPLACE',replacementId:replacement.id,reason:'Carry original obligations'})
      const entry=(await db.query('SELECT id FROM entries WHERE bill_id=$1',[result.billId])).rows[0]
      const changed={entryId:entry.id,id:f.stock[2].item,variantId:f.stock[2].variant,name:f.stock[2].name,qty:1,rate:100,value:100,tax:0,category:[{id:f.category}]}
      await assert.rejects(f.edit(result.billId,{items:[changed]}))
      await f.edit(result.billId,{items:[changed],removedServiceUnitIds:[original.id]})
      assert((await f.detail(replacement.id)).agreements.every((a:any)=>a.status==='CANCELLED'))
      assert.equal((await f.units(result.billId)).filter((u:any)=>u.status==='ACTIVE').length,1)
    })
    await scenario('completed sales return ends exact units and a later invoice edit cannot resurrect them', async () => {
      await f.coverage(all);const result=await f.sale([f.line(0,2)])
      const returnBody=f.saleBody([f.line(0,1,true)]);returnBody.returnedServiceUnitIds=[result.units[0].id]
      await f.call('/api/bill/create',returnBody)
      assert.equal((await f.detail(result.units[0].id)).product.status,'RETURNED')
      await assert.rejects(f.edit(result.billId,{removedServiceUnitIds:[result.units[0].id]}),{statusCode:400})
      await f.edit(result.billId,{billData:{notes:'Updated original invoice after return'}})
      const units=await f.units(result.billId)
      assert.equal(units.length,2,'Editing the source must not create replacement units for completed returns')
      assert.equal(units.filter((u:any)=>u.status==='ACTIVE').length,1)
      assert.deepEqual(await stock(),{qty:199,sold_qty:1})
    })
    await scenario('return documents reject missing, foreign-customer, duplicate and previously returned unit selections', async () => {
      await f.coverage(all);const first=await f.sale(),other=await f.sale([f.line()],'Cash',f.customers[1])
      for(const ids of [[],[other.units[0].id]]) {
        const body=f.saleBody([f.line(0,1,true)]);body.returnedServiceUnitIds=ids
        await assert.rejects(f.call('/api/bill/create',body),{statusCode:400})
      }
      const body=f.saleBody([f.line(0,1,true)]);body.returnedServiceUnitIds=[first.units[0].id]
      await f.call('/api/bill/create',body);await f.call('/api/bill/create',body)
      const twice=f.saleBody([f.line(0,1,true)]);twice.returnedServiceUnitIds=[first.units[0].id]
      await assert.rejects(f.call('/api/bill/create',twice),{statusCode:400})
      assert.deepEqual(await stock(),{qty:199,sold_qty:1})
    })
    for(const path of ['/api/billSale/deleteBill','/api/billEdit/deleteBill']) await scenario(path+' ends all obligations and restores original stock',async()=>{
      await f.coverage(all);const result=await f.sale(),a=(await f.detail(result.units[0].id)).agreements.find((a:any)=>a.kind==='MAINTENANCE')
      await saveServiceJob(db,company,actor,{agreementId:a.id,requestKey:f.id(),status:'SCHEDULED'})
      await f.call(path,{billId:result.billId,companyId:company})
      const detail=await f.detail(result.units[0].id)
      assert.equal(detail.product.status,'CANCELLED');assert(detail.agreements.every((a:any)=>a.status==='CANCELLED'));assert.equal(detail.jobs[0].status,'CANCELLED')
      assert.deepEqual(await stock(),{qty:200,sold_qty:0})
    })
    await scenario('source deletion follows carried replacement coverage and ends its remaining obligations',async()=>{
      await f.coverage(all);const result=await f.sale(),replacement=await registerManualProduct(db,company,actor,{clientId:f.customers[0],name:'Replacement',purchasedOn:today,evidence:'Exchange',requestKey:f.id(),configurationIds:[f.configs.WARRANTY.id]})
      await updateCustomerProduct(db,company,actor,{id:result.units[0].id,action:'REPLACE',replacementId:replacement.id,reason:'Carry original coverage'})
      await f.call('/api/billSale/deleteBill',{billId:result.billId,companyId:company})
      const detail=await f.detail(replacement.id)
      assert(detail.agreements.every((a:any)=>a.status==='CANCELLED'),'Deleting the originating sale must end its carried agreements')
    })
    await scenario('delete → restore → edit cannot silently issue fresh coverage for the same physical sale',async()=>{
      await f.coverage(all);const result=await f.sale(),old=result.units[0]
      await f.call('/api/billSale/deleteBill',{billId:result.billId,companyId:company})
      await f.call('/api/billSale/restoreBill',{billId:result.billId,companyId:company})
      await f.edit(result.billId,{billData:{notes:'Restored source note'}})
      const units=await f.units(result.billId)
      assert.equal(units.length,1);assert.equal(units[0].id,old.id);assert.equal(units[0].status,'CANCELLED')
      assert.deepEqual(await stock(),{qty:199,sold_qty:1})
    })
    await scenario('source cancellation stops at an explicitly restarted replacement',async()=>{
      await f.coverage(all);const result=await f.sale(),replacement=await registerManualProduct(db,company,actor,{clientId:f.customers[0],name:'Independent replacement',purchasedOn:today,evidence:'Explicit restart',requestKey:f.id(),configurationIds:[f.configs.WARRANTY.id]})
      await updateCustomerProduct(db,company,actor,{id:result.units[0].id,action:'REPLACE',replacementId:replacement.id,restart:true,reason:'Independent replacement terms'})
      await f.call('/api/billSale/deleteBill',{billId:result.billId,companyId:company})
      assert.equal((await f.detail(replacement.id)).agreements[0].status,'ACTIVE')
    })
    for(const kind of all) await scenario('sold unit / '+kind+' / completion → explicit paid invoice with stock parts',async()=>{
      await f.coverage([kind]);const result=await f.sale(),a=(await f.detail(result.units[0].id)).agreements[0]
      const parts=[{...newQuoteLine(f.id()),name:'Repair part',variantId:f.stock[2].variant,barcode:f.stock[2].barcode,rate:50}]
      const job=await saveServiceJob(db,company,actor,{agreementId:a.id,requestKey:f.id(),status:kind==='MAINTENANCE'?'COMPLETED':'RESOLVED',
        details:{complaint:'Defect',resolution:'Repaired',values:{meter:11},charges:[{...newQuoteLine(f.id()),name:'Labour',rate:118,tax:18}],parts}})
      assert.deepEqual(await stock(2),{qty:200,sold_qty:0})
      const invoice=await invoiceServiceJob(db,company,actor,{id:job.id});assert.equal((await invoiceServiceJob(db,company,actor,{id:job.id})).billId,invoice.billId)
      assert.deepEqual(await stock(2),{qty:199,sold_qty:1})
      const bill=(await db.query('SELECT grand_total,payment_status FROM bills WHERE id=$1',[invoice.billId])).rows[0]
      assert.equal(Number(bill.grand_total),168);assert.equal(bill.payment_status,'PENDING')
    })
    await scenario('seller ecommerce sale waits for delivery; delivery is idempotent; physical return selects exact units',async()=>{
      await f.coverage(all)
      const result=await f.call('/api/ecommerce-cms/orders/create',{client:{id:f.customers[0]},address:{houseDetails:'1',street:'Fixture',city:'Kochi',state:'Kerala',pincode:'682001'},items:[{itemId:f.stock[0].item,quantity:2}],paymentMethod:'COD'})
      let units=await f.units(result.billId);assert.equal(units.length,2);assert(units.every((u:any)=>u.agreements.every((a:any)=>a.status==='PENDING')))
      await f.call('/api/ecommerce-cms/orders/status',{orderId:result.orderId,status:'DELIVERED',note:'Hand delivered'})
      await deliveredBillServices(db,company,result.orderId,addServiceDate(today,2,'DAY'))
      units=await f.units(result.billId);assert(units.every((u:any)=>u.delivered_on===today&&u.agreements.every((a:any)=>a.status==='ACTIVE')))
      await returnOrderServiceUnits(db,company,result.orderId,[{entryId:units[0].entry_id,qty:1}],[units[0].id],actor)
      assert.equal((await f.detail(units[0].id)).product.status,'RETURNED');assert.equal((await f.detail(units[1].id)).product.status,'ACTIVE')
    })
    await scenario('seller ecommerce cancellation cancels coverage and reverses stock',async()=>{
      await f.coverage(all)
      const result=await f.call('/api/ecommerce-cms/orders/create',{client:{id:f.customers[0]},address:{houseDetails:'1',street:'Fixture',city:'Kochi',state:'Kerala',pincode:'682001'},items:[{itemId:f.stock[0].item,quantity:1}],paymentMethod:'COD'})
      await f.call('/api/ecommerce-cms/orders/status',{orderId:result.orderId,status:'CANCELLED'})
      assert((await f.units(result.billId)).every((u:any)=>u.status==='CANCELLED'&&u.agreements.every((a:any)=>a.status==='CANCELLED')))
      assert.deepEqual(await stock(),{qty:200,sold_qty:0})
    })
    await scenario('shared invoice writer registers covered physical products from program invoices',async()=>{
      await f.coverage(all)
      const invoice=await issueProgramInvoice(db,company,actor,{clientId:f.customers[0],discount:0,discountType:'amount',adjustment:0,items:[{...newQuoteLine(f.id()),name:'Program sale',variantId:f.stock[0].variant,barcode:f.stock[0].barcode,quantity:2,rate:100}]},today,today)
      assert.equal((await f.units(invoice.billId)).length,2)
    })
    if(!f.initialAccountingEnabled) await scenario('disabled ERP accounting blocks invoices and unposted credit collection without altering coverage or recording payment',async()=>{
      await db.query('UPDATE accountant_v2_erp_settings SET enabled=false WHERE company_id=$1',[company])
      await f.coverage(all)
      const invoice=f.saleBody([f.line(0,2)],'invoice')
      await assert.rejects(f.call('/api/bill/create',invoice),/Enable ERP Accounting/)
      assert.equal((await db.query('SELECT id FROM bills WHERE id=$1',[invoice.uuid])).rowCount,0)
      const result=await f.sale([f.line(0,2)],'Credit')
      const account=(await db.query("SELECT accounts->>'cash' AS id FROM accountant_v2_erp_settings WHERE company_id=$1",[company])).rows[0].id
      await assert.rejects(f.call('/api/billSale/receipts',{billId:result.billId,amount:50,paymentMethod:'Cash',paymentDate:today,accountId:account,requestId:f.id()}),/Review and post this bill/)
      assert.equal((await db.query('SELECT id FROM payments WHERE bill_id=$1',[result.billId])).rowCount,0)
      assert.equal((await f.units(result.billId)).length,2);assert.deepEqual(await stock(),{qty:198,sold_qty:2})
    })
    await scenario('partial/full credit receipts and reversal retain the same units and coverage dates',async()=>{
      // Cover collection with the existing mapped accounts, without persisting opt-in.
      if(!f.accountingEnabled) await db.query('UPDATE accountant_v2_erp_settings SET enabled=true WHERE company_id=$1',[company])
      await f.coverage(all);const result=await f.sale([f.line(0,2)],'invoice')
      const account=(await db.query("SELECT accounts->>'cash' AS id FROM accountant_v2_erp_settings WHERE company_id=$1",[company])).rows[0].id
      const before=JSON.stringify((await f.units(result.billId)).map((u:any)=>({id:u.id,agreements:u.agreements})))
      const input={billId:result.billId,amount:50,paymentMethod:'Cash',paymentDate:today,accountId:account,requestId:f.id()}
      const first=await f.call('/api/billSale/receipts',input);assert.equal(first.outstanding,150)
      assert.equal((await f.call('/api/billSale/receipts',input)).receiptId,first.receiptId)
      const last=await f.call('/api/billSale/receipts',{...input,amount:150,requestId:f.id()});assert.equal(last.paymentStatus,'PAID')
      await f.call('/api/billSale/reverseReceipt',{billId:result.billId,receiptId:last.receiptId,paymentDate:today,requestId:f.id()})
      assert.equal(JSON.stringify((await f.units(result.billId)).map((u:any)=>({id:u.id,agreements:u.agreements}))),before)
      assert.deepEqual(await stock(),{qty:198,sold_qty:2})
    })
    await scenario('accepted quote creates no units until issued; conversion registers coverage exactly once',async()=>{
      await f.coverage(all)
      await saveQuotePreferences(db,company,{...await readQuotePreferences(db,company),conversion:'none'})
      const input={requestId:f.id(),clientId:f.customers[0],quoteDate:today,status:'ACCEPTED',items:[{...newQuoteLine(f.id()),name:'Quoted unit',variantId:f.stock[0].variant,barcode:f.stock[0].barcode,rate:100}],discount:0,discountType:'amount',adjustment:0}
      const quote=await writeQuote(db,{companyId:company,userId:actor},input)
      assert(!quote.workflow.invoiceId);assert.deepEqual(await stock(),{qty:200,sold_qty:0})
      const issued=await convertAcceptedQuote(db,company,quote.id!,actor,true)
      assert(issued.invoiceId,issued.conversionError)
      assert.equal((await f.units(issued.invoiceId)).length,1)
      assert.equal((await convertAcceptedQuote(db,company,quote.id!,actor,true)).invoiceId,issued.invoiceId)
      assert.deepEqual(await stock(),{qty:199,sold_qty:1})
    })
    await scenario('recurring draft creates no coverage; issuing the frozen occurrence registers once',async()=>{
      await f.coverage(all)
      const profile=await saveRecurringInvoice(db,{companyId:company,userId:actor},{requestId:f.id(),name:'Covered recurring '+f.run,startDate:today,
        frequency:'MONTH',interval:1,dueDays:0,generationMode:'DRAFT',template:{clientId:f.customers[0],items:[{...newQuoteLine(f.id()),name:'Recurring unit',variantId:f.stock[0].variant,barcode:f.stock[0].barcode,rate:100}],discount:0,discountType:'amount',adjustment:0}})
      const row=await readRecurringInvoice(db,company,profile.id)
      const generated=await generateRecurringOccurrence(db,row,today,'DRAFT')
      assert(generated.created);assert.deepEqual(await stock(),{qty:200,sold_qty:0})
      await recurringAction(db,{companyId:company,userId:actor},profile.id,{action:'issue',occurrenceId:generated.id,requestId:f.id()})
      let detail=await readRecurringInvoice(db,company,profile.id),billId=detail.occurrences[0].billId
      assert(billId);assert.equal((await f.units(billId)).length,1)
      await recurringAction(db,{companyId:company,userId:actor},profile.id,{action:'issue',occurrenceId:generated.id,requestId:f.id()})
      detail=await readRecurringInvoice(db,company,profile.id);assert.equal(detail.occurrences[0].billId,billId)
      assert.deepEqual(await stock(),{qty:199,sold_qty:1})
    })
    if(process.env.SALES_AFTER_SALES_BROWSER==='1') await scenario('browser: billing serials → sale → maintenance/claim invoices → exact-unit return → source edit',async()=>{
      await f.coverage(all)
      const saleBody=f.saleBody([f.line(0,2)]),returnBody=f.saleBody([f.line(0,1,true)])
      const replacement=await registerManualProduct(db,company,actor,{clientId:f.customers[0],name:'Browser replacement',purchasedOn:today,evidence:'Exchange',requestKey:f.id(),configurationIds:[f.configs.WARRANTY.id]})
      const {runAfterSalesBrowser}=await import('./after-sales-browser-bridge')
      await runAfterSalesBrowser({company,customer:f.customers[0],itemId:f.stock[0].item,saleBody,returnBody,replacementId:replacement.id},async(path,method,body,query)=>{
        if(path==='/api/fixture/edit-original')return f.edit(saleBody.uuid,{billData:{notes:'Browser edit after return'}})
        if(path==='/api/fixture/remove-replaced'){
          const entry=(await db.query('SELECT * FROM entries WHERE bill_id=$1',[saleBody.uuid])).rows[0]
          return f.edit(saleBody.uuid,{removedServiceUnitIds:body.ids,items:[{entryId:entry.id,id:entry.item_id,variantId:entry.variant_id,name:entry.name,qty:1,rate:100,value:100,tax:0,category:[{id:f.category}]}],billData:{subtotal:100,grandTotal:100}})
        }
        if(path==='/api/fixture/verify'){
          const units=await f.units(saleBody.uuid),s=await stock()
          return {active:units.filter((u:any)=>u.status==='ACTIVE').length,returned:units.filter((u:any)=>u.status==='RETURNED').length,total:units.length,qty:s.qty,sold:s.sold_qty,units}
        }
        return f.call(path+query,body,method)
      },'sales-after-sales-browser.html')
    })
    t.diagnostic(`${cases} source-to-service combinations passed; every case and the outer fixture roll back.`)
  } finally { await f.close() }
})
