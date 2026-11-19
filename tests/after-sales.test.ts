import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultServiceRules, normalizeServiceConfiguration, addServiceDate, nextServiceDue, serviceActivation, validateServiceValues } from '../utils/after-sales'
import { registerBillServices, deliveredBillServices, reconcileBillServices } from '../server/utils/after-sales-lifecycle'
import { saveConfiguration, previewConfiguration, saveProductServiceLinks, saveServiceJob, invoiceServiceJob, processServices } from '../server/utils/after-sales'

test('coverage labels share validation, while maintenance has independent rules',()=>{
  for(const kind of ['WARRANTY','GUARANTEE','MAINTENANCE'])assert.equal(normalizeServiceConfiguration({kind,name:'Plan',rules:defaultServiceRules()}).kind,kind)
  assert.throws(()=>normalizeServiceConfiguration({kind:'WARRANTY',name:'',rules:{}}))
  assert.throws(()=>normalizeServiceConfiguration({kind:'WARRANTY',name:'Plan',rules:{duration:0}}))
  assert.throws(()=>normalizeServiceConfiguration({kind:'MAINTENANCE',name:'Plan',rules:{interval:0}}))
  assert.throws(()=>normalizeServiceConfiguration({kind:'MAINTENANCE',name:'Plan',rules:{schedule:'CUSTOM',dates:[]}}))
  assert.throws(()=>normalizeServiceConfiguration({kind:'MAINTENANCE',name:'Plan',rules:{activation:'DATE',startDate:'2026-02-30'}}))
})
test('calendar dates retain the original anchor across short months and leap years',()=>{
  assert.equal(addServiceDate('2024-02-29',1,'YEAR'),'2025-02-28')
  const rules={...defaultServiceRules(),interval:1}
  assert.equal(nextServiceDue(rules,'2026-01-31'),'2026-02-28')
  assert.equal(nextServiceDue(rules,'2026-01-31','2026-02-28'),'2026-03-31')
  assert.equal(nextServiceDue({...rules,timing:'COMPLETION'},'2026-01-31','2026-02-28','2026-03-10'),'2026-04-10')
  assert.equal(nextServiceDue({...rules,endDate:'2026-02-01'},'2026-01-31'),null)
})
test('custom and one-time schedules support per-configuration dates',()=>{
  const r={...defaultServiceRules(),schedule:'CUSTOM' as const,dates:['2026-04-01','2026-07-15']}
  assert.equal(nextServiceDue(r,'2026-01-01'),'2026-04-01')
  assert.equal(nextServiceDue(r,'2026-01-01','2026-04-01'),'2026-07-15')
  assert.equal(nextServiceDue({...r,schedule:'ONCE'},'2026-01-01','2026-01-01'),null)
})
test('activation distinguishes POS, ecommerce, installation and date offsets',()=>{
  const r=defaultServiceRules(),p={purchased_on:'2026-10-01',order_id:null}
  assert.equal(serviceActivation(r,p),'2026-10-01')
  assert.equal(serviceActivation(r,{...p,order_id:'online'}),null)
  assert.equal(serviceActivation(r,{...p,order_id:'online',delivered_on:'2026-10-05'}),'2026-10-05')
  assert.equal(serviceActivation({...r,activation:'INSTALLATION'},p),null)
  assert.equal(serviceActivation({...r,activation:'DATE',startDate:'2026-10-01',offset:2,offsetUnit:'WEEK'},p),'2026-10-15')
})
test('custom readings are typed evidence, without automatic numeric triggers',()=>{
  const fields:any=[{key:'km',label:'Odometer',type:'NUMBER',required:true},{key:'checked',label:'Checked',type:'BOOLEAN'}]
  assert.deepEqual(validateServiceValues(fields,{km:5000,checked:false}),{km:5000,checked:false})
  assert.throws(()=>validateServiceValues(fields,{km:'5000'}))
  assert.throws(()=>validateServiceValues(fields,{},true))
  assert.throws(()=>normalizeServiceConfiguration({kind:'MAINTENANCE',name:'Unsafe',rules:{fields:[{key:'__proto__',label:'bad',type:'TEXT'}]}}))
})
function registrationFixture(numbered=false){
 const products:any[]=[],agreements:any[]=[],calls:any[]=[],audits:any[]=[]
 let qty=2,member=true,ready=true,counter='0',enabled=true,orderId:string|null='order'
 const row=(rows:any[]=[])=>({rows,rowCount:rows.length})
 const configs=[{id:'w',name:'Maker warranty',kind:'WARRANTY',revision:1,rules:defaultServiceRules()},{id:'m',name:'Quarterly service',kind:'MAINTENANCE',revision:2,rules:defaultServiceRules()}]
 const db={async query(raw:string,args:any[]=[]):Promise<any>{const sql=raw.trim();calls.push({sql,args})
  if(sql.includes("public.customer_product_numbering"))return row([{ready:numbered}])
  if(sql.startsWith('INSERT INTO customer_product_numbering'))return row()
  if(sql.startsWith('SELECT prefix,last_number'))return row([{prefix:'PR',last_number:counter}])
  if(sql.startsWith('UPDATE customer_product_numbering')){counter=args[1];return row()}
  if(sql.startsWith('SELECT 1 FROM customer_products'))return row(products.filter(p=>p.company_id===args[0]&&p.reference===args[1]))
  if(sql.includes('to_regclass'))return row([{ready}])
  if(sql.includes('SELECT preference_value FROM general_preferences'))return row([{preference_value:{includeAfterSales:enabled}}])
  if(sql.includes('pg_advisory'))return row()
  if(sql.startsWith('SELECT b.*'))return row([{id:'bill',client_id:'customer',sale_day:'2026-10-01',order_id:orderId}])
  if(sql.startsWith('SELECT e.id'))return row([{id:'entry',item_id:'item',name:'Purifier',qty,product_id:'product'}])
  if(sql.startsWith('SELECT 1 FROM company_clients'))return row(member?[{}]:[])
  if(sql.startsWith('SELECT id,client_id,status'))return row(products.filter(p=>p.entry_id===args[0]))
  if(sql.startsWith('SELECT c.*'))return row(configs)
  if(sql.startsWith('INSERT INTO customer_products')){products.push({id:args[0],company_id:args[1],client_id:args[2],reference:args[3],source_key:args[4],product_id:args[5],item_id:args[6],entry_id:args[8],order_id:args[9],serial_number:args[10],purchased_on:args[12],installed_on:args[13],delivered_on:args[14],status:'ACTIVE'});return row()}
  if(sql.startsWith('INSERT INTO customer_service_agreements')){agreements.push({id:args[0],company_id:args[1],customer_product_id:args[2],configuration_id:args[3],revision:args[4],kind:args[5],snapshot:JSON.parse(args[6]),status:'PENDING'});return row()}
  if(sql.startsWith('SELECT *,purchased_on'))return row(products.filter(p=>p.id===args[0]))
  if(sql.startsWith('SELECT * FROM customer_service_agreements'))return row(agreements.filter(a=>a.customer_product_id===args[0]&&a.status==='PENDING'))
  if(sql.startsWith('UPDATE customer_service_agreements SET starts_on')){Object.assign(agreements.find(a=>a.id===args[0]),{starts_on:args[2],ends_on:args[3],next_due:args[4],status:'ACTIVE'});return row()}
  if(sql.startsWith('INSERT INTO service_audit')){audits.push(args);return row()}
  if(sql.startsWith('UPDATE customer_products SET delivered_on')){for(const p of products)p.delivered_on ||= args[2];return row(products.map(p=>({id:p.id})))}
  if(sql.startsWith('SELECT p.entry_id'))return row(qty<products.length?[{entry_id:'entry'}]:[])
  throw Error('Unhandled fixture query: '+sql)
 }}
 return {db,products,agreements,calls,audits,setQty:(v:number)=>qty=v,setMember:(v:boolean)=>member=v,setReady:(v:boolean)=>ready=v,setEnabled:(v:boolean)=>enabled=v,setOrder:(v:string|null)=>orderId=v}
}

