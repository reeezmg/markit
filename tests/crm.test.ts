import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { Prisma } from '@prisma/client'
import { test } from 'node:test'
import { Readable } from 'node:stream'
import { createEvent } from 'h3'
import { defaultCrmSettings, normalizeCrmRecord, normalizeCrmSettings, crmPhone, crmScore, crmCsv, parseCrmCsv, crmClientLocation, type CrmSalesRule } from '../utils/crm'
import { createMemoryHistory, createRouter } from 'vue-router'
import { crmWhere, crmList, crmRow, saveCrmRecord, saveCrmSettings, archiveCrmRecords } from '../server/utils/crm'
import { crmImport, crmRead, linkCrmDocument } from '../server/utils/crm-workflows'
import { processCrmReminders } from '../server/utils/crm-reminders'
import handler from '../server/api/crm/[...path]'
import cron from '../server/api/cron/crm.get'
import { pool } from '../server/db'
import { crmFixture } from './crm-fixture'
import { processCrmSalesRules, crmSalesEventChanged } from '../server/utils/crm-sales-rules'
const manager={companyId:'a',userId:'manager',role:'manager',manager:true},sales={...manager,userId:'sales',role:'user',manager:false}
const contact={name:'Alex',email:'alex@example.com',phone:'+919876543210',ownerId:'sales',source:'Other',tags:[],lifecycle:'LEAD',leadStatus:'QUALIFIED'}
const salesRule=(patch:Partial<CrmSalesRule>={}):CrmSalesRule=>({key:'quote_sent',name:'Sent quote → proposal',enabled:true,event:'QUOTE_SENT',pipelineKey:'sales',fromStageKey:'',stageKey:'proposal',forwardOnly:true,lossReason:'',...patch})

test('Sales rules validate target stages, loss reasons, conflicts and old settings',()=>{
  const settings=defaultCrmSettings();settings.salesRules=[salesRule()]
  assert.equal(normalizeCrmSettings(settings).salesRules.length,1)
  const legacy:any={...settings};delete legacy.salesRules;assert.deepEqual(normalizeCrmSettings(legacy).salesRules,[])
  for(const bad of [salesRule({stageKey:'missing'}),salesRule({event:'UNKNOWN' as any}),salesRule({stageKey:'lost'}),salesRule({fromStageKey:'won'})])assert.throws(()=>normalizeCrmSettings({...settings,salesRules:[bad]}))
  assert.throws(()=>normalizeCrmSettings({...settings,salesRules:[salesRule(),salesRule({key:'duplicate'})]}),/different starting stages/)
})

test('Rules baseline linked records, move only their deal once, audit and preserve source records',async()=>{
  const db=crmFixture(),clientId=db.seedClient(),settings=defaultCrmSettings()
  const deal=await saveCrmRecord(db,manager,'deals',{name:'Linked deal',ownerId:'sales',clientId,pipelineKey:'sales',stageKey:'new',value:250})
  const other=await saveCrmRecord(db,manager,'deals',{name:'Same client, unrelated deal',ownerId:'sales',clientId,pipelineKey:'sales',stageKey:'new',value:100})
  db.state.documents.quotes.push({id:'quote',company_id:'a',client_id:clientId,status:'DRAFT',payment_status:'',deleted:false})
  db.state.tables.crm_document_links.push({id:'link',company_id:'a',deal_id:deal.id,kind:'QUOTE',document_id:'quote'})
  settings.salesRules=[salesRule()];await saveCrmSettings(db,manager,{settings,version:0})
  assert.equal((await processCrmSalesRules(db,'a')).updated,0)
  db.state.documents.quotes[0].status='SENT'
  const source=JSON.stringify(db.state.documents)
  assert.equal((await processCrmSalesRules(db,'a')).updated,1)
  assert.equal((await crmRead(db,manager,'deals',deal.id)).stage_key,'proposal')
  assert.equal((await crmRead(db,manager,'deals',other.id)).stage_key,'new')
  assert.equal(JSON.stringify(db.state.documents),source)
  assert.equal((await processCrmSalesRules(db,'a')).updated,0)
  assert(db.state.tables.crm_audit.some((r:any)=>r.entity_id===deal.id&&r.action==='Sales rule applied'))
  // Reconfiguration starts a fresh baseline; no historical SENT replay.
  await saveCrmSettings(db,manager,{settings:{...settings,salesRules:[salesRule({stageKey:'negotiation'})]},version:1})
  assert.equal((await processCrmSalesRules(db,'a')).updated,0)
  assert.equal((await crmRead(db,manager,'deals',deal.id)).stage_key,'proposal')
})

