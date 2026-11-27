import { randomUUID } from 'node:crypto'
import { defaultCrmSettings, normalizeCrmSettings, normalizeCrmRecord, normalizeCrmFilters, crmScore, type CrmSettings, type CrmKind } from '../../utils/crm'
import { crmCanEdit, crmRequireManager, crmError, crmInput, type CrmActor } from './crm-access'

export type CrmDb={query:(sql:string,args?:any[])=>Promise<any>}
// Read identity from Client on every request. Only CRM attributes live on its
// existing company membership; this derived source is not a table or SQL view.
export const crmClientSource=`(SELECT cc.company_id,cc.client_id AS id,cc.client_id,c.name,coalesce(c.email,'') AS email,c.phone,
 coalesce(cc.crm_data->>'ownerId','') AS owner_id,
 coalesce(cc.crm_data->>'jobTitle','') AS job_title,
 coalesce(cc.crm_data->>'lifecycle',CASE WHEN cc.pipeline_status='close' THEN 'CUSTOMER' ELSE 'LEAD' END) AS lifecycle,
 coalesce(cc.crm_data->>'leadStatus',CASE WHEN cc.pipeline_status='reject' THEN 'UNQUALIFIED' WHEN cc.pipeline_status IN('viewing','close') THEN 'QUALIFIED' WHEN cc.pipeline_status='prospect' THEN 'CONTACTED' ELSE 'NEW' END) AS lead_status,
 coalesce(cc.crm_data->>'source','Other') AS source,ARRAY(SELECT jsonb_array_elements_text(coalesce(cc.crm_data->'tags','[]'::jsonb))) AS tags,
 coalesce(cc.crm_data->'customFields','{}'::jsonb) AS custom_fields,coalesce(cc.crm_data->>'description','') AS description,
 NOT cc.status AS archived,cc.crm_version AS version,coalesce(cc.crm_data->>'createdBy','') AS created_by,
 (cc.crm_data->>'createdAt')::timestamptz AS created_at,
 coalesce((cc.crm_data->>'updatedAt')::timestamptz,(cc.crm_data->>'createdAt')::timestamptz) AS updated_at,
 (cc.crm_data->>'convertedAt')::timestamptz AS converted_at
 FROM company_clients cc JOIN clients c ON c.id=cc.client_id WHERE c.deleted=false)`
export const crmTables={clients:crmClientSource,deals:'crm_deals',activities:'crm_activities'} as const
export async function crmReady(db:CrmDb){return !!(await db.query(`SELECT to_regclass('public.crm_deals') IS NOT NULL AND to_regclass('public.crm_activities') IS NOT NULL AND to_regclass('public.crm_settings') IS NOT NULL
  AND to_regclass('public.crm_audit') IS NOT NULL AND to_regclass('public.crm_document_links') IS NOT NULL
  AND (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_clients' AND column_name IN('crm_data','crm_version')) AS ready`)).rows[0]?.ready}