test('disabled after-sales skips automatic registration and its client/quantity requirements',async()=>{
 const f=registrationFixture();f.setEnabled(false);f.setMember(false);f.setQty(1.5)
 await registerBillServices(f.db,'company','bill')
 assert.equal(f.products.length,0);assert.equal(f.agreements.length,0)
 assert.ok(!f.calls.some(c=>c.sql.includes('FROM bills')||/^(INSERT|UPDATE)/.test(c.sql)))
 const preferenceRead=f.calls.find(c=>c.sql.includes('SELECT preference_value FROM general_preferences'))
 assert.deepEqual(preferenceRead.args,['company'])
})
test('two identical units register independently with snapshots, optional serials and replay protection',async()=>{
 const f=registrationFixture();await registerBillServices(f.db,'company','bill',[{itemId:'item',unit:0,serialNumber:'SN-1'}])
 assert.equal(f.products.length,2);assert.equal(f.agreements.length,4);assert.notEqual(f.products[0].reference,f.products[1].reference)
 assert.equal(f.products[0].serial_number,'SN-1');assert.equal(f.products[1].serial_number,null)
 assert.ok(f.agreements.every(a=>a.status==='PENDING'));assert.equal(f.agreements[1].revision,2)
 await registerBillServices(f.db,'company','bill');assert.equal(f.products.length,2)
 await deliveredBillServices(f.db,'company','order','2026-10-05')
 assert.ok(f.agreements.every(a=>a.starts_on==='2026-10-05'));assert.equal(f.agreements.find(a=>a.kind==='MAINTENANCE').next_due,'2027-01-05')
 await deliveredBillServices(f.db,'company','order','2026-11-01');assert.ok(f.products.every(p=>p.delivered_on==='2026-10-05'));assert.ok(f.agreements.every(a=>a.starts_on==='2026-10-05'))
})
test('numbered POS units retain their references and counter on repeated registration',async()=>{
 const f=registrationFixture(true);await registerBillServices(f.db,'company','bill')
 assert.deepEqual(f.products.map(p=>p.reference),['PR-000001','PR-000002'])
 await registerBillServices(f.db,'company','bill')
 assert.equal(f.calls.filter(c=>c.sql.startsWith('UPDATE customer_product_numbering')).length,2)
})