test('Sales order links work; closed, backward, foreign-company and changed-client deals are protected',async()=>{
  const db=crmFixture(),clientId=db.seedClient(),settings=defaultCrmSettings()
  const deal=await saveCrmRecord(db,manager,'deals',{name:'Order deal',ownerId:'sales',clientId,pipelineKey:'sales',stageKey:'negotiation',value:100})
  db.state.documents.sales_orders.push({id:'order',company_id:'a',client_id:clientId,status:'DRAFT',payment_status:'',deleted:false})
  settings.salesRules=[salesRule({event:'SALES_ORDER_CONFIRMED'})];await saveCrmSettings(db,manager,{settings,version:0})
  await linkCrmDocument(db,manager,deal.id,{kind:'SALES_ORDER',documentId:'order'})
  await assert.rejects(linkCrmDocument(db,manager,deal.id,{kind:'SALES_ORDER',documentId:'foreign'}),{statusCode:400})
  db.state.documents.sales_orders[0].status='CONFIRMED'
  assert.equal((await processCrmSalesRules(db,'a')).skipped,1)
  assert.equal((await crmRead(db,manager,'deals',deal.id)).stage_key,'negotiation')
  settings.salesRules=[salesRule({event:'SALES_ORDER_CLOSED',stageKey:'won'})]
  await saveCrmSettings(db,manager,{settings,version:1})
  db.state.documents.sales_orders[0].client_id='different-client';db.state.documents.sales_orders[0].status='CLOSED'
  assert.equal((await processCrmSalesRules(db,'a')).skipped,1)
  db.state.documents.sales_orders[0].client_id=clientId
  assert.equal((await processCrmSalesRules(db,'a')).updated,0,'Changing only the client cannot trigger a stage update')
  db.state.documents.sales_orders[0].status='CONFIRMED';await processCrmSalesRules(db,'a')
  db.state.documents.sales_orders[0].status='CLOSED';assert.equal((await processCrmSalesRules(db,'a')).updated,1)
  db.state.documents.sales_orders[0].status='CONFIRMED';await processCrmSalesRules(db,'a')
  db.state.documents.sales_orders[0].status='CLOSED';assert.equal((await processCrmSalesRules(db,'a')).updated,0,'Closed deal stays closed')
  assert.equal((await processCrmSalesRules(db,'b')).updated,0)
})

test('Invoice payment events require payment changes and automatic losses require the configured reason',async()=>{
  const state={status:'CONFIRMED',paymentStatus:'PAID',deleted:false,clientId:'alex'}
  assert(!crmSalesEventChanged('INVOICE_PAID','BILL',{...state,status:'PENDING'},state))
  assert(crmSalesEventChanged('INVOICE_PAID','BILL',{...state,paymentStatus:'PENDING'},state))
  const db=crmFixture(),settings=defaultCrmSettings()
  const deal=await saveCrmRecord(db,manager,'deals',{name:'Invoice deal',ownerId:'sales',pipelineKey:'sales',stageKey:'new',value:50})
  db.state.documents.bills.push({id:'bill',company_id:'a',client_id:null,status:'CONFIRMED',payment_status:'PENDING',deleted:false})
  db.state.tables.crm_document_links.push({id:'bill-link',company_id:'a',deal_id:deal.id,kind:'BILL',document_id:'bill'})
  settings.salesRules=[salesRule({event:'INVOICE_CANCELLED',stageKey:'lost',lossReason:'Invoice cancelled by customer'})]
  await saveCrmSettings(db,manager,{settings,version:0})
  db.state.documents.bills[0].deleted=true
  assert.equal((await processCrmSalesRules(db,'a')).updated,1)
  const lost=await crmRead(db,manager,'deals',deal.id);assert.equal(lost.status,'LOST');assert.equal(lost.loss_reason,'Invoice cancelled by customer')
})

