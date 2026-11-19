import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID, createHmac } from 'node:crypto'
import { Readable } from 'node:stream'
import { createEvent } from 'h3'
import { notificationEvents, normalizeNotificationRules, planNotifications, notificationStillRelevant, type NotificationFact, type PlannedNotification } from '../utils/whatsapp-notifications'
import { notificationFact } from '../server/utils/whatsapp-notification-sources'
import { deliverNotification, notificationDetails, validateNotificationTemplate, revokeNotificationContact, scanNotifications } from '../server/utils/whatsapp-notifications'
import { verifyReceiptShare } from '../server/utils/receiptShare'
import { sealToken } from '../server/utils/connect-whatsapp-security'
import { pool } from '../server/db'
import notificationHandler from '../server/api/whatsapp-notifications/[action]'
import cronHandler from '../server/api/cron/whatsapp-notifications.get'
import webhookHandler from '../server/api/connect/whatsapp/webhook'

const now=new Date('2026-11-18T06:00:00Z'),activated='2026-11-18T00:00:00Z'
function fact(type:string,state:any={},extra:any={}):NotificationFact{return {type,id:'source-a',clientId:'client-a',createdAt:'2026-11-18T02:00:00Z',valid:true,state,fields:{document:'INV-1',total:'100'},...extra}}
const types=(f:NotificationFact,old?:NotificationFact)=>planNotifications(f,old,now,activated).map(e=>e.type)
test('all promised sales, delivery, coverage, service and finance events have a trigger',()=>{
  const cases:[string,any,string[]][]=[
    ['quote',{status:'SENT',revision:'one'},['quote_shared']],
    ['bill',{total:100},['sale_created']],['bill',{total:-100},['return_completed']],['bill',{total:0,serviceJobId:'job'},['service_invoice']],
    ['order',{status:'PLACED'},['order_confirmed']],['order',{status:'SHIPPED'},['order_dispatched']],['order',{status:'DELIVERED'},['order_delivered']],['order',{status:'CANCELLED'},['order_cancelled']],['order',{status:'UNDELIVERED'},['delivery_failed']],
    ['unit',{status:'ACTIVE',installedOn:'2026-11-18',coverageVersion:'[["warranty","2026-11-18"],["guarantee","2026-11-18"]]'},['installation_completed','coverage_activated']],['unit',{status:'REPLACED'},['replacement_completed']],
    ['agreement',{status:'ACTIVE',productStatus:'ACTIVE',productId:'unit',startsOn:'2026-11-18',endsOn:'2027-11-18'},['coverage_expiring']],
    ['occurrence',{status:'DUE',productStatus:'ACTIVE',productId:'unit',dueOn:'2026-11-25',agreementStatus:'ACTIVE'},['maintenance_due']],
    ['job',{kind:'CLAIM',status:'OPEN'},['claim_registered']],['job',{kind:'CLAIM',status:'APPROVED'},['claim_decision']],['job',{kind:'CLAIM',status:'REJECTED'},['claim_decision']],['job',{kind:'CLAIM',status:'IN_PROGRESS'},['repair_updated']],
    ['job',{kind:'VISIT',status:'IN_PROGRESS'},['repair_updated']],
    ['job',{kind:'VISIT',status:'COMPLETED',completedOn:'2026-11-18'},['service_completed','feedback']],
    ['job',{kind:'VISIT',status:'SCHEDULED',appointmentOn:'2026-11-20T04:30:00Z',assignedTo:'staff'},['appointment_booked','appointment_reminder']],
    ['installation',{status:'SCHEDULED',productStatus:'ACTIVE',appointmentOn:'2026-11-20T04:30:00Z',technician:'Alex'},['installation_booked','appointment_reminder']],
    ['payment',{status:'POS_CREDIT_RECEIPT'},['payment_received']],['payment',{status:'POS_CREDIT_REVERSED'},['payment_reversed']],
    ['bill',{total:100,balance:50,dueDate:'2026-11-20'},['sale_created','payment_due']],
  ]
  const reached=new Set<string>()
  for(const [type,state,expected]of cases){const result=types(fact(type,state));for(const e of expected){assert(result.includes(e as any),type+' '+e);reached.add(e)}}
  const cancelled=fact('job',{status:'CANCELLED',updatedAt:'2026-11-18'}),previous=fact('job',{status:'SCHEDULED',appointmentOn:'2026-11-20'})
  assert(types(cancelled,previous).includes('appointment_cancelled'));reached.add('appointment_cancelled')
  assert.deepEqual([...reached].sort(),notificationEvents.map(e=>e[0]).sort())
})
test('activation baselines old sales/work; polling retries keep stable keys; meaningful reschedules get new keys',()=>{
  const oldSale=fact('bill',{total:100},{createdAt:'2020-01-01T00:00:00Z'})
  assert.deepEqual(types(oldSale),[])
  const completed=fact('job',{status:'COMPLETED',completedOn:'2026-11-18'},{createdAt:'2020-01-01T00:00:00Z'})
  assert.deepEqual(types(completed,completed),[])
  const sale=fact('bill',{total:100}),first=planNotifications(sale,undefined,now,activated),retry=planNotifications(sale,undefined,new Date(+now+1000),activated)
  assert.equal(first[0].key,retry[0].key);assert.deepEqual(types(sale,sale),[])
  const old=fact('job',{status:'SCHEDULED',appointmentOn:'2026-11-20T04:30:00Z'}),next=fact('job',{status:'SCHEDULED',appointmentOn:'2026-11-21T04:30:00Z'})
  assert(types(next,old).includes('appointment_booked'))
  assert.notEqual(planNotifications(old,undefined,now,activated)[0].key,planNotifications(next,old,now,activated)[0].key)
  const all=fact('unit',{status:'ACTIVE',coverageVersion:'[["warranty","2026-11-18"],["guarantee","2026-11-18"]]'}),remaining=fact('unit',{status:'ACTIVE',coverageVersion:'[["warranty","2026-11-18"]]'})
  assert.equal(types(remaining,all).includes('coverage_activated'),false,'A plan expiring does not announce new activation')
})

