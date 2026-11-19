import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { Prisma } from '@prisma/client'
import { test } from 'node:test'
import { Readable } from 'node:stream'
import { createEvent } from 'h3'
import { defaultCrmSettings, normalizeCrmRecord, normalizeCrmSettings, crmPhone, crmScore, crmCsv, parseCrmCsv, crmClientLocation } from '../utils/crm'
import { createMemoryHistory, createRouter } from 'vue-router'
import { crmWhere, crmList, saveCrmRecord, saveCrmSettings, archiveCrmRecords } from '../server/utils/crm'
import { crmImport, crmRead, linkCrmDocument } from '../server/utils/crm-workflows'
import { processCrmReminders } from '../server/utils/crm-reminders'
import handler from '../server/api/crm/[...path]'
import cron from '../server/api/cron/crm.get'
import { pool } from '../server/db'
import { crmFixture } from './crm-fixture'
const manager={companyId:'a',userId:'manager',role:'manager',manager:true},sales={...manager,userId:'sales',role:'user',manager:false}
const contact={name:'Alex',email:'alex@example.com',phone:'+919876543210',ownerId:'sales',source:'Other',tags:[],lifecycle:'LEAD',leadStatus:'QUALIFIED'}

test('Old leads links open the shared client directory and preserve company and client context',async()=>{
  const router=createRouter({history:createMemoryHistory(),routes:[
    {path:'/crm/leads',redirect:to=>crmClientLocation(to.query)},
    {path:'/client',component:{template:'<div />'}},
  ]})
  await router.push('/crm/leads?entryCompany=branch&crmClient=existing-client&from=old')
  assert.equal(router.currentRoute.value.path,'/client')
  assert.deepEqual(router.currentRoute.value.query,{entryCompany:'branch',crmClient:'existing-client',from:'crm'})
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
    user='sales';await assert.rejects(handler(event('reports')),{statusCode:403});user='revoked';await assert.rejects(handler(event('bootstrap')),{statusCode:403})
    user='manager';db.state.ready=false;const bootstrap:any=await handler(event('bootstrap'));assert.equal(bootstrap.ready,false);await assert.rejects(handler(event('clients')),{statusCode:503})
    await assert.rejects(cron(event('anything')),{statusCode:401})
  }finally{(pool as any).query=originalQuery;(pool as any).connect=originalConnect;(globalThis as any).requireAuthSession=auth}
})