test('Sales rule observations roll back with deal changes; re-enabling rules does not replay old states',async()=>{
  const db=crmFixture(),settings=defaultCrmSettings()
  const deal=await saveCrmRecord(db,manager,'deals',{name:'Atomic rule update',ownerId:'sales',pipelineKey:'sales',stageKey:'new',value:75})
  db.state.documents.quotes.push({id:'atomic-quote',company_id:'a',client_id:null,status:'DRAFT',payment_status:'',deleted:false})
  db.state.tables.crm_document_links.push({id:'atomic-link',company_id:'a',deal_id:deal.id,kind:'QUOTE',document_id:'atomic-quote'})
  settings.salesRules=[salesRule()];await saveCrmSettings(db,manager,{settings,version:0})
  db.state.documents.quotes[0].status='SENT'
  const original=db.query
  const failed={query:async(sql:string,args:any[]=[])=>{if(sql.startsWith('INSERT INTO crm_audit')&&args[4]==='Sales state observed')throw Error('Observation write failed');return original(sql,args)}}
  await db.query('BEGIN')
  await assert.rejects(processCrmSalesRules(failed,'a'),/Observation write failed/)
  await db.query('ROLLBACK')
  assert.equal((await crmRead(db,manager,'deals',deal.id)).stage_key,'new')
  assert.equal((await processCrmSalesRules(db,'a')).updated,1,'Retry after rollback can safely apply the change')
  await saveCrmSettings(db,manager,{settings:{...settings,salesRules:[salesRule({enabled:false})]},version:1})
  db.state.documents.quotes[0].status='DRAFT'
  await saveCrmSettings(db,manager,{settings,version:2})
  assert.equal((await processCrmSalesRules(db,'a')).updated,0)
})

test('Displayed rule priority wins when multiple linked documents change before a check',async()=>{
  const db=crmFixture(),settings=defaultCrmSettings()
  const deal=await saveCrmRecord(db,manager,'deals',{name:'Priority deal',ownerId:'sales',pipelineKey:'sales',stageKey:'new',value:75})
  db.state.documents.quotes.push({id:'quote',company_id:'a',client_id:null,status:'DRAFT',payment_status:'',deleted:false})
  db.state.documents.bills.push({id:'bill',company_id:'a',client_id:null,status:'CONFIRMED',payment_status:'PENDING',deleted:false})
  db.state.tables.crm_document_links.push({id:'a-quote',company_id:'a',deal_id:deal.id,kind:'QUOTE',document_id:'quote'},{id:'z-bill',company_id:'a',deal_id:deal.id,kind:'BILL',document_id:'bill'})
  settings.salesRules=[salesRule({key:'paid_wins',event:'INVOICE_PAID',stageKey:'won'}),salesRule()]
  await saveCrmSettings(db,manager,{settings,version:0})
  db.state.documents.quotes[0].status='SENT';db.state.documents.bills[0].payment_status='PAID'
  assert.equal((await processCrmSalesRules(db,'a')).updated,1)
  assert.equal((await crmRead(db,manager,'deals',deal.id)).status,'WON')
  assert.equal((await processCrmSalesRules(db,'a')).updated,0)
})

test('Segment tasks validate company settings, survive edits/recurrence and retain legacy references',async()=>{
  const db=crmFixture(),settings=defaultCrmSettings()
  settings.segments=[{key:'priority',name:'Priority leads',filters:{tag:'Priority'}}]
  await saveCrmSettings(db,manager,{settings,version:0})
  const input={ownerId:'manager',kind:'TASK',subject:'Call priority group',segmentKey:'priority',dueAt:'2027-01-05T10:00:00Z',recurrenceDays:7,attachments:[{name:'Instructions',url:'https://example.com/brief'}]}
  const otherCompany=crmFixture()
  await assert.rejects(saveCrmRecord(otherCompany,{...manager,companyId:'b'},'activities',input),/current segment/)
  await assert.rejects(saveCrmRecord(db,manager,'activities',{...input,segmentKey:'unknown'}),/current segment/)
  const task=await saveCrmRecord(db,manager,'activities',input)
  assert.equal(task.segmentKey,'priority');assert.equal(task.segmentName,'Priority leads');assert.equal(task.attachments.length,1)
  const filtered=await crmList(db,manager,'activities',{segmentKey:'priority'})
  assert.equal(filtered.total,1);assert.equal(filtered.rows[0].segmentKey,'priority')
  assert.equal((await crmList(db,manager,'activities',{segmentKey:'other'})).total,0)
  await saveCrmRecord(db,manager,'activities',{...task,status:'DONE'},task.id)
  const next=db.state.tables.crm_activities.find((r:any)=>r.recurrence_key==='repeat:'+task.id)
  assert.equal(crmRow(next).segmentKey,'priority');assert.equal(crmRow(next).attachments.length,1)
  await saveCrmSettings(db,manager,{settings:{...settings,segments:[]},version:1})
  const edited=await saveCrmRecord(db,manager,'activities',{...crmRow(next),subject:'Historical group follow-up'},next.id)
  assert.equal(edited.segmentName,'Priority leads')
  const cleared=await saveCrmRecord(db,manager,'activities',{...edited,segmentKey:''},edited.id)
  assert.equal(cleared.segmentKey,undefined);assert.equal(cleared.attachments.length,1)
  assert.deepEqual(crmRow({attachments:[{name:'Legacy',url:'https://example.com'}]}).attachments,[{name:'Legacy',url:'https://example.com'}])
})