test('signed STOP messages revoke once; unsigned requests and webhook replay do not change client permissions',async()=>{
  const originalQuery=pool.query,originalConnect=pool.connect,secret=process.env.WHATSAPP_APP_SECRET
  process.env.WHATSAPP_APP_SECRET='signed-stop-test-secret'
  let inserted=false,revoked=0
  const result=(rows:any[]=[])=>({rows,rowCount:rows.length})
  async function query(sql:string,args:any[]=[]):Promise<any>{
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.includes('LIMIT 0'))return result()
    if(sql.startsWith('SELECT id FROM connect_whatsapp_connections'))return result([{id:'connection-a'}])
    if(sql.startsWith('INSERT INTO connect_whatsapp_messages')){if(inserted)return result();inserted=true;return result([{id:args[0]}])}
    if(sql.includes('AS ready'))return result([{ready:true}])
    if(sql.startsWith('UPDATE whatsapp_notification_contacts')){assert.equal(args[0],'connection-a');assert.equal(args[1],'919876543210');assert.equal(args[2].getTime()%1000,0,'Use the signed event time rather than receipt time');revoked++;return result()}
    if(sql.startsWith('UPDATE whatsapp_notification_outbox'))return result()
    throw Error('Unexpected STOP SQL '+sql)
  }
  ;(pool as any).query=query;(pool as any).connect=async()=>({query,release(){}})
  const payload=JSON.stringify({object:'whatsapp_business_account',entry:[{id:'100',changes:[{field:'messages',value:{metadata:{phone_number_id:'200'},messages:[{id:'wamid.stop',from:'919876543210',timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'STOP'}}]}}]}]})
  function event(valid:boolean){const req:any=Readable.from([Buffer.from(payload)]);req.method='POST';req.url='/api/connect/whatsapp/webhook';req.headers={'content-type':'application/json','content-length':String(Buffer.byteLength(payload)),'x-hub-signature-256':'sha256='+createHmac('sha256',valid?process.env.WHATSAPP_APP_SECRET!:'invalid').update(payload).digest('hex')};return createEvent(req,{setHeader(){}} as any)}
  try{await assert.rejects(webhookHandler(event(false)),{statusCode:401});assert.equal(revoked,0);await webhookHandler(event(true));assert.equal(revoked,1);await webhookHandler(event(true));assert.equal(revoked,1)}
  finally{pool.query=originalQuery;pool.connect=originalConnect;if(secret===undefined)delete process.env.WHATSAPP_APP_SECRET;else process.env.WHATSAPP_APP_SECRET=secret}
})
test('scheduled reminders use India dates, catch up within expiry, and suppress ancient reminders',()=>{
  const f=fact('occurrence',{status:'DUE',productStatus:'ACTIVE',productId:'unit',dueOn:'2026-11-25',agreementStatus:'ACTIVE'})
  const events=planNotifications(f,undefined,now,activated)
  assert.equal(events[0].availableAt,'2026-11-18T03:30:00.000Z')
  assert.equal(events.length,3)
  assert.equal(types(fact('occurrence',{...f.state,dueOn:'2020-01-01'})).length,0)
})
test('fresh state cancels obsolete payment, appointment, maintenance, quote and coverage messages',()=>{
  for(const [type,state,changes]of [
    ['bill',{total:100,balance:100,dueDate:'2026-11-18'},{balance:0}],
    ['occurrence',{status:'DUE',productStatus:'ACTIVE',agreementStatus:'ACTIVE',dueOn:'2026-11-18',productId:'unit'},{productStatus:'RETURNED'}],
    ['agreement',{status:'ACTIVE',productStatus:'ACTIVE',startsOn:'2026-11-18',endsOn:'2026-11-25',productId:'unit'},{productStatus:'REPLACED'}],
    ['job',{status:'SCHEDULED',appointmentOn:'2026-11-19T04:30:00Z',assignedTo:'staff'},{status:'CANCELLED'}],
    ['installation',{status:'SCHEDULED',productStatus:'ACTIVE',appointmentOn:'2026-11-19T04:30:00Z'},{installedOn:'2026-11-18'}],
    ['quote',{status:'SENT',revision:'1'},{revision:'2'}],
  ] as any[]){const f=fact(type,state),e=planNotifications(f,undefined,now,activated).filter(e=>!['sale_created'].includes(e.type))[0];assert(e,type);assert.equal(notificationStillRelevant(e,fact(type,{...state,...changes}),now),false,type)}
})
test('template/category validation rejects foreign formats and feedback without its marketing template',()=>{
  const template={status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:'Hello {{1}}, {{2}} update: {{3}}. {{4}}'}]}
  assert.equal(validateNotificationTemplate(template,'sale_created'),template)
  assert.throws(()=>validateNotificationTemplate(template,'feedback'))
  for(const t of [{...template,status:'PENDING'},{...template,components:[{type:'BODY',text:'Hello {{name}}'}]},{...template,components:[...template.components,{type:'HEADER',format:'DOCUMENT'}]}])assert.throws(()=>validateNotificationTemplate(t,'sale_created'))
  assert.throws(()=>normalizeNotificationRules({sale_created:{enabled:true,templateId:'foreign/path'}}))
})
test('collector distinguishes invoice balance, service invoices and physical-unit states',()=>{
  const row={source:{id:'bill',client_id:'client',created_at:'2026-11-18T02:00:00Z',payment_method:'Split',grand_total:100,split_payments:[{method:'Cash',amount:40},{method:'Credit',amount:60}],due_date:'2026-12-01'},collected:10,service_job_id:'job'}
  const f=notificationFact('bill',row);assert.equal(f.state.balance,50);assert.equal(f.state.serviceJobId,'job');assert.equal(f.state.dueDate,'2026-12-01')
  const receipt=notificationFact('payment',{source:{id:'payment',status:'POS_CREDIT_RECEIPT',amount:10,bill_id:'bill'},bill:row.source,collected:10})
  assert.equal(receipt.clientId,'client');assert.equal(receipt.fields.balance,'50')
  assert.equal(notificationFact('unit',{source:{id:'unit',status:'RETURNED'}}).state.status,'RETURNED')
  assert.equal(notificationFact('bill',{...row,source:{...row.source,created_at:'2026-11-18T02:00:00'}}).createdAt,'2026-11-18T02:00:00.000Z')
})

