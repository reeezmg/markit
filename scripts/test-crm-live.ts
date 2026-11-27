import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { createEvent } from 'h3'
import handler from '../server/api/crm/[...path]'
import { pool } from '../server/db'
import { prisma } from '../server/prisma'
import { crmRow } from '../server/utils/crm'
import { processCrmReminders } from '../server/utils/crm-reminders'
import { defaultCrmSettings, crmCsv, parseCrmCsv } from '../utils/crm'

// Persistent DML exercise. Never installs schemas or sends external messages.
// Requires task-specific authorization; all source transitions target newly created QA records.
if(process.argv.includes('--direct')){const url=new URL(process.env.DATABASE_URL!);assert(url.hostname.endsWith('.neon.tech'),'Direct endpoint selection is only supported for Neon');url.hostname=url.hostname.replace('-pooler','');pool.options.connectionString=url.toString()}
pool.options.connectionTimeoutMillis=15000
pool.options.query_timeout=60000
pool.options.keepAlive=true
pool.options.keepAliveInitialDelayMillis=1000
pool.on('error',error=>console.error('CRM test database connection:',error.message))
pool.on('connect',client=>client.on('error',error=>console.error('CRM test client connection:',error.message)))
const arg=(name:string)=>{const index=process.argv.indexOf(name);return index<0?'':process.argv[index+1]||''}
assert(process.argv.includes('--execute'),'Use --execute only with explicit persistent-test authorization')
const companyId=arg('--company-id'),companyName=arg('--company-name')
assert(companyId&&companyName,'Supply exact company ID and company name')
const resume=arg('--resume')?JSON.parse(readFileSync(arg('--resume'),'utf8')):null
if(resume)assert(resume.companyId===companyId&&resume.companyName===companyName,'Resume company must match')
const batch=resume?.batch||randomUUID(),prefix='CRM-QA-'+batch.slice(0,8),pipelineKey='qa_'+batch.replaceAll('-','').slice(0,12)
const folder=path.resolve('../artifacts/crm-audit',prefix),privateFolder=path.resolve('.cache/crm-audit',prefix)
mkdirSync(folder,{recursive:true});mkdirSync(privateFolder,{recursive:true})
const report:any=resume||{batch,prefix,companyId,companyName,status:'STARTED',checks:[],records:{clients:[],deals:[],activities:[],documents:[]},backup:path.join(privateFolder,'before.json')}
if(resume){report.attempts=[...(report.attempts||[]),{at:new Date().toISOString(),failed:report.checks.filter((c:any)=>c.status==='FAIL')}];report.checks=report.checks.filter((c:any)=>c.status==='PASS');report.status='RESUMED';delete report.error}
if(process.argv.includes('--trace'))pool.on('connect',(client:any)=>{const query=client.query;client.query=function(sql:any,...args:any[]){appendFileSync(path.join(folder,'trace.log'),new Date().toISOString()+' SQL '+String(sql).replace(/\s+/g,' ').slice(0,200)+'\n');return query.call(this,sql,...args)}})
const persist=()=>writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2))
let actorId='',sessionUser='',savedAuth=(globalThis as any).requireAuthSession
async function api(resource:string,method='GET',body?:any,query:Record<string,any>={},company=companyId,origin='https://crm-qa.markit.test'){
  if(process.argv.includes('--trace'))appendFileSync(path.join(folder,'trace.log'),new Date().toISOString()+' API '+method+' '+resource+'\n')
  const text=body===undefined?'':JSON.stringify(body),req:any=Readable.from(text?[Buffer.from(text)]:[])
  req.url='/api/crm/'+resource+(Object.keys(query).length?'?'+new URLSearchParams(query):'');req.method=method
  req.headers={host:'crm-qa.markit.test','x-forwarded-proto':'https','x-company-id':company,origin,'content-type':'application/json','content-length':String(Buffer.byteLength(text))}
  const event=createEvent(req,{setHeader(){}} as any)
  // Authentication is supplied by this local harness. Live staff checks still run.
  event.context.authorizedCompanyIds=Promise.resolve([companyId])
  const result=await handler(event);if(process.argv.includes('--trace'))appendFileSync(path.join(folder,'trace.log'),new Date().toISOString()+' DONE '+resource+'\n');return result as any
}
async function check(name:string,work:()=>Promise<void>){
  if(resume&&report.checks.some((c:any)=>c.name===name&&c.status==='PASS'))return
  const start=Date.now()
  try{await work();report.checks.push({name,status:'PASS',ms:Date.now()-start});persist();console.log('PASS '+name)}
  catch(e:any){report.checks.push({name,status:'FAIL',error:e.statusMessage||e.message});persist();throw e}
}
async function tx(work:(db:any)=>Promise<any>){const db=await pool.connect();try{await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='10s'");await db.query("SET LOCAL statement_timeout='30s'");await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['crm:'+companyId]);const result=await work(db);await db.query('COMMIT');return result}catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}}
async function settings(){return api('settings')}
async function saveSettings(value:any){const current=await settings();return api('settings','PUT',{settings:value,version:current.version})}
const readDeal=async(id:string)=>crmRow((await pool.query('SELECT *,expected_close::text AS expected_close FROM crm_deals WHERE company_id=$1 AND id=$2',[companyId,id])).rows[0])
const edit=async(kind:string,row:any,patch:any)=>api(kind+'/'+row.id,'PUT',{...row,...patch})
async function deal(name:string,clientId:string|null,stageKey='new'){
  const existing=resume?(await pool.query('SELECT id FROM crm_deals WHERE company_id=$1 AND name=$2',[companyId,prefix+' '+name])).rows[0]:null
  if(existing)return readDeal(existing.id)
  const row=await api('deals','POST',{name:prefix+' '+name,clientId,ownerId:actorId,pipelineKey,stageKey,value:12000,source:'Other',expectedClose:'2026-12-15',lossReason:stageKey==='lost'?'QA outcome':''})
  report.records.deals.push(row.id);persist();return row
}
async function activity(name:string,patch:any={}){
  if(resume&&name.startsWith('Context ')){const existing=(await pool.query('SELECT * FROM crm_activities WHERE company_id=$1 AND subject=$2 ORDER BY created_at LIMIT 1',[companyId,prefix+' '+name])).rows[0];if(existing)return crmRow(existing)}
  const row=await api('activities','POST',{subject:prefix+' '+name,ownerId:actorId,kind:'TASK',status:'OPEN',priority:'NORMAL',...patch})
  report.records.activities.push(row.id);persist();return row
}
async function source(kind:string,clientId:string){
  const id=randomUUID(),number=prefix+'-'+report.records.documents.length
  await tx(async db=>{
    if(kind==='QUOTE')await db.query("INSERT INTO quotes(id,company_id,client_id,quote_number,quote_date,status,attachments) VALUES($1,$2,$3,$4,now(),'DRAFT',ARRAY[]::text[])",[id,companyId,clientId,number])
    else await db.query("INSERT INTO sales_orders(id,company_id,client_id,order_number,order_date,status,attachments) VALUES($1,$2,$3,$4,now(),'DRAFT',ARRAY[]::text[])",[id,companyId,clientId,number])
  });report.records.documents.push({id,kind,number});persist();return id
}
async function transition(kind:string,id:string,status:string){
  assert(report.records.documents.some((d:any)=>d.id===id&&d.kind===kind),'Only QA documents may change')
  await tx(async db=>{
    const table=kind==='QUOTE'?'quotes':'sales_orders'
    const before=(await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE company_id=$1 AND id=$2`,[companyId,id])).rows[0].row
    writeFileSync(path.join(privateFolder,id+'-'+Date.now()+'.json'),JSON.stringify(before,null,2))
    await db.query(`UPDATE ${table} SET status=$3 WHERE company_id=$1 AND id=$2`,[companyId,id,status])
  })
}
try{
  console.log('Inspecting exact company identity')
  for(let attempt=0;;attempt++){try{await pool.query('SELECT 1');break}catch(error){if(attempt>=3)throw error;console.log('Retrying initial database connection '+(attempt+1))}}
  const company=(await pool.query('SELECT id,name,status FROM companies WHERE id=$1',[companyId])).rows[0]
  assert(company?.status&&company.name===companyName,'Exact active company must match')
  const member=(await pool.query("SELECT user_id,role FROM company_users WHERE company_id=$1 AND status AND NOT deleted AND role::text IN('admin','manager') ORDER BY role LIMIT 1",[companyId])).rows[0]
  assert(member,'Active administrator/manager required');actorId=sessionUser=member.user_id
  ;(globalThis as any).requireAuthSession=async()=>({data:{id:sessionUser,companyId,role:member.role}})
  const backup:any=resume?JSON.parse(readFileSync(report.backup,'utf8')):{companyId,companyName,batch,at:new Date().toISOString(),tables:{},protected:{}}
  console.log('Backing up company CRM data before writes')
  if(!resume)for(const table of ['crm_settings','crm_deals','crm_activities','crm_document_links','crm_audit','company_clients'])backup.tables[table]=(await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE company_id=$1`,[companyId])).rows.map(r=>r.row)
  if(!resume)for(const table of ['quotes','sales_orders','bills','entries','products','items','variants'])backup.protected[table]=(await pool.query(`SELECT id,md5(to_jsonb(t)::text) AS hash FROM ${table} t WHERE company_id=$1 ORDER BY id`,[companyId])).rows
  if(!resume)writeFileSync(report.backup,JSON.stringify(backup,null,2));persist()
  await check('Bootstrap, currency, staff and installed CRM',async()=>{const boot=await api('bootstrap');assert(boot.ready&&boot.actor.manager);assert(boot.staff.some((s:any)=>s.id===actorId))})
  await check('CSRF and foreign company rejected',async()=>{await assert.rejects(api('deals','POST',{}, {},companyId,'https://foreign.test'),{statusCode:403});await assert.rejects(api('bootstrap','GET',undefined,{},randomUUID()),{statusCode:403})})
  await check('Revoked staff identity rejected despite supplied session role',async()=>{sessionUser=randomUUID();try{await assert.rejects(api('bootstrap'),{statusCode:403})}finally{sessionUser=actorId}})
  const originalSettings=await settings(),config=structuredClone(originalSettings.settings)
  config.pipelines.push({key:pipelineKey,name:prefix+' Sales pipeline',stages:structuredClone(defaultCrmSettings().pipelines[0].stages)})
  config.tags.push(prefix);config.segments.push({key:pipelineKey,name:prefix+' Qualified leads',filters:{tag:prefix,leadStatus:'QUALIFIED'}})
  config.customFields.push({key:pipelineKey,label:prefix+' Budget',type:'NUMBER',required:false})
  await check('Settings save and stale-version protection',async()=>{await saveSettings(config);await assert.rejects(api('settings','PUT',{settings:config,version:originalSettings.version}),{statusCode:409})})
  if(!resume)await tx(async db=>{for(let i=0;i<3;i++){
    const id=randomUUID(),name=prefix+' Client '+(i+1)
    await db.query('INSERT INTO clients(id,name,phone,email) VALUES($1,$2,$3,$4)',[id,name,prefix+'-'+i,'crm-qa-'+batch.slice(0,8)+'-'+i+'@example.invalid'])
    await db.query('INSERT INTO company_clients(company_id,client_id) VALUES($1,$2)',[companyId,id]);report.records.clients.push({id,name})
  }});persist()
  let client:any=resume?(await api('clients','GET',undefined,{q:prefix,pageSize:100})).rows.find((r:any)=>r.id===report.records.clients[0].id):undefined
  await check('Existing directory client enrichment, qualification and zero custom field',async()=>{
    const c=report.records.clients[0];client=await api('clients/'+c.id,'PUT',{name:c.name,version:0,ownerId:actorId,lifecycle:'LEAD',leadStatus:'QUALIFIED',source:'Other',tags:[prefix],customFields:{[pipelineKey]:0}})
    assert.equal(client.customFields[pipelineKey],0);assert.equal(client.version,1)
  })
  await check('Identity changes, client creation and stale client version rejected',async()=>{
    await assert.rejects(api('clients','POST',client),{statusCode:400});await assert.rejects(edit('clients',client,{name:prefix+' wrong identity'}),{statusCode:400});await assert.rejects(edit('clients',client,{version:0}),{statusCode:409})
  })
  await check('All lifecycle and qualification combinations',async()=>{for(const lifecycle of ['LEAD','CONTACT','CUSTOMER'])for(const leadStatus of ['NEW','CONTACTED','QUALIFIED','UNQUALIFIED']){client=await edit('clients',client,{lifecycle,leadStatus});assert.equal(client.lifecycle,lifecycle);assert.equal(client.leadStatus,leadStatus)}})
  await check('CSV preview, commit, round trip and atomic rejection',async()=>{
    const records=[{clientId:client.id,name:client.name,source:'Referral',tags:prefix}]
    assert.equal((await api('clients/import','POST',{records,preview:true})).valid,1)
    assert.equal((await api('clients/import','POST',{records})).count,1)
    await assert.rejects(api('clients/import','POST',{records:[...records,{clientId:randomUUID(),name:'Unknown'}]}),{statusCode:409})
    const csv=await api('clients/export','GET',undefined,{q:prefix});assert(parseCrmCsv(csv).some((r:any)=>r.clientId===client.id));assert(crmCsv([{name:'=1+1'}],[['name','Name']]).includes("'=1+1"))
  })
  await check('Live protected CSV round trip preserves international phone and negative budget',async()=>{
    const qa=report.records.clients[2],phone='+999'+parseInt(batch.slice(0,8),16).toString().padStart(10,'0')
    await tx(async db=>{const original=(await db.query('SELECT to_jsonb(c) AS row FROM clients c JOIN company_clients cc ON cc.client_id=c.id WHERE c.id=$1 AND cc.company_id=$2',[qa.id,companyId])).rows[0].row;assert(original.name.startsWith(prefix));if(original.phone!==phone){writeFileSync(path.join(privateFolder,qa.id+'-before-csv-phone.json'),JSON.stringify(original,null,2));await db.query('UPDATE clients SET phone=$2 WHERE id=$1',[qa.id,phone])}})
    const row=(await api('clients','GET',undefined,{q:qa.name})).rows.find((r:any)=>r.id===qa.id)
    await edit('clients',row,{ownerId:actorId,lifecycle:'LEAD',leadStatus:'QUALIFIED',tags:[prefix],customFields:{[pipelineKey]:-42}})
    const records=parseCrmCsv(await api('clients/export','GET',undefined,{q:qa.name}))
    assert(records[0].phone.startsWith("'+"));assert.equal((await api('clients/import','POST',{records,preview:true})).valid,1);assert.equal((await api('clients/import','POST',{records})).count,1)
    const after=(await api('clients','GET',undefined,{q:qa.name})).rows.find((r:any)=>r.id===qa.id)
    assert.equal(after.phone,phone);assert.equal(after.customFields[pipelineKey],-42)
    assert.equal((await api('clients/import','POST',{records:[{...records[0],phone:"'+9990000000000"}],preview:true})).valid,0)
  })
  const first=await deal('Multiple deals A',client.id),second=await deal('Multiple deals B',client.id)
  await check('One client supports separate deals and default stage probability',async()=>{assert.notEqual(first.id,second.id);assert.equal(first.probability,10);assert.equal((await api('deals','GET',undefined,{clientId:client.id,q:prefix})).total,2)})
  await check('All pipeline stages, loss reasons, reopening and version conflicts',async()=>{
    let row=first
    for(const stageKey of ['qualified','proposal','negotiation','won','new','lost','new']){row=await edit('deals',row,{stageKey,lossReason:stageKey==='lost'?'QA budget declined':''});assert.equal(row.stageKey,stageKey);assert.equal(!!row.closedAt,['won','lost'].includes(stageKey))}
    await assert.rejects(edit('deals',row,{stageKey:'lost',lossReason:''}),{statusCode:400});await assert.rejects(edit('deals',first,{stageKey:'proposal'}),{statusCode:409})
  })
  await check('Concurrent edits accept one writer and reject stale version',async()=>{const row=await readDeal(first.id);const results=await Promise.allSettled([edit('deals',row,{description:'QA concurrent A'}),edit('deals',row,{description:'QA concurrent B'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&(r.reason as any).statusCode===409).length,1)})
  await check('Archive, forbidden archived edit, restore and stale bulk atomicity',async()=>{
    let row=await readDeal(second.id)
    await api('deals/bulk','POST',{action:'archive',archived:true,records:[{id:row.id,version:row.version}]});row=await readDeal(row.id)
    await assert.rejects(edit('deals',row,{name:prefix+' edited archived'}),{statusCode:403})
    await api('deals/bulk','POST',{action:'archive',archived:false,records:[{id:row.id,version:row.version}]})
    row=await readDeal(row.id)
    await assert.rejects(api('deals/bulk','POST',{action:'archive',archived:true,records:[{id:row.id,version:row.version},{id:first.id,version:0}]}),{statusCode:409});assert.equal((await readDeal(row.id)).archived,false)
  })
  await check('All activity kinds × priorities × statuses',async()=>{
    for(const kind of ['TASK','CALL','MEETING','EMAIL','WHATSAPP','NOTE'])for(const priority of ['LOW','NORMAL','HIGH']){
      let row=await activity(kind+' '+priority,{kind,priority,clientId:client.id,dealId:first.id,dueAt:'2026-11-20T08:00:00Z',segmentKey:pipelineKey,attachments:[{name:'QA reference',url:'https://example.invalid/crm-qa'}]})
      for(const status of ['DONE','OPEN','CANCELLED','OPEN']){row=await edit('activities',row,{status});assert.equal(row.status,status);assert.equal(row.segmentKey,pipelineKey);assert.equal(row.attachments.length,1)}
    }
  })
  await check('Standalone, client, deal, segment and combined contextual tasks',async()=>{
    for(const context of [{},{clientId:client.id},{dealId:first.id},{segmentKey:pipelineKey},{clientId:client.id,dealId:first.id,segmentKey:pipelineKey}]){const row=await activity('Context '+JSON.stringify(context),context);if(context.dealId)assert.equal(row.clientId,client.id)}
    await assert.rejects(activity('Mismatched client',{clientId:report.records.clients[1].id,dealId:first.id}),{statusCode:400})
    await assert.rejects(activity('Unknown segment',{segmentKey:randomUUID()}),{statusCode:400})
    await assert.rejects(activity('Unsafe attachment',{attachments:[{name:'Unsafe',url:'javascript:alert(1)'}]}),{statusCode:400})
    await assert.rejects(activity('Invalid recurrence',{recurrenceDays:7}),{statusCode:400})
  })
  await check('Recurring task completion is idempotent and preserves segment',async()=>{
    let row=await activity('Weekly recurring task',{clientId:client.id,segmentKey:pipelineKey,recurrenceDays:7,dueAt:'2026-11-20T10:00:00Z'})
    row=await edit('activities',row,{status:'DONE'});row=await edit('activities',row,{status:'OPEN'});await edit('activities',row,{status:'DONE'})
    const children=(await pool.query('SELECT * FROM crm_activities WHERE company_id=$1 AND recurrence_key=$2',[companyId,'repeat:'+row.id])).rows
    assert.equal(children.length,1);assert.equal(children[0].attachments.segmentKey,pipelineKey)
  })
  await check('Saved segment filtering, calendar India-date boundaries and pagination',async()=>{
    const linked=await api('activities','GET',undefined,{segmentKey:pipelineKey,pageSize:200});assert(linked.total>=20);assert(linked.rows.every((r:any)=>r.segmentKey===pipelineKey))
    await activity('India midnight boundary',{dueAt:'2026-11-20T18:30:00Z'})
    const day=await api('activities','GET',undefined,{from:'2026-11-21',to:'2026-11-21',q:prefix});assert(day.rows.some((r:any)=>r.subject.endsWith('India midnight boundary')))
    const page1=await api('activities','GET',undefined,{q:prefix,pageSize:2,page:1}),page2=await api('activities','GET',undefined,{q:prefix,pageSize:2,page:2});assert.equal(page1.rows.length,2);assert(!page1.rows.some((r:any)=>page2.rows.some((s:any)=>s.id===r.id)))
  })
  await check('Reminder generation and repeated-run deduplication',async()=>{
    await activity('Overdue reminder verification',{dueAt:new Date(Date.now()-3600000).toISOString(),clientId:client.id})
    const one=await tx(db=>processCrmReminders(db,companyId)),two=await tx(db=>processCrmReminders(db,companyId));assert(one.notified>=1);assert.equal(two.notified,0)
  })
  for(const [kind,status,target] of [['QUOTE','SENT','proposal'],['QUOTE','ACCEPTED','won'],['QUOTE','DECLINED','lost'],['QUOTE','EXPIRED','lost'],['SALES_ORDER','CONFIRMED','qualified'],['SALES_ORDER','CLOSED','won'],['SALES_ORDER','CANCELLED','lost']]){
    await check(kind+' '+status+' → '+target+'; baseline and repeat-run dedupe',async()=>{
      const row=await deal('Rule '+kind+' '+status,client.id),documentId=await source(kind,client.id),current=await settings()
      const rule={key:(pipelineKey+'_'+kind+'_'+status).toLowerCase(),name:prefix+' '+kind+' '+status,enabled:true,event:kind+'_'+status,pipelineKey,fromStageKey:'',stageKey:target,forwardOnly:true,lossReason:target==='lost'?'QA source declined/expired/cancelled':''}
      current.settings.salesRules=current.settings.salesRules.filter((r:any)=>r.key!==rule.key);current.settings.salesRules.push(rule);await saveSettings(current.settings)
      await api('deals/'+row.id+'/documents','POST',{kind,documentId});assert.equal((await readDeal(row.id)).stageKey,'new')
      await transition(kind,documentId,status);assert.equal((await api('sales-rules/run','POST',{})).updated,1);assert.equal((await readDeal(row.id)).stageKey,target);assert.equal((await api('sales-rules/run','POST',{})).updated,0)
      const updated=await settings();updated.settings.salesRules.find((r:any)=>r.key===rule.key).enabled=false;await saveSettings(updated.settings)
    })
  }
  await check('Foreign/mismatched document links rejected',async()=>{
    const doc=await source('QUOTE',report.records.clients[1].id)
    await assert.rejects(api('deals/'+first.id+'/documents','POST',{kind:'QUOTE',documentId:doc}),{statusCode:400})
    await assert.rejects(api('deals/'+first.id+'/documents','POST',{kind:'QUOTE',documentId:randomUUID()}),{statusCode:400})
  })
  await check('Overview, client/deal context, funnel/reports, export and audit readback',async()=>{
    assert((await api('summary')).deals.open>=2)
    const reports=await api('reports');assert(reports.pipeline.some((r:any)=>r.pipelineKey===pipelineKey&&r.status==='WON'));assert(reports.pipeline.some((r:any)=>r.pipelineKey===pipelineKey&&r.status==='LOST'))
    assert((await api('clients/'+client.id)).deals.length>=2);assert((await api('deals/'+first.id)).audit.length>0)
    assert((await api('activities/export','GET',undefined,{q:prefix})).includes(prefix));assert((await api('documents','GET',undefined,{kind:'SALES_ORDER',clientId:client.id,q:prefix})).length>=3)
    await assert.rejects(api('reports','GET',undefined,{from:'2026-12-01',to:'2026-01-01'}),{statusCode:400})
  })
  await check('Lead and won-deal automatic follow-ups are deduplicated',async()=>{
    for(const recurrenceKey of ['lead:'+client.id,'won:'+first.id]){const count=Number((await pool.query('SELECT count(*) AS count FROM crm_activities WHERE company_id=$1 AND recurrence_key=$2',[companyId,recurrenceKey])).rows[0].count);assert.equal(count,1)}
  })
  await check('Original memberships, CRM records and sales/inventory remain unchanged',async()=>{
    for(const [table,rows] of Object.entries(backup.tables) as any){for(const row of rows){const key=table==='company_clients'?'client_id':table==='crm_settings'?'company_id':'id';const read=(await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE company_id=$1 AND ${key}=$2`,[companyId,row[key]])).rows[0]?.row;assert.deepEqual(read,row,table+' original changed')}}
    for(const [table,rows] of Object.entries(backup.protected) as any){for(const row of rows){const read=(await pool.query(`SELECT md5(to_jsonb(t)::text) AS hash FROM ${table} t WHERE company_id=$1 AND id=$2`,[companyId,row.id])).rows[0];assert.equal(read?.hash,row.hash,table+' original changed')}}
  })
  report.matrix={lifecycleQualificationCombinations:12,activityKindPriorityCombinations:18,statusTransitionsPerActivity:4,quotationEvents:4,salesOrderEvents:3};
  report.status='PASSED';report.finishedAt=new Date().toISOString();persist();console.log(JSON.stringify({status:report.status,checks:report.checks.length,prefix,report:path.join(folder,'report.json')}))
}catch(e:any){report.status='FAILED';report.error=e.statusMessage||e.message;persist();console.error('FAIL '+report.error);process.exitCode=1}
finally{(globalThis as any).requireAuthSession=savedAuth;await pool.end();await prisma.$disconnect()}