test('POS registration saves modal delivery/installation dates without overriding ecommerce delivery',async()=>{
 const f=registrationFixture();f.setOrder(null)
 await registerBillServices(f.db,'company','bill',[{itemId:'item',unit:0,serialNumber:'POS-1',deliveredOn:'2026-10-02',installedOn:'2026-10-03'}])
 assert.equal(f.products[0].serial_number,'POS-1');assert.equal(f.products[0].delivered_on,'2026-10-02');assert.equal(f.products[0].installed_on,'2026-10-03')
 const ecommerce=registrationFixture()
 await registerBillServices(ecommerce.db,'company','bill',[{itemId:'item',unit:0,deliveredOn:'2026-10-02'}])
 assert.equal(ecommerce.products[0].delivered_on,null)
})

test('missing customer and fractional quantities reject before registration; unapplied migration is compatible',async()=>{
 const f=registrationFixture();f.setMember(false);await assert.rejects(registerBillServices(f.db,'company','bill'),/Select a client/);assert.equal(f.products.length,0)
 f.setMember(true);f.setQty(1.5);await assert.rejects(registerBillServices(f.db,'company','bill'),/whole-unit/)
 f.setReady(false);await registerBillServices(f.db,'company','bill');assert.equal(f.products.length,0)
})
test('quantity reductions cannot silently discard registered units',async()=>{
 const f=registrationFixture();await registerBillServices(f.db,'company','bill');f.setQty(1)
 await assert.rejects(reconcileBillServices(f.db,'company','bill'),/specific client units/)
})
test('foreign and newly selected archived configurations reject product linking',async()=>{
 const db={async query(sql:string){if(sql.includes('to_regclass'))return {rows:[{ready:true}]};if(sql.includes('FROM products'))return {rows:[{id:'p'}],rowCount:1};if(sql.includes('FROM service_configurations'))return {rows:[{id:'foreign',archived:true,linked:false}]};throw Error(sql)}}
 await assert.rejects(saveProductServiceLinks(db,'company','p',['foreign']),/active configurations/)
})
test('preview tokens reject stale agreement state before configuration mutation',async()=>{
 const rules=defaultServiceRules(),body:any={id:'c',kind:'WARRANTY',name:'Updated',rules,revision:1,applyTo:'SELECTED',reason:'Extend coverage',agreementIds:['a']}
 let changed=false,writes=0
 const db={async query(sql:string){if(sql.startsWith('SELECT * FROM service_configurations'))return {rows:[{id:'c',company_id:'company',kind:'WARRANTY',revision:1,rules,name:'Old'}]};if(sql.includes('SELECT a.*'))return {rows:[{id:'a',kind:'WARRANTY',snapshot:{name:'Old',rules},purchased_on:'2026-01-01',starts_on:'2026-01-01',next_due:null,ends_on:changed?'2028-01-01':'2027-01-01'}]};writes++;throw Error(sql)}}
 const preview=await previewConfiguration(db,'company',body);changed=true
 await assert.rejects(saveConfiguration(db,'company','staff',{...body,previewToken:preview.token}),/Preview again/);assert.equal(writes,0)
})
test('replaying a completed job request and an issued invoice does not repeat effects',async()=>{
 let writes=0
 const db={async query(sql:string){if(sql.startsWith('SELECT id,agreement_id'))return {rows:[{id:'job',agreement_id:'agreement'}]};if(sql.includes('FROM service_jobs j'))return {rows:[{id:'job',bill_id:'invoice',status:'COMPLETED'}]};writes++;throw Error(sql)}}
 assert.deepEqual(await saveServiceJob(db,'company','staff',{agreementId:'agreement',requestKey:'same'}),{id:'job'})
 assert.deepEqual(await invoiceServiceJob(db,'company','staff',{id:'job'}),{billId:'invoice'});assert.equal(writes,0)
 await assert.rejects(saveServiceJob(db,'company','staff',{agreementId:'another',requestKey:'same'}),/another agreement/)
})
test('visit completion consumes one allowance, advances dates, and never collects money',async()=>{
 const rules={...defaultServiceRules(),freeVisits:1,charge:250,timing:'COMPLETION' as const}
 const a:any={id:'agreement',company_id:'company',customer_product_id:'unit',client_id:'customer',kind:'MAINTENANCE',status:'ACTIVE',product_status:'ACTIVE',snapshot:{name:'Service',rules},completed_visits:0,starts_on:'2026-01-01'}
 const jobs:any[]=[],calls:string[]=[]
 const db={async query(sql:string,args:any[]=[]):Promise<any>{calls.push(sql);const result=(rows:any[]=[])=>({rows,rowCount:rows.length})
  if(sql.startsWith('SELECT id,agreement_id'))return result(jobs.filter(j=>j.request_key===args[1]))
  if(sql.includes('SELECT a.*,a.starts_on'))return result([{...a}])
  if(sql.startsWith('SELECT id FROM service_jobs'))return result([])
  if(sql.startsWith('INSERT INTO service_jobs')){jobs.push({id:args[0],agreement_id:args[2],request_key:args[4],status:args[6],charge:args[12]});return result()}
  if(sql.startsWith('UPDATE customer_service_agreements SET completed_visits')){Object.assign(a,{completed_visits:args[2],last_completed_on:args[3],next_due:args[4],status:args[5]});return result()}
  if(sql.startsWith('INSERT INTO service_audit'))return result()
  throw Error(sql)
 }}
 const input={agreementId:'agreement',requestKey:'first',status:'COMPLETED',completedOn:'2026-04-10',details:{notes:'Checked'}}
 await saveServiceJob(db,'company','staff',input);assert.equal(a.completed_visits,1);assert.equal(a.next_due,'2026-07-10');assert.equal(jobs[0].charge,0)
 await saveServiceJob(db,'company','staff',input);assert.equal(a.completed_visits,1)
 await saveServiceJob(db,'company','staff',{...input,requestKey:'second',status:'OPEN'});assert.equal(jobs[1].charge,250)
 assert.ok(calls.every(sql=>!sql.includes('INSERT INTO bills')&&!sql.includes('INSERT INTO payments')))
})
test('fixed schedules retain missed occurrences and reminder retries do not duplicate alerts',async()=>{
 const rules={...defaultServiceRules(),interval:1,reminderDays:[7,0]},a:any={id:'agreement',starts_on:'2026-01-01',next_due:'2026-02-01',completed_visits:0,snapshot:{name:'Monthly check',rules}}
 const occurrences:any[]=[],reminders=new Set<string>(),notifications:any[]=[]
 const result=(rows:any[]=[])=>({rows,rowCount:rows.length})
 const db={async query(sql:string,args:any[]=[]):Promise<any>{
  if(sql.startsWith('UPDATE customer_service_agreements SET status'))return result()
  if(sql.startsWith('SELECT *,starts_on'))return result([{...a}])
  if(sql.startsWith('SELECT count(*)'))return result([{count:occurrences.length}])
  if(sql.startsWith('INSERT INTO maintenance_occurrences')){if(occurrences.some(o=>o.due_on===args[3]))return result();const o={id:args[0],due_on:args[3],snapshot:JSON.parse(args[4]),reference:'MP-1',product_name:'Purifier'};occurrences.push(o);return result([o])}
  if(sql.startsWith('UPDATE customer_service_agreements SET next_due')){a.next_due=args[2];return result()}
  if(sql.includes('SELECT o.*,o.due_on'))return result(occurrences)
  if(sql.startsWith('INSERT INTO service_reminders')){const k=args[2]+':'+args[3];if(reminders.has(k))return result();reminders.add(k);return result([{id:args[0]}])}
  if(sql.startsWith('INSERT INTO notifications')){notifications.push(args);return result()}
  throw Error(sql)
 }}
 const first=await processServices(db,'company','2026-04-01');assert.equal(first.generated,3);assert.deepEqual(occurrences.map(o=>o.due_on),['2026-02-01','2026-03-01','2026-04-01']);assert.equal(notifications.length,6)
 const second=await processServices(db,'company','2026-04-01');assert.equal(second.generated,0);assert.equal(second.notified,0);assert.equal(notifications.length,6)
})
test('configuration edits require an explicit scope, retain revision history and leave existing agreements alone for future-only edits',async()=>{
 const old={id:'c',company_id:'company',kind:'WARRANTY',revision:1,name:'Original',rules:defaultServiceRules()},writes:any[]=[]
 const db={async query(sql:string,args:any[]=[]):Promise<any>{if(sql.startsWith('SELECT * FROM service_configurations'))return {rows:[old]};writes.push({sql,args});return {rows:[],rowCount:1}}}
 await assert.rejects(saveConfiguration(db,'company','staff',{...old,name:'Updated',reason:'New terms'}),/choose whether/)
 await saveConfiguration(db,'company','staff',{...old,name:'Updated',reason:'New terms',applyTo:'FUTURE'})
 assert.ok(writes.some(w=>w.sql.includes('INSERT INTO service_configuration_revisions')))
 assert.ok(writes.some(w=>w.sql.includes('INSERT INTO service_audit')))
 assert.ok(writes.every(w=>!w.sql.includes('UPDATE customer_service_agreements')))
})