test('committed-state scanner persists its baseline and deduplicates repeated scheduled runs',async()=>{
  const original=pool.connect,observations=new Map<string,any>(),keys=new Set<string>()
  let enabled=true
  const rules=normalizeNotificationRules({}),source={id:'bill',company_id:'a',client_id:'client',created_at:'2026-11-18T02:00:00Z',grand_total:100,payment_method:'Credit',due_date:'2026-11-20',payment_status:'PENDING'}
  const rows=(r:any[]=[])=>({rows:r,rowCount:r.length})
  async function query(sql:string,args:any[]=[]):Promise<any>{
    if(sql.startsWith('BEGIN')||sql==='COMMIT'||sql==='ROLLBACK')return rows()
    if(sql.includes('pg_try_advisory'))return rows([{locked:true}])
    if(sql.startsWith('SELECT * FROM whatsapp_notification_settings'))return rows([{enabled,rules,activated_at:activated}])
    if(sql.startsWith('SELECT source_type'))return rows([...observations.values()])
    if(sql.includes('FROM unnest'))return rows(args[0].map((name:string)=>({name,ready:['bills','payments','ecomm_orders'].includes(name)})))
    if(sql.startsWith('SELECT to_jsonb(b)'))return rows([{source:{...source},collected:0,has_receipts:false}])
    if(sql.startsWith('SELECT to_jsonb('))return rows()
    if(sql.startsWith('INSERT INTO whatsapp_notification_outbox')){if(keys.has(args[2]))return rows();keys.add(args[2]);return rows([{id:args[0]}])}
    if(sql.startsWith('INSERT INTO whatsapp_notification_sources')){observations.set(args[1]+':'+args[2],{source_type:args[1],source_id:args[2],snapshot:JSON.parse(args[3])});return rows()}
    if(sql.startsWith('UPDATE whatsapp_notification_outbox'))return rows()
    throw Error('Unexpected scanner SQL '+sql)
  }
  ;(pool as any).connect=async()=>({query,release(){}})
  try{
    const first=await scanNotifications('a',now);assert(first.queued>0);const count=keys.size
    assert.equal((await scanNotifications('a',now)).queued,0);assert.equal(keys.size,count)
    enabled=false;source.id='new-bill';assert.equal((await scanNotifications('a',now)).queued,0)
  }finally{pool.connect=original}
})