export async function crmTableReady(db:CrmDb,table:string){return !!(await db.query('SELECT to_regclass($1) IS NOT NULL AS ready',['public.'+table])).rows[0]?.ready}
export function crmRow(row:any):Record<string,any>{
  const {account_id,account_name,accountId,accountName,...fields}=row
  const result=Object.fromEntries(Object.entries(fields).map(([key,value])=>[key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),value instanceof Date?value.toISOString():value]))
  if(result.attachments&&!Array.isArray(result.attachments)){
    const metadata=result.attachments as any
    result.attachments=metadata.references||[];result.segmentKey=metadata.segmentKey||null;result.segmentName=metadata.segmentName||''
  }
  return result
}
function activityReferences(body:any){return JSON.stringify(body.segmentKey?{version:1,references:body.attachments||[],segmentKey:body.segmentKey,segmentName:body.segmentName}:body.attachments||[])}
export async function readCrmSettings(db:CrmDb,company:string){
  const row=(await db.query('SELECT settings,version FROM crm_settings WHERE company_id=$1',[company])).rows[0]
  return {settings:row?normalizeCrmSettings(row.settings):defaultCrmSettings(),version:row?.version||0}
}
export async function crmAudit(db:CrmDb,actor:CrmActor,kind:string,id:string,action:string,before:any,after:any){
  await db.query(`INSERT INTO crm_audit(id,company_id,entity_type,entity_id,action,actor_id,summary,changes) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [randomUUID(),actor.companyId,kind,id,action,actor.userId,`${action}: ${after?.name||after?.subject||before?.name||before?.subject||kind}`,JSON.stringify({before,after})])
}
export async function crmStaffList(db:CrmDb,company:string){return (await db.query(`SELECT user_id AS id,coalesce(nullif(name,''),user_id) AS name,role FROM company_users
  WHERE company_id=$1 AND status=true AND deleted=false AND role::text IN('admin','manager','user','biller','accountant') ORDER BY name,user_id`,[company])).rows}
async function crmOwner(db:CrmDb,actor:CrmActor,id:string,old?:any){
  if(!actor.manager&&id!==actor.userId&&id!==old?.owner_id)throw crmError('Only a manager can assign another owner.',403)
  if(!(await crmStaffList(db,actor.companyId)).some((row:any)=>row.id===id))throw crmError('Choose an active staff owner in this company.')
}
export async function crmRead(db:CrmDb,company:string,kind:CrmKind,id:string,lock=false){
  const row=(await db.query(`SELECT r.*${kind==='deals'?',r.expected_close::text AS expected_close':''} FROM ${crmTables[kind]} r WHERE r.company_id=$1 AND r.id=$2${lock&&kind!=='clients'?' FOR UPDATE':''}`,[company,id])).rows[0]
  if(!row)throw crmError('CRM record not found.',404);return row
}
const fieldMaps:Record<CrmKind,Record<string,string>>={
  clients:{jobTitle:'job_title',lifecycle:'lifecycle',leadStatus:'lead_status',source:'source',ownerId:'owner_id',tags:'tags',description:'description',customFields:'custom_fields'},
  deals:{name:'name',clientId:'client_id',pipelineKey:'pipeline_key',stageKey:'stage_key',status:'status',value:'value',probability:'probability',expectedClose:'expected_close',lossReason:'loss_reason',ownerId:'owner_id',source:'source',tags:'tags',description:'description'},
  activities:{clientId:'client_id',dealId:'deal_id',kind:'kind',subject:'subject',body:'body',status:'status',priority:'priority',ownerId:'owner_id',dueAt:'due_at',endAt:'end_at',recurrenceDays:'recurrence_days',attachments:'attachments'},
}
export function crmWhere(kind:CrmKind,company:string,input:any,settings:CrmSettings){
  const f=normalizeCrmFilters(input),args:any[]=[company],where=['r.company_id=$1']
  const bind=(value:any)=>{args.push(value);return '$'+args.length}
  if(f.archived!=='all')where.push('r.archived='+bind(f.archived==='true'))
  if(kind==='activities'&&f.segmentKey)where.push(`r.attachments->>'segmentKey'=${bind(f.segmentKey)}`)
  const fields:Record<string,string>={ownerId:'owner_id',clientId:'client_id',dealId:'deal_id',lifecycle:'lifecycle',leadStatus:'lead_status',source:'source',pipelineKey:'pipeline_key',stageKey:'stage_key',status:'status',kind:'kind',priority:'priority'}
  const columns=new Set(Object.values(fieldMaps[kind]))
  for(const [key,column]of Object.entries(fields))if(f[key]&&columns.has(column))where.push(`r.${column}=${bind(f[key])}`)
  if(f.q)where.push(`concat_ws(' ',${kind==='activities'?'r.subject,r.body':'r.name,r.description'}${kind==='clients'?',r.phone,r.email':''}) ILIKE ${bind('%'+f.q+'%')}`)
  if(f.tag&&kind!=='activities')where.push(`${bind(f.tag)}=ANY(r.tags)`)
  if(kind==='clients'&&f.minScore!=null){const w=settings.scoring;where.push(`LEAST(100,(CASE WHEN r.email<>'' THEN ${w.email} ELSE 0 END)+(CASE WHEN r.phone<>'' THEN ${w.phone} ELSE 0 END)+(CASE WHEN r.lead_status='QUALIFIED' THEN ${w.qualified} ELSE 0 END))>=${bind(f.minScore)}`)}
  const date=kind==='activities'?"(r.due_at AT TIME ZONE 'Asia/Kolkata')::date":kind==='deals'?'r.expected_close':"(r.created_at AT TIME ZONE 'Asia/Kolkata')::date"
  if(f.from)where.push(`${date}>=${bind(f.from)}::date`);if(f.to)where.push(`${date}<=${bind(f.to)}::date`)
  if(kind==='activities'&&f.due==='OVERDUE')where.push("r.status='OPEN' AND r.due_at<now()")
  if(kind==='activities'&&f.due==='TODAY')where.push("r.status='OPEN' AND (r.due_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date")
  if(kind==='activities'&&f.due==='NEXT7')where.push("r.status='OPEN' AND r.due_at>=now() AND r.due_at<now()+interval '7 days'")
  return {sql:where.join(' AND '),args}
}
export async function crmList(db:CrmDb,actor:CrmActor,kind:CrmKind,input:any,exporting=false){
  const {settings}=await readCrmSettings(db,actor.companyId),{sql,args}=crmInput(()=>crmWhere(kind,actor.companyId,input,settings))
  const page=Math.max(1,Math.min(100000,Math.floor(Number(input.page)||1))),limit=exporting?5000:Math.max(1,Math.min(200,Math.floor(Number(input.pageSize)||30)))
  const total=Number((await db.query(`SELECT count(*)::int AS count FROM ${crmTables[kind]} r WHERE ${sql}`,args)).rows[0].count)
  const select=`r.*,cu.name AS owner_name${kind==='deals'?',r.expected_close::text AS expected_close':''}${['deals','activities'].includes(kind)?',c.name AS client_name':''}${kind==='activities'?',d.name AS deal_name':''}`
  const joins=`LEFT JOIN company_users cu ON cu.company_id=r.company_id AND cu.user_id=r.owner_id
    ${['deals','activities'].includes(kind)?'LEFT JOIN clients c ON c.id=r.client_id AND c.deleted=false':''}
    ${kind==='activities'?'LEFT JOIN crm_deals d ON d.id=r.deal_id AND d.company_id=r.company_id':''}`
  const rows=(await db.query(`SELECT ${select} FROM ${crmTables[kind]} r ${joins} WHERE ${sql}
    ORDER BY ${kind==='activities'?'r.due_at ASC NULLS LAST,':''}r.created_at DESC,r.id LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,limit,exporting?0:(page-1)*limit])).rows
  return {rows:rows.map((r:any)=>({...crmRow(r),...(kind==='clients'?{score:crmScore(r,settings)}:{})})),total,page,pageSize:limit,truncated:exporting&&total>limit}
}
async function crmRelations(db:CrmDb,actor:CrmActor,kind:CrmKind,body:any){
  for(const [field,target]of [['dealId','deals'],['clientId','clients']] as const)if(body[field]&&!(kind==='clients'&&field==='clientId')){
    const row=await crmRead(db,actor.companyId,target,body[field]);if(row.archived)throw crmError('Choose an active '+target.slice(0,-1)+'.')
    if(field==='dealId'&&body.clientId&&row.client_id&&body.clientId!==row.client_id)throw crmError('The activity must match its deal?s client.')
    if(field==='dealId')body.clientId=body.clientId||row.client_id||null
  }

}
export async function saveCrmRecord(db:CrmDb,actor:CrmActor,kind:CrmKind,input:any,id?:string){
  if(kind==='clients')return saveCrmClient(db,actor,input,id)
  const old=id?await crmRead(db,actor.companyId,kind,id,true):null
  if(old&&(!crmCanEdit(actor,old)||old.archived))throw crmError('You cannot edit this CRM record.',403)
  if(old&&old.version!==input.version)throw crmError('This record changed in another session. Reload it before saving.',409)
  const {settings}=await readCrmSettings(db,actor.companyId)
  // Preserve a removed segment's historical link on ordinary edits; users may
  // clear it, but cannot attach a new task to a removed/foreign segment.
  const previous=old?crmRow(old):null
  const validationSettings=kind==='activities'&&previous?.segmentKey&&input.segmentKey===previous.segmentKey&&!settings.segments.some(s=>s.key===input.segmentKey)
    ?{...settings,segments:[...settings.segments,{key:previous.segmentKey,name:previous.segmentName||'Removed segment',filters:{}}]}:settings
  const body=crmInput(()=>normalizeCrmRecord(kind,input,validationSettings))
  await crmOwner(db,actor,body.ownerId,old);await crmRelations(db,actor,kind,body)
  const recordId=id||randomUUID(),columns=fieldMaps[kind],entries=Object.entries(columns),values=entries.map(([key])=>key==='attachments'?activityReferences(body):key==='customFields'?JSON.stringify(body[key]):body[key])
  if(old){
    const assignments=entries.map(([key,column],i)=>`${column}=$${i+4}${['customFields','attachments'].includes(key)?'::jsonb':''}`)
    if(kind==='deals'){
      assignments.push(`closed_at=CASE WHEN $${entries.findIndex(([k])=>k==='status')+4}='OPEN' THEN NULL WHEN status='OPEN' THEN now() ELSE closed_at END`)
      assignments.push(`stage_changed_at=CASE WHEN stage_key<>$${entries.findIndex(([k])=>k==='stageKey')+4} OR pipeline_key<>$${entries.findIndex(([k])=>k==='pipelineKey')+4} THEN now() ELSE stage_changed_at END`)
    }
    if(kind==='activities'){
      assignments.push(`completed_at=CASE WHEN $${entries.findIndex(([k])=>k==='status')+4}='DONE' THEN coalesce(completed_at,now()) ELSE NULL END`)
      assignments.push(`reminded_at=CASE WHEN due_at IS DISTINCT FROM $${entries.findIndex(([k])=>k==='dueAt')+4}::timestamptz OR status<>'OPEN' THEN NULL ELSE reminded_at END`)
    }
    const result=await db.query(`UPDATE ${crmTables[kind]} SET ${assignments.join(',')},version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2 AND version=$3 RETURNING *`,[actor.companyId,id,input.version,...values])
    if(!result.rowCount)throw crmError('This record changed. Reload before saving.',409)
  }else{
    const extraCols=kind==='deals'?',closed_at':kind==='activities'?',completed_at':''
    const extraVal=kind==='deals'?(body.status!=='OPEN'?',now()':',NULL'):kind==='activities'?(body.status==='DONE'?',now()':',NULL'):''
    await db.query(`INSERT INTO ${crmTables[kind]}(id,company_id,created_by,${entries.map(([,column])=>column).join(',')}${extraCols})
      VALUES($1,$2,$3,${entries.map(([key],i)=>'$'+(i+4)+(['customFields','attachments'].includes(key)?'::jsonb':'')).join(',')}${extraVal})`,[recordId,actor.companyId,actor.userId,...values])
  }
  await crmAudit(db,actor,kind,recordId,old?'Updated':'Created',old,body)
  if(kind==='deals'&&body.status==='WON'&&old?.status!=='WON'&&settings.automations.wonFollowUpDays)await createCrmFollowUp(db,actor,body.clientId,recordId,body.ownerId,'Follow up after '+body.name,settings.automations.wonFollowUpDays,'won:'+recordId)
  if(kind==='activities'&&body.status==='DONE'&&old?.status!=='DONE'&&body.recurrenceDays){
    const at=new Date(Math.max(Date.parse(body.dueAt),Date.now())+body.recurrenceDays*86400000)
    await db.query(`INSERT INTO crm_activities(id,company_id,client_id,deal_id,kind,subject,body,status,priority,owner_id,due_at,recurrence_days,recurrence_key,created_by,attachments)
      VALUES($1,$2,$3,$4,$5,$6,$7,'OPEN',$8,$9,$10,$11,$12,$13,$14::jsonb) ON CONFLICT(company_id,recurrence_key) DO NOTHING`,
      [randomUUID(),actor.companyId,body.clientId,body.dealId,body.kind,body.subject,body.body,body.priority,body.ownerId,at,body.recurrenceDays,'repeat:'+recordId,actor.userId,activityReferences(body)])
  }
  return crmRow(await crmRead(db,actor.companyId,kind,recordId))
}
async function saveCrmClient(db:CrmDb,actor:CrmActor,input:any,id?:string){
  if(!id)throw crmError('Create or link clients on the existing client page.')
  const old=await crmRead(db,actor.companyId,'clients',id)
  if(old.archived||(!crmCanEdit(actor,old)&&(old.owner_id||old.created_by)))throw crmError('You cannot edit this client CRM record.',403)
  if(old.version!==input.version)throw crmError('This client CRM record changed. Reload before saving.',409)
  for(const key of ['name','phone','email'])if(input[key]!==undefined&&String(input[key]||'')!==String(old[key]||''))throw crmError('Edit contact details on the existing client page.')
  if(input.clientId&&input.clientId!==id)throw crmError('The client identity cannot be reassigned.')
  const {settings}=await readCrmSettings(db,actor.companyId)
  const body=crmInput(()=>normalizeCrmRecord('clients',{...input,name:old.name,email:old.email,phone:old.phone,clientId:id},settings))
  await crmOwner(db,actor,body.ownerId,old);await crmRelations(db,actor,'clients',body)
  const at=new Date().toISOString(),first=!old.version
  const data={ownerId:body.ownerId,jobTitle:body.jobTitle,lifecycle:body.lifecycle,leadStatus:body.leadStatus,source:body.source,tags:body.tags,customFields:body.customFields,description:body.description,
    createdBy:old.created_by||actor.userId,createdAt:old.created_at||at,updatedAt:at,convertedAt:body.lifecycle==='CUSTOMER'?(old.converted_at||at):old.converted_at||null}
  const result=await db.query('UPDATE company_clients SET crm_data=$4::jsonb,crm_version=crm_version+1 WHERE company_id=$1 AND client_id=$2 AND crm_version=$3 AND status=true RETURNING client_id',
    [actor.companyId,id,input.version,JSON.stringify(data)])
  if(!result.rowCount)throw crmError('This membership changed. Reload before saving.',409)
  await crmAudit(db,actor,'clients',id,'CRM attributes updated',old,data)
  if(first&&body.lifecycle==='LEAD'&&settings.automations.newLeadFollowUpDays)await createCrmFollowUp(db,actor,id,null,body.ownerId,'Follow up with '+old.name,settings.automations.newLeadFollowUpDays,'lead:'+id)
  return crmRow(await crmRead(db,actor.companyId,'clients',id))
}
async function createCrmFollowUp(db:CrmDb,actor:CrmActor,contact:string|null,deal:string|null,owner:string,subject:string,days:number,key:string){
  await db.query(`INSERT INTO crm_activities(id,company_id,client_id,deal_id,kind,subject,owner_id,due_at,recurrence_key,created_by)
    VALUES($1,$2,$3,$4,'TASK',$5,$6,now()+$7::int*interval '1 day',$8,$9) ON CONFLICT(company_id,recurrence_key) DO NOTHING`,[randomUUID(),actor.companyId,contact,deal,subject,owner,days,key,actor.userId])
}
export async function archiveCrmRecords(db:CrmDb,actor:CrmActor,kind:CrmKind,body:any){
  crmRequireManager(actor)
  if(kind==='clients')throw crmError('Activate or deactivate clients on the existing client page.')
  if(!Array.isArray(body.records)||!body.records.length||body.records.length>200||typeof body.archived!=='boolean')throw crmError('Select up to 200 records to archive or restore.')
  for(const item of body.records){const row=await crmRead(db,actor.companyId,kind,String(item.id),true);if(row.version!==item.version)throw crmError('A selected record changed. Reload before continuing.',409)

    await db.query(`UPDATE ${crmTables[kind]} SET archived=$3,version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2`,[actor.companyId,row.id,body.archived]);await crmAudit(db,actor,kind,row.id,body.archived?'Archived':'Restored',row,{archived:body.archived})}
  return {count:body.records.length}
}
export async function saveCrmSettings(db:CrmDb,actor:CrmActor,body:any){
  crmRequireManager(actor);const settings=crmInput(()=>normalizeCrmSettings(body.settings)),current=await readCrmSettings(db,actor.companyId)
  if(current.version!==body.version)throw crmError('CRM settings changed. Reload before saving.',409)
  for(const rule of settings.salesRules){
    const previous=current.settings.salesRules.find(r=>r.key===rule.key)
    const configuration=(r:typeof rule)=>JSON.stringify({...r,revision:''})
    rule.revision=previous&&configuration(previous)===configuration(rule)?previous.revision||randomUUID():randomUUID()
  }
  const used=(await db.query('SELECT DISTINCT pipeline_key,stage_key,status FROM crm_deals WHERE company_id=$1',[actor.companyId])).rows
  for(const row of used){const stage=settings.pipelines.find(p=>p.key===row.pipeline_key)?.stages.find(s=>s.key===row.stage_key);if(!stage||stage.status!==row.status)throw crmError('A pipeline/stage in use cannot be removed or change its outcome. Move its deals first.')}
  await db.query(`INSERT INTO crm_settings(company_id,settings,updated_by) VALUES($1,$2::jsonb,$3) ON CONFLICT(company_id)
    DO UPDATE SET settings=excluded.settings,updated_by=excluded.updated_by,version=crm_settings.version+1,updated_at=now()`,[actor.companyId,JSON.stringify(settings),actor.userId])
  await crmAudit(db,actor,'settings',actor.companyId,'Settings saved',current.settings,settings)
  if(settings.salesRules.some(r=>r.enabled)){
    const {processCrmSalesRules}=await import('./crm-sales-rules')
    await processCrmSalesRules(db,actor.companyId,true)
  }
  return readCrmSettings(db,actor.companyId)
}
