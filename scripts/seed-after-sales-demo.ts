import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { Pool } from 'pg'
import { prisma } from '../server/prisma'
import { runAccountant, context } from '../server/utils/accountant/context'
import { enableErpAccounting } from '../server/utils/accountant/erp'
import { prismaSqlClient } from '../server/utils/prisma-sql-client'
import { saveSalesWorkflow } from '../server/utils/sales-workflow'
import { createBillSource } from '../server/utils/create-bill-source'
import { recordBillReceipt, reverseBillReceipt } from '../server/utils/bill-receipts'
import { saveConfiguration, saveProductServiceLinks, saveServiceJob, invoiceServiceJob, updateCustomerProduct, registerManualProduct, serviceProductDetail, serviceProductList } from '../server/utils/after-sales'
import { saveServiceCharge } from '../server/utils/after-sales-catalog'
import { createEcommOrder } from '../server/utils/ecomm-order-create'
import { serviceToday, defaultServiceRules, addServiceDate } from '../utils/after-sales'
import { newQuoteLine } from '../utils/erp-quote'

// Persistent sample data. Use only with explicit authorization to keep demo records.
// No schema installation, historical posting, external payment or messaging calls.
const argument=(name:string)=>{const index=process.argv.indexOf(name);return index<0?'':process.argv[index+1]||''}
if(process.argv.includes('--help')){
  console.log('tsx --tsconfig tests/tsconfig.after-sales.json scripts/seed-after-sales-demo.ts --company-id <id> --company-name <exact name> --output-dir <directory>')
  process.exit(0)
}
const companyId=argument('--company-id'),companyName=argument('--company-name'),output=path.resolve(argument('--output-dir')||'../artifacts/after-sales-audit/persistent-demo')
assert(companyId&&companyName,'Explicit company ID and exact company name are required')
const prefix='DEMO-AS',batchId=randomUUID(),today=serviceToday(),id=()=>randomUUID()
const privateFolder=path.resolve('.cache/after-sales',`persistent-demo-${batchId}`)
mkdirSync(privateFolder,{recursive:true});mkdirSync(output,{recursive:true})
const backupFile=path.join(privateFolder,'before.json'),manifestFile=path.join(output,'Demo-Records.json')
let ownsManifest=false,committed=false
const originals:any={settings:{},protected:{}}
const result:any={batchId,companyId,companyName,prefix,date:today,status:'PREPARED',backupFile,originalBackupFile:argument('--original-backup')?path.resolve(argument('--original-backup')):backupFile,products:[],customers:[],plans:[],bills:[],units:[],jobs:[],receipts:[],orders:[],checks:{}}
const protectedTables=['bills','entries','items','products','variants','customer_products','customer_service_agreements','service_jobs','service_configurations','product_service_links','payments','ecomm_orders']
const saveManifest=()=>writeFileSync(manifestFile,JSON.stringify(result,null,2))
const demoPool=new Pool({connectionString:process.env.DATABASE_URL,max:1})
let db:any
try{
  const company=await prisma.company.findUnique({where:{id:companyId},select:{id:true,name:true,status:true}})
  assert(company?.status&&company.name===companyName,'Exact active company identity must match before any data change')
  const staff=await prisma.$queryRawUnsafe<any[]>(`SELECT cu.user_id,cu.role FROM company_users cu JOIN users u ON u.id=cu.user_id
    WHERE cu.company_id=$1 AND cu.status AND NOT cu.deleted AND NOT u.cleanup ORDER BY (cu.role='admin') DESC,cu.user_id LIMIT 1`,companyId)
  assert(staff.length,'An active company staff member is required')
  const actor=staff[0].user_id
  db=await demoPool.connect()
  const begin=async()=>{
    await db.query('BEGIN')
    await db.query("SET LOCAL lock_timeout='10s'")
    await db.query("SET LOCAL statement_timeout='30s'")
    await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[companyId])
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['accountant-v2:'+companyId])
  }
  // HTTP source saves commit separately. Flush deferred posting constraints at
  // the same boundaries while keeping this sample batch atomic.
  const flush=async()=>{await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED')}
  await begin()
    assert(!(await db.query('SELECT id FROM products WHERE company_id=$1 AND name LIKE $2 LIMIT 1',[companyId,prefix+'%'])).rowCount,'Demo records already exist; inspect the saved manifest instead of creating duplicates')
    assert(!existsSync(manifestFile),'Output manifest already exists; choose a fresh output directory')
    for(const table of ['accountant_v2_erp_settings','accountant_v2_accounting_accounts','accountant_v2_stock_control','general_preferences','categories','customer_product_numbering']) originals.settings[table]=(await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE company_id=$1`,[companyId])).rows.map((r:any)=>r.row)
    for(const table of protectedTables) originals.protected[table]=(await db.query(`SELECT id,md5(to_jsonb(t)::text) AS hash FROM ${table} t WHERE company_id=$1 ORDER BY id`,[companyId])).rows
    writeFileSync(backupFile,JSON.stringify({at:new Date().toISOString(),companyId,companyName,batchId,...originals},null,2))
    ownsManifest=true
    saveManifest()
    console.log('Backed up existing settings and record fingerprints before persistent writes')
    await db.query('COMMIT')
    // Accounting settings use their native Prisma request transaction; source
    // workflows use pg, just as their production HTTP handlers do.
    const enabled=await runAccountant({companyId,userId:actor,role:staff[0].role},async()=>{
      const enabled=await enableErpAccounting()
      await saveSalesWorkflow(prismaSqlClient(context().db),companyId,{includeInvoicing:true,includeAfterSales:true})
      return enabled
    },{lockCompany:true,transactionTimeoutMs:60000})
    result.settingsCommitted=true;saveManifest()
    await begin()
    assert(enabled.enabled,'ERP accounting must be enabled for inspectable invoice examples')
    await db.query(`SELECT set_config('app.status_source','after-sales.demo',true),set_config('app.status_actor',$1,true)`,['user:'+actor])
    const category=id()
    await db.query("INSERT INTO categories(id,company_id,name,tax_type,fixed_tax,updated_at) VALUES($1,$2,$3,'FIXED',0,now())",[category,companyId,prefix+' - Appliances'])
    for(const [index,name] of ['Cash Client','Invoice Client','Order Client'].entries()){
      const customer=id(),display=prefix+' - '+name
      await db.query('INSERT INTO clients(id,name,phone) VALUES($1,$2,$3)',[customer,display,prefix+'-'+batchId.slice(0,8)+'-'+index])
      await db.query('INSERT INTO company_clients(company_id,client_id) VALUES($1,$2)',[companyId,customer])
      result.customers.push({id:customer,name:display})
    }
    const configs:any={}
    for(const [kind,name,rules] of [
      ['WARRANTY','Warranty - 12 months',{duration:12}],
      ['GUARANTEE','Guarantee - 6 months',{duration:6}],
      ['MAINTENANCE','Maintenance - one free visit',{schedule:'CUSTOM',dates:[today,addServiceDate(today,1,'MONTH'),addServiceDate(today,3,'MONTH')],freeVisits:1,charge:118,tax:18,reminderDays:[0],checklist:['Inspect equipment','Clean filters','Record meter'],fields:[{key:'meter',label:'Meter',type:'NUMBER',unit:'hours',required:true}]}],
    ] as any[]){
      const saved=await saveConfiguration(db,companyId,actor,{kind,name:prefix+' - '+name,rules:{...defaultServiceRules(),provider:'Demo service team',coverage:'DEMO: sample coverage for workflow review',instructions:'DEMO record. Review and edit through the after-sales screens.',...rules}})
      configs[kind]=saved.id;result.plans.push({id:saved.id,name:prefix+' - '+name,kind})
    }
    const installation=await saveConfiguration(db,companyId,actor,{kind:'WARRANTY',name:prefix+' - Installation warranty',rules:{...defaultServiceRules(),activation:'INSTALLATION',provider:'Demo service team',coverage:'DEMO warranty starts after installation is recorded'}})
    result.plans.push({id:installation.id,name:prefix+' - Installation warranty',kind:'WARRANTY'})
    const catalog=[
      {name:'Warranty Appliance',kinds:['WARRANTY'],price:1200,qty:2,tender:'Cash',client:0},
      {name:'Guarantee Kettle',kinds:['GUARANTEE'],price:800,qty:1,tender:'UPI',client:0},
      {name:'Maintenance Purifier',kinds:['MAINTENANCE'],price:2000,qty:2,tender:'invoice',client:1},
      {name:'Warranty + Guarantee Fridge',kinds:['WARRANTY','GUARANTEE'],price:3000,qty:2,tender:'Card',client:0},
      {name:'Warranty + Maintenance Washer',kinds:['WARRANTY','MAINTENANCE'],price:2500,qty:2,tender:'Cash',client:0},
      {name:'Guarantee + Maintenance Heater',kinds:['GUARANTEE','MAINTENANCE'],price:1600,qty:1,tender:'Split',client:1},
      {name:'Complete Cover Air Conditioner',kinds:['WARRANTY','GUARANTEE','MAINTENANCE'],price:5000,qty:4,tender:'invoice',client:1},
      {name:'Service Filter Part',kinds:[],price:150,qty:0,tender:'Cash',client:0},
    ]
    for(const [index,spec] of catalog.entries()){
      const product=id(),variant=id(),item=id(),name=prefix+' - '+spec.name,initialQty=index===7?30:20
      await db.query(`INSERT INTO products(id,company_id,name,description,is_service_product,category_id,updated_at) VALUES($1,$2,$3,$4,$5,$6,now())`,[product,companyId,name,'DEMO product for reviewing sales and after-sales.',index===7,category])
      await db.query(`INSERT INTO variants(id,company_id,product_id,name,code,unit,s_price,d_price,p_price,discount,tax,images,updated_at) VALUES($1,$2,$3,'Standard',$4,'Nos',$5,$5,0,0,0,'{}',now())`,[variant,companyId,product,prefix+'-'+String(index+1).padStart(2,'0'),spec.price])
      const stock=(await db.query('INSERT INTO items(id,company_id,variant_id,qty,initial_qty,sold_qty,updated_at) VALUES($1,$2,$3,$4,$4,0,now()) RETURNING barcode',[item,companyId,variant,initialQty])).rows[0]
      await saveProductServiceLinks(db,companyId,product,spec.kinds.map(kind=>configs[kind]))
      result.products.push({id:product,variantId:variant,itemId:item,barcode:stock.barcode,name,price:spec.price,initialQty,coverage:spec.kinds})
    }
    const charge=await saveServiceCharge(db,companyId,actor,{name:prefix+' - Repair labour',description:'Demo repair labour, before tax',rate:100,tax:18,unit:'Service'})
    result.serviceCharge={id:charge.id,name:prefix+' - Repair labour'}
    function entry(product:any,qty:number,returned=false){return {name:product.name,qty,rate:product.price,value:qty*product.price,discount:0,tax:0,return:returned,barcode:product.barcode,item:{connect:{id:product.itemId}},variant:{connect:{id:product.variantId}},category:{connect:{id:category}}}}
    async function sale(index:number,qty:number,tender:string,customerIndex:number,label:string,returnedIds:string[]=[]){
      const product=result.products[index],returned=returnedIds.length>0,total=qty*product.price*(returned?-1:1),billId=id(),clientId=result.customers[customerIndex].id
      const body={uuid:billId,companyId,userId:actor,billPoints:0,items:[{id:product.itemId,qty,serviceLineKey:'demo-line'}],returnedServiceUnitIds:returnedIds,
        serviceUnits:returned?[]:Array.from({length:qty},(_,unit)=>({lineKey:'demo-line',unit,serialNumber:`BN-DEMO-${index+1}-${unit+1}`})),
        payload:{subtotal:total,grandTotal:total,returnAmt:returned?-total:0,discount:0,discountType:'percentage',paymentMethod:tender==='invoice'?'Credit':tender,paymentStatus:['invoice','Credit','Split'].includes(tender)?'PENDING':'PAID',type:'BILL',createdAt:today+'T10:00:00+05:30',
          notes:prefix+' | '+label+' | Sample records; no external payment was collected.',company:{connect:{id:companyId}},client:{connect:{id:clientId}},companyUser:{connect:{companyId_userId:{companyId,userId:actor}}},entries:{create:[entry(product,qty,returned)]},
          ...(tender==='invoice'?{billingMode:'invoice',dueDate:addServiceDate(today,14,'DAY'),invoicePaymentTerms:'Demo - due in 14 days'}:{}),
          ...(tender==='Split'?{splitPayments:[{method:'Cash',amount:total/2},{method:'Credit',amount:total/2}]}:{})}}
      const saved=await createBillSource(db,body)
      await flush()
      const units=await serviceProductList(db,companyId,{billId:saved.billId})
      result.bills.push({id:saved.billId,invoiceNumber:saved.invoiceNumber,label,tender,customerId:clientId,total})
      for(const unit of units)result.units.push({id:unit.id,reference:unit.reference,serial:unit.serial_number,label,sourceBillId:saved.billId})
      return {billId:saved.billId,units}
    }
    const sales:any[]=[]
    for(const [index,spec] of catalog.slice(0,7).entries()){
      sales.push(await sale(index,spec.qty,spec.tender,spec.client,spec.name))
      console.log('Created demo sale: '+spec.name)
    }
    async function agreement(unitId:string,kind:string){return (await serviceProductDetail(db,companyId,unitId)).agreements.find((a:any)=>a.kind===kind&&a.status!=='CANCELLED')}
    async function occurrence(a:any){const row=(await db.query(`INSERT INTO maintenance_occurrences(id,company_id,agreement_id,due_on,snapshot) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(agreement_id,due_on) DO NOTHING RETURNING id`,[id(),companyId,a.id,today,JSON.stringify(a.snapshot)])).rows[0];return row?.id}
    async function job(label:string,input:any,invoice=false){
      const saved=await saveServiceJob(db,companyId,actor,{requestKey:id(),assignedTo:actor,...input})
      result.jobs.push({id:saved.id,label,status:input.status})
      if(invoice){const issued=await invoiceServiceJob(db,companyId,actor,{id:saved.id});await flush();result.bills.push({id:issued.billId,label,tender:'Service invoice'});result.jobs.at(-1).billId=issued.billId;return issued}
      return saved
    }
    const maintenance=await agreement(sales[2].units[0].id,'MAINTENANCE')
    await job('Free maintenance - completed, zero invoice',{agreementId:maintenance.id,occurrenceId:await occurrence(maintenance),status:'COMPLETED',details:{notes:prefix+' - included free service',values:{meter:100},charges:[]}},true)
    const labour={...newQuoteLine(id()),name:prefix+' - Repair labour',unit:'Service',rate:118,tax:18}
    const part={...newQuoteLine(id()),name:result.products[7].name,variantId:result.products[7].variantId,barcode:result.products[7].barcode,unit:'Nos',rate:150}
    await job('Paid maintenance - labour and filter part',{agreementId:maintenance.id,status:'COMPLETED',details:{notes:prefix+' - paid follow-up with replacement filter',values:{meter:125},charges:[labour],parts:[part]}},true)
    const warranty=await agreement(sales[6].units[0].id,'WARRANTY')
    await job('Warranty claim - resolved, labour invoice',{agreementId:warranty.id,status:'RESOLVED',details:{complaint:prefix+' - sample cooling complaint',assessment:'Demo inspection completed',resolution:'Demo repair completed',notes:prefix+' - resolved warranty example',charges:[{...labour,id:id(),rate:236}]}},true)
    await job('Guarantee claim - open for you to review',{agreementId:(await agreement(sales[1].units[0].id,'GUARANTEE')).id,status:'OPEN',details:{complaint:prefix+' - sample guarantee claim awaiting review',notes:prefix+' - open example'}})
    const scheduled=await agreement(sales[4].units[0].id,'MAINTENANCE')
    await job('Maintenance appointment - scheduled',{agreementId:scheduled.id,occurrenceId:await occurrence(scheduled),status:'SCHEDULED',appointmentOn:addServiceDate(today,1,'DAY')+'T10:00:00+05:30',details:{notes:prefix+' - appointment ready for completion'}})
    await job('Warranty claim - in progress',{agreementId:(await agreement(sales[6].units[1].id,'WARRANTY')).id,status:'IN_PROGRESS',details:{complaint:prefix+' - sample intermittent issue',assessment:'Awaiting demo repair',notes:prefix+' - in-progress example'}})
    await sale(3,1,'Cash',0,'Exact-unit return of one fridge',[sales[3].units[1].id])
    const original=sales[6].units[3],replacementAgreement=await agreement(original.id,'WARRANTY')
    const replacementInvoice=await job('Warranty exchange - free stocked replacement',{agreementId:replacementAgreement.id,status:'RESOLVED',details:{complaint:prefix+' - demo exchange approved',resolution:'Issued a free replacement unit',notes:prefix+' - free stock replacement with carried coverage',charges:[],parts:[{...newQuoteLine(id()),name:result.products[6].name,variantId:result.products[6].variantId,barcode:result.products[6].barcode,unit:'Nos',rate:0}]}},true)
    const replacements=await serviceProductList(db,companyId,{billId:replacementInvoice.billId})
    assert.equal(replacements.length,1,'Free replacement invoice must register its physical part')
    const replacement=replacements[0]
    await updateCustomerProduct(db,companyId,actor,{id:replacement.id,action:'DATES',serialNumber:'BN-DEMO-REPLACEMENT-01',reason:prefix+' - identify replacement serial'})
    await updateCustomerProduct(db,companyId,actor,{id:original.id,action:'REPLACE',replacementId:replacement.id,reason:prefix+' - carry original coverage to free replacement'})
    result.units.push({id:replacement.id,reference:replacement.reference,serial:'BN-DEMO-REPLACEMENT-01',label:'Replacement - original coverage carried',sourceBillId:replacementInvoice.billId})
    result.replacement={originalId:original.id,replacementId:replacement.id,billId:replacementInvoice.billId}
    const pending=await registerManualProduct(db,companyId,actor,{clientId:result.customers[1].id,name:prefix+' - Installation pending unit',purchasedOn:today,evidence:prefix+' - sample prior purchase awaiting installation',requestKey:id(),serialNumber:'BN-DEMO-INSTALL-01',configurationIds:[installation.id]})
    result.units.push({id:pending.id,label:'Pending installation - record an installation date to activate'})
    const order=await createEcommOrder(db as any,companyId,actor,{client:{id:result.customers[2].id},address:{houseDetails:'DEMO address',street:'Demo Street',city:'Kochi',state:'Kerala',pincode:'682001'},items:[{itemId:result.products[6].itemId,quantity:1}],paymentMethod:'COD',notes:prefix+' - pending delivery; manually deliver to activate coverage'})
    await flush()
    result.orders.push({id:order.orderId,orderNumber:order.orderNumber,billId:order.billId,label:'COD order - coverage waiting for delivery'})
    result.bills.push({id:order.billId,label:'Pending COD delivery order',tender:'COD'})
    for(const unit of await serviceProductList(db,companyId,{billId:order.billId}))result.units.push({id:unit.id,reference:unit.reference,label:'Ecommerce - pending delivery',sourceBillId:order.billId})
    async function receipt(billId:string,amount:number,label:string){const saved=await recordBillReceipt(db,companyId,actor,{billId,amount,paymentMethod:'Cash',paymentDate:today,accountId:enabled.mappings.cash,requestId:id(),reference:prefix+' - '+label});await flush();result.receipts.push({id:saved.receiptId,billId,amount,label});return saved}
    await receipt(sales[2].billId,4000,'Full invoice collection')
    await receipt(sales[6].billId,5000,'Partial invoice collection')
    const reversed=await receipt(sales[6].billId,2500,'Receipt to reverse')
    await reverseBillReceipt(db,companyId,actor,{billId:sales[6].billId,receiptId:reversed.receiptId,paymentDate:today,requestId:id(),reference:prefix+' - reversal example'})
    result.receipts.at(-1).reversed=true
    const unitIds=result.units.map((u:any)=>u.id)
    const due=(await db.query(`SELECT a.* FROM customer_service_agreements a JOIN customer_products p ON p.id=a.customer_product_id AND p.company_id=a.company_id
      WHERE a.company_id=$1 AND a.customer_product_id=ANY($2::text[]) AND p.status='ACTIVE' AND a.kind='MAINTENANCE' AND a.status='ACTIVE' AND a.next_due<=$3::date`,[companyId,unitIds,today])).rows
    for(const a of due)await db.query(`INSERT INTO maintenance_occurrences(id,company_id,agreement_id,due_on,snapshot) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(agreement_id,due_on) DO NOTHING`,[id(),companyId,a.id,today,JSON.stringify(a.snapshot)])
    result.checks.dueMaintenance=due.length
    for(const table of protectedTables){const previous=originals.protected[table];if(previous.length){const after=(await db.query(`SELECT id,md5(to_jsonb(t)::text) AS hash FROM ${table} t WHERE company_id=$1 AND id=ANY($2::text[]) ORDER BY id`,[companyId,previous.map((r:any)=>r.id)])).rows;assert.deepEqual(after,previous,`Existing ${table} records must be preserved`)}}
    await db.query('SET CONSTRAINTS ALL IMMEDIATE')
    const stocks=(await db.query('SELECT id,barcode,initial_qty,sold_qty,qty FROM items WHERE company_id=$1 AND id=ANY($2::text[])',[companyId,result.products.map((p:any)=>p.itemId)])).rows
    for(const stock of stocks)assert.equal(Number(stock.qty),Number(stock.initial_qty)-Number(stock.sold_qty))
    assert.equal((await serviceProductDetail(db,companyId,sales[3].units[1].id)).product.status,'RETURNED')
    assert.equal((await serviceProductDetail(db,companyId,original.id)).product.status,'REPLACED')
    assert((await serviceProductDetail(db,companyId,replacement.id)).agreements.some((a:any)=>a.status==='ACTIVE'))
    result.stock=stocks;result.checks.originalRecordsPreserved=true;result.checks.stockBalanced=true;result.checks.constraintsPassed=true
    result.status='READY_TO_COMMIT';saveManifest()
    console.log(`Prepared ${result.products.length} products, ${result.bills.length} bills, ${result.units.length} units and ${result.jobs.length} jobs; committing`)
  await db.query('COMMIT')
  committed=true
  result.status='COMMITTED';result.committedAt=new Date().toISOString();saveManifest()
  // Separate committed reads prove these records survive after the transaction ends.
  const bills=await prisma.$queryRawUnsafe<any[]>('SELECT id,invoice_number,invoice_code,grand_total,payment_status,notes FROM bills WHERE company_id=$1 AND id=ANY($2::text[]) ORDER BY invoice_number',companyId,result.bills.map((b:any)=>b.id))
  assert.equal(bills.length,result.bills.length)
  const units=await prisma.$queryRawUnsafe<any[]>(`SELECT p.id,p.reference,p.serial_number,p.status,p.name,(SELECT count(*)::int FROM customer_service_agreements a WHERE a.customer_product_id=p.id AND a.company_id=p.company_id) AS agreements FROM customer_products p WHERE p.company_id=$1 AND p.id=ANY($2::text[]) ORDER BY p.reference`,companyId,result.units.map((u:any)=>u.id))
  assert.equal(units.length,result.units.length)
  result.verifiedBills=bills;result.verifiedUnits=units;result.status='VERIFIED_PERSISTED';result.verifiedAt=new Date().toISOString();saveManifest()
  const companyQuery='entryCompany='+encodeURIComponent(companyId)
  const guide=[`# ${companyName}: saved after-sales demo`, '',`Created ${today}. These records are committed and remain in the database. Search **${prefix}** after selecting **${companyName}**.`, '',
    'Invoicing and ERP accounting are now enabled using the existing mapped accounts. Their previous settings are backed up. Demo sales and receipts appear in financial reports. Demo opening purchase cost is zero; no real payments were collected.', '',
    '## Where to inspect', '',`- Sales: \`/erp/sales?${companyQuery}\` — filter/search ${prefix}.`, `- Products: \`/products?${companyQuery}\` — search ${prefix}.`,
    `- After-sales: \`/after-sales?${companyQuery}\` — inspect Products, Maintenance and Jobs.`, `- Demo clients: search ${prefix} in Clients; open Service history.`,
    `- Storefront → Orders: \`/order/ecomorders?${companyQuery}\` — pending COD order; delivery activates its coverage.`, '',
    '## Sale and invoice examples', '', '| Document | Number | Total | Payment status | App path |','|---|---|---:|---|---|',
    ...bills.map((b:any)=>`| ${result.bills.find((r:any)=>r.id===b.id)?.label} | ${b.invoice_code||b.invoice_number} | ${b.grand_total} | ${b.payment_status} | \`${result.orders.some((o:any)=>o.billId===b.id)?'/order/ecomorders':'/erp/edit/'+b.id}?${companyQuery}\` |`), '',
    '## Registered units', '', '| Reference | Serial | State | Example | App path |', '|---|---|---|---|---|',
    ...units.map((u:any)=>`| ${u.reference} | ${u.serial_number||'—'} | ${u.status} | ${result.units.find((r:any)=>r.id===u.id)?.label} | \`/after-sales/products/${u.id}?${companyQuery}\` |`), '',
    '## Things to try', '', '- Review all seven coverage combinations on the demo products and saved sales.', '- Open the completed free visit and its zero invoice; compare with the paid visit including labour and a filter part.',
    '- Review the open guarantee claim, in-progress warranty claim and scheduled maintenance appointment.', '- Compare the returned fridge unit with its active sibling and negative return document.',
    '- Open the replacement unit: its old warranty/service evidence is carried forward; its replacement part was issued on a zero invoice and consumed stock.',
    '- Record an installation date on the pending-installation unit to activate its warranty.', '- Review the fully paid purifier invoice and partially paid air-conditioner invoice, including the reversed demo receipt.',
    '- Open Maintenance to see due visits. The pending delivery order keeps its agreements pending until you mark it delivered.', '',
    '## Verification and backup', '', `Verified after commit: ${result.products.length} products, ${bills.length} bills, ${units.length} registered units, ${result.jobs.length} jobs, ${result.orders.length} order, ${result.receipts.length} receipt records.`,
    'Existing products, stock, bills, coverage and other protected records were checked before commit and preserved. Native posting constraints and demo stock balances passed. No schemas or posting functions were changed.', '',
    `Record IDs: [Demo-Records.json](Demo-Records.json). Original settings backup: \`${result.originalBackupFile}\`. This attempt's backup: \`${backupFile}\`.`, '',
    'All new customers, products and plans are labelled DEMO-AS. The fake demo phone identifiers do not represent real customer contacts. No shipping, messaging or external gateway action was performed.'
  ].join('\n')+'\n'
  writeFileSync(path.join(output,'Demo-Guide.md'),guide)
  console.log(JSON.stringify({status:result.status,company:companyName,products:result.products.length,bills:bills.length,units:units.length,jobs:result.jobs.length,orders:result.orders.length,guide:path.join(output,'Demo-Guide.md')}))
}catch(error:any){
  if(db&&!committed)await db.query('ROLLBACK').catch(()=>{})
  if(ownsManifest){result.error=error.message;result.status=committed?'COMMITTED_VERIFICATION_FAILED':'FAILED_BEFORE_COMMIT';saveManifest()}
  console.error(error.stack||error.message);process.exitCode=1
}finally{db?.release();await demoPool.end();await prisma.$disconnect()}