test('real delivery worker, signed sender and seller routes: no duplicates, wrong companies, opt-out sends or uncertain retries',async()=>{
  const originalQuery=pool.query,originalConnect=pool.connect,originalFetch=globalThis.fetch,originalAuth=(globalThis as any).requireAuthSession
  const savedEnv={...process.env};process.env.WHATSAPP_ENCRYPTION_KEY='test-encryption-key-longer-than-thirty-two-characters';process.env.RECEIPT_SHARE_SECRET='test-receipt-key-longer-than-thirty-two-characters';process.env.WHATSAPP_NOTIFICATION_ORIGIN='https://markit.example';process.env.CRON_SECRET='cron-secret-long-enough'
  const conn={id:'connection-a',company_id:'company-a',active:true,subscribed:true,waba_id:'100',phone_id:'200',token:sealToken('private-token',process.env.WHATSAPP_ENCRYPTION_KEY)}
  const source={id:'bill-a',client_id:'client-a',company_id:'company-a',created_at:new Date().toISOString(),grand_total:100,payment_method:'Credit',invoice_number:1,deleted:false,due_date:'2026-12-01'}
  const preferences:any={enabled:true,rules:normalizeNotificationRules({}),activated_at:new Date().toISOString()};for(const r of Object.values<any>(preferences.rules))r.templateId='300'
  const contact:any={recipient:'919876543210',client_phone:'9876543210',current_phone:'9876543210',client_name:'Alex',service_consent:true,marketing_consent:true}
  const outbox=new Map<string,any>(),messages=new Map<string,any>();let sends=0,mode='',commits=0,afterIntent:(()=>void)|undefined
  function add(type='sale_created'){const id=randomUUID(),event:PlannedNotification={type:type as any,key:id,sourceType:'bill',sourceId:'bill-a',clientId:'client-a',guard:{},availableAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()};outbox.set(id,{id,company_id:'company-a',event_type:type,source_type:'bill',source_id:'bill-a',client_id:'client-a',status:'QUEUED',payload:event});return id}
  const result=(rows:any[]=[])=>({rows,rowCount:rows.length})
  async function query(sql:string,args:any[]=[]):Promise<any>{
    if(sql.startsWith('BEGIN')||sql==='ROLLBACK')return result()
    if(sql==='COMMIT'){commits++;if(afterIntent&&[...outbox.values()].some(r=>r.status==='SENDING')){const cb=afterIntent;afterIntent=undefined;cb()}return result()}
    if(sql.includes('FROM unnest'))return result(args[0].map((name:string)=>({name,ready:true})))
    if(sql.includes('AS ready')&&sql.includes('to_regclass'))return result([{ready:true}])
    if(sql.startsWith('SELECT * FROM whatsapp_notification_outbox'))return result([...outbox.values()].filter(r=>r.id===args[0]&&r.company_id===args[1]&&r.status==='QUEUED'))
    if(sql.startsWith('SELECT')&&sql.includes('FROM connect_whatsapp_connections'))return result(args[0]==='company-a'?[conn]:[])
    if(sql.includes('FROM whatsapp_notification_settings'))return result(args[0]==='company-a'?[preferences]:[])
    if(sql.includes('FROM whatsapp_notification_contacts'))return result(args[0]==='company-a'?[contact]:[])
    if(sql.includes('SELECT to_jsonb(b)'))return result([{source:{...source},has_receipts:false,collected:0,order_id:'',service_job_id:''}])
    if(sql.startsWith('SELECT name FROM companies'))return result([{name:'Demo company'}])
    if(sql.startsWith('INSERT INTO connect_whatsapp_messages')){assert(!messages.has(args[0]));messages.set(args[0],{status:'PENDING',payload:JSON.parse(args[3])});return result()}
    if(sql.startsWith('UPDATE connect_whatsapp_messages')){if(mode==='persistence-failure'&&sql.includes("status='ACCEPTED'"))throw Error('simulated persistence error');messages.get(args[0]).status=sql.includes("status='ACCEPTED'")?'ACCEPTED':args[1];return result()}
    if(sql.startsWith('UPDATE whatsapp_notification_outbox')){const row=outbox.get(args[0]);if(row){if(sql.includes("status='SENDING'"))row.status='SENDING';else if(sql.includes("status='ACCEPTED'"))row.status='ACCEPTED';else if(sql.includes("status='SKIPPED'")){row.status='SKIPPED';row.reason=args[2]}else{row.status=args[2];row.reason=args[3]}}return result()}
    if(sql.startsWith('UPDATE whatsapp_notification_contacts')){assert(sql.includes("interval '1 second'"),'Second-precision STOP includes consent saved within that second');contact.service_consent=false;contact.marketing_consent=false;return result()}
    throw Error('Unexpected fixture SQL: '+sql)
  }
  ;(pool as any).query=query;(pool as any).connect=async()=>({query,release(){}})
  globalThis.fetch=(async(url:any,options:any={})=>{
    const path=new URL(String(url)).pathname
    assert.equal(new URL(String(url)).hostname,'graph.facebook.com')
    if(path.endsWith('/message_templates'))return new Response(JSON.stringify({data:mode==='foreign-template'?[]:[{id:'300',name:'customer_update',language:'en_US',status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:'Hello {{1}}, {{2}} update: {{3}}. {{4}}'}]}]}),{status:200})
    assert(path.endsWith('/messages'));assert(commits>0,'durable intent commits before Meta POST');sends++
    if(mode==='timeout')throw Error('private network failure')
    if(mode==='rejected')return new Response(JSON.stringify({error:{code:131030}}),{status:400})
    if(mode==='server-error')return new Response(JSON.stringify({error:{code:2}}),{status:500})
    return new Response(JSON.stringify({messages:[{id:'wamid.'+sends}]}),{status:200})
  }) as any
  try{
    const linkFact=fact('bill',{}, {id:'bill-a',fields:{assessment:'x'.repeat(5000)}})
    const details=notificationDetails({type:'sale_created'} as PlannedNotification,linkFact,'company-a')
    assert(details.length<=3000,'Long descriptions must preserve the complete signed receipt link')
    const receiptUrl=new URL(details.match(/https:\/\/\S+$/)![0])
    assert.equal(receiptUrl.origin,'https://markit.example');assert.equal(receiptUrl.pathname,'/receipt/bill-a')
    const receiptShare=verifyReceiptShare(receiptUrl.searchParams.get('share')!)
    assert.equal(receiptShare.billId,'bill-a');assert.equal(receiptShare.companyId,'company-a')
    const id=add();assert((await deliverNotification('company-a',id)).accepted,JSON.stringify(outbox.get(id)));assert.equal(sends,1);assert.equal(messages.get(id).status,'ACCEPTED');await deliverNotification('company-a',id);assert.equal(sends,1)
    const other=add();await deliverNotification('company-b',other);assert.equal(sends,1);assert.equal(outbox.get(other).status,'QUEUED')
    contact.service_consent=false;const optedOut=add();await deliverNotification('company-a',optedOut);assert.equal(sends,1);assert.equal(outbox.get(optedOut).status,'SKIPPED');contact.service_consent=true
    contact.current_phone='changed';await deliverNotification('company-a',add());assert.equal(sends,1);contact.current_phone=contact.client_phone
    afterIntent=()=>{contact.service_consent=false};const revoked=add();await deliverNotification('company-a',revoked);assert.equal(sends,1);assert.equal(outbox.get(revoked).status,'FAILED');contact.service_consent=true
    mode='foreign-template';await deliverNotification('company-a',add());assert.equal(sends,1)
    mode='timeout';const uncertain=add();assert.equal((await deliverNotification('company-a',uncertain)).status,'UNKNOWN');await deliverNotification('company-a',uncertain);assert.equal(sends,2)
    mode='rejected';const rejected=add();assert.equal((await deliverNotification('company-a',rejected)).status,'FAILED')
    mode='persistence-failure';const lost=add();assert.equal((await deliverNotification('company-a',lost)).status,'UNKNOWN');await deliverNotification('company-a',lost);assert.equal(sends,4)
    mode='server-error';const serverFailure=add();assert.equal((await deliverNotification('company-a',serverFailure)).status,'UNKNOWN');await deliverNotification('company-a',serverFailure);assert.equal(sends,5)
    await revokeNotificationContact({query},'company-a','919876543210');assert.equal(contact.service_consent,false);assert.equal(contact.marketing_consent,false)
    ;(globalThis as any).requireAuthSession=async()=>({data:{id:'staff',companyId:'company-a',role:'biller'}})
    function event(url:string,method='GET',action='settings'){const req:any=Readable.from([]);req.url=url;req.method=method;req.headers={host:'markit.example',origin:'https://markit.example','x-forwarded-proto':'https','x-company-id':'company-a'};const e=createEvent(req,{setHeader(){}} as any);e.context.params={action};e.context.authorizedCompanyIds=Promise.resolve(['company-a']);return e}
    await assert.rejects(notificationHandler(event('/api/whatsapp-notifications/settings')),{statusCode:403})
    ;(globalThis as any).requireAuthSession=async()=>({data:{id:'admin',companyId:'company-a',role:'admin'}})
    const denied=event('/api/whatsapp-notifications/settings');denied.node.req.headers['x-company-id']='company-b';await assert.rejects(notificationHandler(denied),{statusCode:403})
    const origin=event('/api/whatsapp-notifications/settings','PUT');origin.node.req.headers.origin='https://foreign.example';await assert.rejects(notificationHandler(origin),{statusCode:403})
    await assert.rejects(cronHandler(event('/api/cron/whatsapp-notifications')),{statusCode:401})
  }finally{(pool as any).query=originalQuery;(pool as any).connect=originalConnect;globalThis.fetch=originalFetch;(globalThis as any).requireAuthSession=originalAuth;for(const key of ['WHATSAPP_ENCRYPTION_KEY','RECEIPT_SHARE_SECRET','WHATSAPP_NOTIFICATION_ORIGIN','CRON_SECRET']){if(savedEnv[key]===undefined)delete process.env[key];else process.env[key]=savedEnv[key]}}
})