test('Retired leads and business account links open the shared client directory with context',async()=>{
  const router=createRouter({history:createMemoryHistory(),routes:[
    {path:'/crm/leads',redirect:to=>crmClientLocation(to.query)},
    {path:'/crm/accounts',redirect:to=>crmClientLocation(to.query)},
    {path:'/crm/accounts/:accountId',redirect:to=>crmClientLocation(to.query)},
    {path:'/client',component:{template:'<div />'}},
  ]})
  await router.push('/crm/leads?entryCompany=branch&crmClient=existing-client&from=old')
  assert.equal(router.currentRoute.value.path,'/client')
  assert.deepEqual(router.currentRoute.value.query,{entryCompany:'branch',crmClient:'existing-client',from:'crm'})
  for(const path of ['/crm/accounts','/crm/accounts/old-account']){
    await router.push(path+'?entryCompany=branch')
    assert.equal(router.currentRoute.value.path,'/client')
    assert.deepEqual(router.currentRoute.value.query,{entryCompany:'branch',from:'crm'})
  }
})

test('Contacts reuse the client page and physical CRM columns remain excluded from generated client operations',()=>{
  assert(!existsSync('pages/crm/contacts/index.vue'));assert(!existsSync('pages/crm/contacts/[contactId].vue'))
  assert(!/^model CrmContact\s*\{/m.test(readFileSync('schema.zmodel','utf8')))
  const membership=Prisma.dmmf.datamodel.models.find(model=>model.name==='CompanyClient')!
  for(const name of ['crmData','crmVersion','crmAccountId'])assert(!membership.fields.some(field=>field.name===name),'Generated client reads must not select '+name)
  const physicalSchema=readFileSync('prisma/schema.prisma','utf8')
  for(const name of ['crmData','crmVersion','crmAccountId'])assert(new RegExp('^\\s*'+name+'\\s+[^\\n]*@ignore','m').test(physicalSchema),'db push must retain ignored physical column '+name)
  assert(!Prisma.dmmf.datamodel.models.some(model=>model.name==='CrmContact'))
})

test('CRM validates contact identity, custom fields, scoring and configured deal outcomes',()=>{
  const settings=defaultCrmSettings();settings.customFields.push({key:'budget',label:'Budget',type:'NUMBER',required:true})
  assert.throws(()=>normalizeCrmRecord('clients',contact,settings),/Budget/)
  assert.equal(normalizeCrmRecord('clients',{...contact,customFields:{budget:0}},settings).customFields.budget,0)
  assert.equal(crmPhone('+91 98765-43210'),'+919876543210');assert.throws(()=>crmPhone('9876543210'),/country/)
  assert.equal(crmScore({...contact,lead_status:'QUALIFIED'},defaultCrmSettings()),65)
  assert.throws(()=>normalizeCrmRecord('deals',{name:'Offer',ownerId:'sales',pipelineKey:'sales',stageKey:'lost',value:100}),/loss reason/)
  const won=normalizeCrmRecord('deals',{name:'Offer',ownerId:'sales',pipelineKey:'sales',stageKey:'won',value:100,probability:1,status:'OPEN'})
  assert.equal(won.status,'WON');assert.equal(won.probability,100)
  for(const value of [-1,Infinity,'garbage'])assert.throws(()=>normalizeCrmRecord('deals',{name:'Offer',ownerId:'sales',pipelineKey:'sales',stageKey:'new',value}))
})
test('CRM settings reject duplicate or incomplete pipelines, unsafe links and invalid recurrence',()=>{
  const settings=defaultCrmSettings();settings.pipelines[0].stages.pop();assert.throws(()=>normalizeCrmSettings(settings),/lost/)
  assert.throws(()=>normalizeCrmRecord('accounts',{name:'Account',ownerId:'sales',website:'javascript:alert(1)'}),/HTTPS/)
  assert.throws(()=>normalizeCrmRecord('activities',{ownerId:'sales',subject:'Call',recurrenceDays:7}),/due date/)
  assert.throws(()=>normalizeCrmRecord('activities',{ownerId:'sales',subject:'Call',dueAt:'2026-11-19T10:00:00Z',endAt:'2026-11-18T10:00:00Z'}),/end time/)
})
test('CSV handles quoted commas, newlines and escaped quotes; spreadsheets cannot execute contact values',()=>{
  const rows=parseCrmCsv('name,email,phone\r\n"Alex, A",alex@example.com,+919876543210\r\n"Multi\nline ""name""",,')
  assert.equal(rows[0].name,'Alex, A');assert.equal(rows[1].name,'Multi\nline "name"')
  assert.throws(()=>parseCrmCsv('name\n"unfinished'),/unclosed/)
  const csv=crmCsv([{name:'=HYPERLINK("evil")',phone:'+919876543210'}],[['name','Name'],['phone','Phone']]);assert(csv.includes("'=HYPERLINK"));assert(csv.includes("'+919"))
})
test('Company filters bind user input and calculate score/due restrictions before pagination',()=>{
  const {sql,args}=crmWhere('clients','a',{q:"%' OR 1=1 --",ownerId:'sales',minScore:50,tag:'VIP'},defaultCrmSettings())
  assert(sql.includes('r.company_id=$1'));assert(!sql.includes('OR 1=1'));assert(args.includes("%%' OR 1=1 --%"));assert(sql.includes('LEAST(100'))
  assert(crmWhere('activities','a',{due:'OVERDUE'},defaultCrmSettings()).sql.includes('r.due_at<now()'))
})
test('Lead → account → deal → won → recurring follow-up keeps versions, ownership and audit history',async()=>{
  await assert.rejects(saveCrmRecord(crmFixture(),{...manager,userId:'head-office-admin',role:'admin'},'activities',{subject:'Unlinked owner',ownerId:'head-office-admin'}),{statusCode:400})
  const db=crmFixture(),account=await saveCrmRecord(db,manager,'accounts',{name:'Example Business',ownerId:'sales'})
  const clientId=db.seedClient();const lead=await saveCrmRecord(db,manager,'clients',{...contact,clientId,accountId:account.id,version:0},clientId)
  assert.equal(db.state.tables.crm_activities.length,1,'new lead gets its internal next action')
  const deal=await saveCrmRecord(db,sales,'deals',{name:'Purifier supply',clientId:lead.id,accountId:account.id,ownerId:'sales',pipelineKey:'sales',stageKey:'proposal',value:12500})
  await assert.rejects(saveCrmRecord(db,{...sales,userId:'other'},'deals',{...deal,name:'Unauthorized'},deal.id),{statusCode:403})
  const won=await saveCrmRecord(db,sales,'deals',{...deal,stageKey:'won'},deal.id)
  assert.equal(won.status,'WON');assert.equal(won.probability,100);assert(won.closedAt)
  assert.equal(db.state.tables.crm_activities.length,2,'winning creates one follow-up, not a bill or payment')
  await assert.rejects(saveCrmRecord(db,sales,'deals',{...deal,stageKey:'new'},deal.id),{statusCode:409})
  const task=await saveCrmRecord(db,sales,'activities',{subject:'Recurring check-in',ownerId:'sales',clientId:lead.id,dueAt:'2026-11-20T10:00:00Z',recurrenceDays:7})
  const done=await saveCrmRecord(db,sales,'activities',{...task,status:'DONE'},task.id)
  assert.equal(db.state.tables.crm_activities.filter((r:any)=>r.recurrence_key==='repeat:'+task.id).length,1)
  await saveCrmRecord(db,sales,'activities',{...done,body:'Extra completion note'},task.id)
  assert.equal(db.state.tables.crm_activities.filter((r:any)=>r.recurrence_key==='repeat:'+task.id).length,1)
  assert(db.state.tables.crm_audit.length>=7)
  await assert.rejects(saveCrmRecord(db,{...manager,companyId:'b'},'deals',{...won},deal.id),{statusCode:404})
})
test('Existing client identities are immediately available; CRM edits preserve membership and consent',async()=>{
  const db=crmFixture(),id=db.seedClient(),before=JSON.stringify(db.state.clients),membership={...db.state.memberships[0]}
  const list=await crmList(db,manager,'clients',{});assert.equal(list.total,1);assert.equal(list.rows[0].id,id)
  await saveCrmRecord(db,manager,'clients',{...contact,version:0},id)
  assert.equal(JSON.stringify(db.state.clients),before);assert.equal(db.state.clients.length,1);assert.equal(db.state.memberships.length,1)
  for(const key of ['status','points','pipeline_status','marketing_opt_in_at'])assert.equal(db.state.memberships[0][key],membership[key])
  assert(!('name' in db.state.memberships[0].crm_data));assert(!('phone' in db.state.memberships[0].crm_data))
})
test('One shared identity has independently scoped company CRM attributes and versions',async()=>{
  const db=crmFixture(),id=db.seedClient('a');db.seedClient('b',id)
  const a=await saveCrmRecord(db,manager,'clients',{...contact,description:'Company A',version:0},id)
  const b=await crmRead(db,{...manager,companyId:'b'},'clients',id);assert.equal(b.version,0);assert.equal(b.description,'')
  await assert.rejects(saveCrmRecord(db,manager,'clients',{...a,version:0},id),{statusCode:409})
  await assert.rejects(crmRead(db,{...manager,companyId:'c'},'clients',id),{statusCode:404})
  assert.equal(db.state.memberships[1].crm_version,0)
})
test('Canonical client edits are reflected immediately; CRM cannot create, rename, merge or deactivate contacts',async()=>{
  const db=crmFixture(),id=db.seedClient('a','legacy',{phone:'9876543210'}),row=await saveCrmRecord(db,manager,'clients',{...contact,phone:'9876543210',version:0},id)
  assert.equal(row.phone,'9876543210');await assert.rejects(saveCrmRecord(db,manager,'clients',contact),{statusCode:400})
  await assert.rejects(saveCrmRecord(db,manager,'clients',{...row,name:'Different identity'},id),{statusCode:400})
  await assert.rejects(archiveCrmRecords(db,manager,'clients',{records:[row],archived:true}),{statusCode:400})
  db.state.clients[0].name='Updated on client page';assert.equal((await crmRead(db,manager,'clients',id)).name,'Updated on client page')
  assert.equal(db.state.clients.length,1);assert.equal(db.state.memberships[0].status,true)
})
test('Unassigned clients may be claimed by staff; other owners and inactive memberships are protected',async()=>{
  const db=crmFixture(),id=db.seedClient(),row=await saveCrmRecord(db,sales,'clients',{...contact,version:0},id)
  await assert.rejects(saveCrmRecord(db,{...sales,userId:'other'},'clients',{...row,ownerId:'other'},id),{statusCode:403})
  db.state.memberships[0].status=false;await assert.rejects(saveCrmRecord(db,manager,'clients',row,id),{statusCode:403})
  await assert.rejects(saveCrmRecord(db,manager,'deals',{name:'Inactive client',ownerId:'sales',clientId:id,pipelineKey:'sales',stageKey:'new'}),{statusCode:400})
})
test('Client CRM CSV requires scoped existing IDs, rejects duplicate rows and never creates contacts',async()=>{
  const db=crmFixture(),id=db.seedClient(),records=[{clientId:id,name:'Alex',description:'Imported notes'},{clientId:id,name:'Alex'},{clientId:'other-company',name:'Alex'},{name:'New client'}]
  const preview=await crmImport(db,manager,{preview:true,records});assert.equal(preview.valid,1);assert.equal(preview.errors.length,3)
  await assert.rejects(crmImport(db,manager,{records}),{statusCode:409});assert.equal(db.state.memberships[0].crm_version,0)
  await crmImport(db,manager,{records:[records[0]]});assert.equal(db.state.memberships[0].crm_data.description,'Imported notes');assert.equal(db.state.clients.length,1)
})
test('CSV custom values preserve numeric zero and explicit false on existing memberships',async()=>{
  const db=crmFixture(),id=db.seedClient('a','jamie',{name:'Jamie'}),settings=defaultCrmSettings()
  settings.customFields=[{key:'budget',label:'Budget',type:'NUMBER',required:true},{key:'follow',label:'Contact later',type:'BOOLEAN',required:true}]
  await saveCrmSettings(db,manager,{settings,version:0})
  const records=parseCrmCsv('Client ID,Name,Custom: Budget,custom:Contact later\n'+id+',Jamie,0,false')
  const preview=await crmImport(db,manager,{preview:true,records});assert.equal(preview.valid,1,JSON.stringify(preview.errors));await crmImport(db,manager,{records})
  assert.equal(db.state.memberships[0].crm_data.customFields.budget,0);assert.equal(db.state.memberships[0].crm_data.customFields.follow,false)
})
test('Settings preserve stages in use and internal due alerts deduplicate',async()=>{
  const db=crmFixture();await saveCrmRecord(db,manager,'deals',{name:'Existing opportunity',ownerId:'sales',pipelineKey:'sales',stageKey:'proposal',value:100})
  const settings=defaultCrmSettings();settings.pipelines[0].stages=settings.pipelines[0].stages.filter(s=>s.key!=='proposal')
  await assert.rejects(saveCrmSettings(db,manager,{settings,version:0}),/stage in use/)
  await saveCrmRecord(db,manager,'activities',{subject:'Due call',ownerId:'sales',dueAt:new Date(Date.now()-1000).toISOString()})
  assert.equal((await processCrmReminders(db,'a')).notified,1);assert.equal((await processCrmReminders(db,'a')).notified,0)
})
test('Real CRM handlers enforce tenant, live staff role, CSRF, manager reports and pending setup',async()=>{
  const db=crmFixture(),originalQuery=pool.query,originalConnect=pool.connect,auth=(globalThis as any).requireAuthSession
  let user='manager';(globalThis as any).requireAuthSession=async()=>({data:{id:user,companyId:'a',role:user==='manager'?'manager':'user'}})
  ;(pool as any).query=db.query;(pool as any).connect=async()=>db
  function event(path:string,method='GET',body?:any,company='a',origin='https://markit.test'){
    const text=body===undefined?'':JSON.stringify(body),req:any=Readable.from(text?[Buffer.from(text)]:[]);req.url='/api/crm/'+path;req.method=method;req.headers={host:'markit.test','x-forwarded-proto':'https','x-company-id':company,origin,'content-type':'application/json','content-length':String(Buffer.byteLength(text))}
    const e=createEvent(req,{setHeader(){}} as any);e.context.authorizedCompanyIds=Promise.resolve(['a']);return e
  }
  try{
    const clientId=db.seedClient();await assert.rejects(handler(event('clients','POST',contact)),{statusCode:400});const created:any=await handler(event('clients/'+clientId,'PUT',{...contact,version:0}));assert.equal(created.id,clientId)
    const list:any=await handler(event('clients'));assert.equal(list.total,1)
    await assert.rejects(handler(event('clients','GET',undefined,'b')),{statusCode:403})
    await assert.rejects(handler(event('clients','POST',contact,'a','https://evil.test')),{statusCode:403})
    assert.equal((await handler(event('sales-rules/run','POST',{})) as any).updated,0)
    user='sales';await assert.rejects(handler(event('sales-rules/run','POST',{})),{statusCode:403});await assert.rejects(handler(event('reports')),{statusCode:403});user='revoked';await assert.rejects(handler(event('bootstrap')),{statusCode:403})
    user='manager';db.state.ready=false;const bootstrap:any=await handler(event('bootstrap'));assert.equal(bootstrap.ready,false);await assert.rejects(handler(event('clients')),{statusCode:503})
    await assert.rejects(cron(event('anything')),{statusCode:401})
  }finally{(pool as any).query=originalQuery;(pool as any).connect=originalConnect;(globalThis as any).requireAuthSession=auth}
})
