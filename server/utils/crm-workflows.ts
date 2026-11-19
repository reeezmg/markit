import { randomUUID } from 'node:crypto'
import { crmDate, crmScore, normalizeCrmRecord, type CrmKind } from '../../utils/crm'
import { crmError, crmInput, crmRequireManager, crmCanEdit, type CrmActor } from './crm-access'
import { crmAudit, crmRow, crmTableReady, readCrmSettings, crmTables, crmClientSource, saveCrmRecord, crmStaffList, type CrmDb } from './crm'
import { readSalesWorkflow } from './sales-workflow'

export async function crmRead(db:CrmDb,actor:CrmActor,kind:CrmKind,id:string){
  const row=(await db.query(`SELECT r.*${kind==='deals'?',r.expected_close::text AS expected_close':''} FROM ${crmTables[kind]} r WHERE r.company_id=$1 AND r.id=$2`,[actor.companyId,id])).rows[0]
  if(!row)throw crmError('CRM record not found.',404)
  return row
}
export async function crmClientChoices(db:CrmDb,actor:CrmActor,q:string){
  return (await db.query(`SELECT c.id,c.name,c.email,c.phone FROM company_clients cc JOIN clients c ON c.id=cc.client_id
    WHERE cc.company_id=$1 AND cc.status=true AND c.deleted=false AND concat_ws(' ',c.name,c.email,c.phone) ILIKE $2 ORDER BY c.name,c.id LIMIT 50`,[actor.companyId,'%'+String(q||'').slice(0,200)+'%'])).rows
}
// Import enriches explicitly identified existing memberships only. New identities
// are created/linked by BillingAddClient on /client, the single contact page.
export async function crmImport(db:CrmDb,actor:CrmActor,body:any){
  if(!Array.isArray(body.records)||!body.records.length||body.records.length>200)throw crmError('Import between 1 and 200 client CRM updates.')
  const {settings}=await readCrmSettings(db,actor.companyId),staff=await crmStaffList(db,actor.companyId),records:any[]=[],errors:any[]=[],seen=new Set<string>()
  for(let i=0;i<body.records.length;i++)try{
    const r={...body.records[i]},id=String(r.clientId||'').trim()
    if(!id)throw crmError('clientId is required. Add new clients on the existing client page.')
    if(seen.has(id))throw crmError('The client appears more than once in this file.');seen.add(id)
    const old=await crmRead(db,actor,'clients',id)
    if(old.archived||(!crmCanEdit(actor,old)&&(old.owner_id||old.created_by)))throw crmError('You cannot update this client CRM record.',403)
    const owner=r.ownerId||old.owner_id||(staff.some((m:any)=>m.id===actor.userId)?actor.userId:actor.manager?staff[0]?.id:actor.userId)
    if(!staff.some((m:any)=>m.id===owner)||!actor.manager&&owner!==actor.userId&&owner!==old.owner_id)throw crmError('Choose an eligible company owner.')
    const customFields={...old.custom_fields,...r.customFields}
    for(const field of settings.customFields){const value=r['custom:'+field.label]??r['custom:'+field.key];if(value===undefined)continue
      customFields[field.key]=field.type==='BOOLEAN'?(/^(true|yes|1)$/i.test(String(value))?true:/^(false|no|0)$/i.test(String(value))?false:value):value}
    const input={...crmRow(old),...r,clientId:id,ownerId:owner,version:old.version,customFields,tags:r.tags===undefined?old.tags:Array.isArray(r.tags)?r.tags:String(r.tags).split(';').filter(Boolean),source:r.source||old.source||settings.sources[0]}
    for(const key of ['name','phone','email'])if(r[key]!==undefined&&String(r[key]||'')!==String(old[key]||''))throw crmError('Contact details differ. Edit them on the existing client page.')
    input.customFields={...old.custom_fields,...r.customFields}
    for(const field of settings.customFields){
      const key=['custom:'+field.label,'custom:'+field.key].find(key=>Object.hasOwn(r,key))
      if(!key)continue
      const value=r[key]
      if(field.type==='BOOLEAN'&&typeof value==='string'){
        if(!/^(true|false|yes|no|1|0)$/i.test(value.trim()))throw crmError('Choose true or false for '+field.label+'.')
        input.customFields[field.key]=/^(true|yes|1)$/i.test(value.trim())
      }else input.customFields[field.key]=value
    }
    const normalized=crmInput(()=>normalizeCrmRecord('clients',input,settings));records.push({...normalized,clientId:id,version:old.version})
  }catch(error:any){errors.push({row:i+2,message:error.statusMessage||error.message})}
  if(body.preview)return {valid:records.length,total:body.records.length,errors}
  if(errors.length)throw crmError('Preview and correct every row before importing.',409)
  const ids:string[]=[];for(const record of records)ids.push((await saveCrmRecord(db,actor,'clients',record,record.clientId)).id)
  return {count:ids.length,ids}
}
export async function linkCrmDocument(db:CrmDb,actor:CrmActor,id:string,body:any){
  const deal=await crmRead(db,actor,'deals',id)
  if(!crmCanEdit(actor,deal)||deal.archived)throw crmError('You cannot edit this deal.',403)
  const definitions:Record<string,{table:string;deleted:string}>={QUOTE:{table:'quotes',deleted:'AND deleted=false'},BILL:{table:'bills',deleted:"AND deleted=false AND is_markit=false AND COALESCE(type::text,'BILL')='BILL'"},SALES_ORDER:{table:'sales_orders',deleted:'AND deleted=false'},ORDER:{table:'ecomm_orders',deleted:''}}
  const definition=Object.hasOwn(definitions,body.kind)?definitions[body.kind]:null;if(!definition)throw crmError('Choose a quotation, invoice or order.')
  const document=(await db.query(`SELECT id,client_id FROM ${definition.table} WHERE company_id=$1 AND id=$2 ${definition.deleted}`,[actor.companyId,String(body.documentId||'')])).rows[0]
  if(!document)throw crmError('The document does not belong to this company.')
  if(deal.client_id){const contact=await crmRead(db,actor,'clients',deal.client_id);if(document.client_id!==contact.id)throw crmError('Choose a document for this deal’s client.')}
  await db.query(`INSERT INTO crm_document_links(id,company_id,deal_id,kind,document_id,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id,deal_id,kind,document_id) DO NOTHING`,[randomUUID(),actor.companyId,id,body.kind,document.id,actor.userId])
  await crmAudit(db,actor,'deals',id,'Linked '+body.kind,null,{documentId:document.id})
  const {processCrmSalesRules}=await import('./crm-sales-rules')
  await processCrmSalesRules(db,actor.companyId,true)
  return {linked:true}
}
export async function crmCommerce(db:CrmDb,company:string,clientId:string|null){
  const commerce:any={bills:[],quotes:[],orders:[],products:[],legacyActivities:[],client:null,permissions:{emailConfirmed:false,whatsappAvailable:false,whatsappService:false,whatsappMarketing:false}}
  if(clientId){
    const client=(await db.query(`SELECT c.id,c.name,c.phone,c.email,cc.status,cc.points,to_jsonb(cc)->>'marketing_opt_in_at' AS email_confirmed_at,to_jsonb(cc)->>'marketing_opt_in_email' AS email_confirmed_address FROM clients c JOIN company_clients cc ON cc.client_id=c.id WHERE cc.company_id=$1 AND c.id=$2 AND c.deleted=false`,[company,clientId])).rows[0]
    if(client){commerce.client=client
      commerce.permissions.emailConfirmed=!!client.email_confirmed_at&&!!client.email&&String(client.email_confirmed_address||'').toLowerCase()===client.email.toLowerCase()
      if(await crmTableReady(db,'whatsapp_notification_clients')){
        commerce.permissions.whatsappAvailable=true
        const permission=(await db.query('SELECT recipient,client_phone,service_consent,marketing_consent FROM whatsapp_notification_clients WHERE company_id=$1 AND client_id=$2',[company,clientId])).rows[0]
        if(permission&&permission.client_phone===(client.phone||'')){commerce.permissions.whatsappService=permission.service_consent;commerce.permissions.whatsappMarketing=permission.marketing_consent}
      }
      const queries=[
        ['bills',`SELECT id,COALESCE(invoice_code,invoice_number::text) AS number,grand_total AS total,payment_status AS status,created_at FROM bills WHERE company_id=$1 AND client_id=$2 AND deleted=false AND NOT COALESCE(precedence,false) AND is_markit=false AND COALESCE(type::text,'BILL')='BILL' ORDER BY created_at DESC LIMIT 50`,'bills'],
        ['quotes','SELECT id,quote_number AS number,total,status,quote_date::text AS date FROM quotes WHERE company_id=$1 AND client_id=$2 AND deleted=false ORDER BY quote_date DESC LIMIT 50','quotes'],
        ['orders','SELECT id,order_number AS number,grand_total AS total,status,created_at FROM ecomm_orders WHERE company_id=$1 AND client_id=$2 ORDER BY created_at DESC LIMIT 50','ecomm_orders'],
        ['products','SELECT id,reference,name,status,serial_number FROM customer_products WHERE company_id=$1 AND client_id=$2 ORDER BY created_at DESC LIMIT 50','customer_products'],
        ['legacyActivities','SELECT id,kind,body,due_at,completed_at,created_at FROM ecomm_crm_activities WHERE company_id=$1 AND client_id=$2 ORDER BY created_at DESC LIMIT 50','ecomm_crm_activities'],
      ]
      const workflow=await readSalesWorkflow(db,company)
      for(const [key,sql,table]of queries)if((key!=='products'||workflow.includeAfterSales)&&await crmTableReady(db,table))commerce[key]=(await db.query(sql,[company,clientId])).rows.map(crmRow)
    }
  }
  return commerce
}
export async function crmDetail(db:CrmDb,actor:CrmActor,kind:CrmKind,id:string){
  const record=await crmRead(db,actor,kind,id),company=actor.companyId
  const labels:any={ownerName:(await crmStaffList(db,company)).find((member:any)=>member.id===record.owner_id)?.name||'Former team member'}
  if(record.account_id)labels.accountName=(await crmRead(db,actor,'accounts',record.account_id)).name
  if(record.client_id){const contact=await crmRead(db,actor,'clients',record.client_id);labels.clientName=contact.name;labels.linkedClientId=contact.client_id}
  const relation=kind==='clients'?'client_id':kind==='accounts'?'account_id':kind==='deals'?'deal_id':null
  const activities=relation?(await db.query(`SELECT * FROM crm_activities WHERE company_id=$1 AND ${relation}=$2 AND archived=false ORDER BY created_at DESC,id LIMIT 100`,[company,id])).rows:[]
  const audit=(await db.query(`SELECT a.*,cu.name AS actor_name FROM crm_audit a LEFT JOIN company_users cu ON cu.company_id=a.company_id AND cu.user_id=a.actor_id WHERE a.company_id=$1 AND a.entity_type=$2 AND a.entity_id=$3 ORDER BY a.created_at DESC,a.id LIMIT 100`,[company,kind,id])).rows
  const deals=['clients','accounts'].includes(kind)?(await db.query(`SELECT *,expected_close::text FROM crm_deals WHERE company_id=$1 AND ${kind==='clients'?'client_id':'account_id'}=$2 AND archived=false ORDER BY created_at DESC LIMIT 100`,[company,id])).rows:[]
  const clients=kind==='accounts'?(await db.query(`SELECT r.* FROM ${crmClientSource} r WHERE r.company_id=$1 AND r.account_id=$2 AND r.archived=false ORDER BY r.name LIMIT 100`,[company,id])).rows:[]
  const documents=kind==='deals'?(await db.query('SELECT * FROM crm_document_links WHERE company_id=$1 AND deal_id=$2 ORDER BY created_at DESC',[company,id])).rows:[]
  const commerce=await crmCommerce(db,company,kind==='clients'?record.client_id:null)
  const {settings}=await readCrmSettings(db,company)
  return {record:{...crmRow(record),...labels,...(kind==='clients'?{score:crmScore(record,settings)}:{})},activities:activities.map(crmRow),audit:audit.map(crmRow),deals:deals.map(crmRow),clients:clients.map(crmRow),documents:documents.map(crmRow),commerce}
}
export async function crmSummary(db:CrmDb,actor:CrmActor){
  const company=actor.companyId
  const clients=(await db.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE lifecycle='LEAD')::int AS leads,count(*) FILTER(WHERE lifecycle='CUSTOMER')::int AS customers FROM ${crmClientSource} r WHERE company_id=$1 AND archived=false`,[company])).rows[0]
  const deals=(await db.query(`SELECT count(*) FILTER(WHERE status='OPEN' AND NOT archived)::int AS open,sum(value) FILTER(WHERE status='OPEN' AND NOT archived) AS pipeline_value,
    sum(value*probability/100) FILTER(WHERE status='OPEN' AND NOT archived) AS forecast,sum(value) FILTER(WHERE status='WON') AS won_value,
    count(*) FILTER(WHERE status='WON')::int AS won,count(*) FILTER(WHERE status='LOST')::int AS lost FROM crm_deals WHERE company_id=$1`,[company])).rows[0]
  const tasks=(await db.query(`SELECT count(*) FILTER(WHERE due_at<now())::int AS overdue,count(*) FILTER(WHERE (due_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS today FROM crm_activities WHERE company_id=$1 AND archived=false AND status='OPEN' AND kind<>'NOTE'`,[company])).rows[0]
  const upcoming=(await db.query(`SELECT a.*,c.name AS client_name FROM crm_activities a LEFT JOIN clients c ON c.id=a.client_id AND c.deleted=false WHERE a.company_id=$1 AND a.archived=false AND a.status='OPEN' AND a.kind<>'NOTE' ORDER BY a.due_at NULLS LAST,a.id LIMIT 8`,[company])).rows.map(crmRow)
  const recent=(await db.query('SELECT * FROM crm_audit WHERE company_id=$1 ORDER BY created_at DESC,id LIMIT 10',[company])).rows.map(crmRow)
  return {clients,deals:crmRow(deals),tasks,upcoming,recent}
}
export async function crmReports(db:CrmDb,actor:CrmActor,filters:any){
  crmRequireManager(actor)
  const from=filters.from?crmInput(()=>crmDate(filters.from,'start date')):null,to=filters.to?crmInput(()=>crmDate(filters.to,'end date')):null
  if(from&&to&&from>to)throw crmError('The end date must follow the start date.')
  const where=`d.company_id=$1 AND ($2::date IS NULL OR (d.created_at AT TIME ZONE 'Asia/Kolkata')::date>=$2::date) AND ($3::date IS NULL OR (d.created_at AT TIME ZONE 'Asia/Kolkata')::date<=$3::date)`
  const args=[actor.companyId,from,to]
  const pipeline=(await db.query(`SELECT d.pipeline_key,d.stage_key,d.status,count(*)::int AS count,coalesce(sum(d.value),0) AS value,coalesce(sum(d.value*d.probability/100),0) AS weighted_value,round(avg(extract(epoch FROM now()-d.stage_changed_at)/86400)) AS age_days FROM crm_deals d WHERE ${where} AND (NOT d.archived OR d.status<>'OPEN') GROUP BY d.pipeline_key,d.stage_key,d.status ORDER BY d.pipeline_key,d.stage_key`,args)).rows
  const owners=(await db.query(`SELECT d.owner_id,coalesce(cu.name,'Former team member') AS name,count(*) FILTER(WHERE d.status='WON')::int AS won,count(*) FILTER(WHERE d.status='LOST')::int AS lost,count(*) FILTER(WHERE d.status='OPEN' AND NOT d.archived)::int AS open,coalesce(sum(d.value) FILTER(WHERE d.status='WON'),0) AS won_value,coalesce(sum(d.value*d.probability/100) FILTER(WHERE d.status='OPEN' AND NOT d.archived),0) AS forecast FROM crm_deals d LEFT JOIN company_users cu ON cu.company_id=d.company_id AND cu.user_id=d.owner_id WHERE ${where} GROUP BY d.owner_id,cu.name ORDER BY won_value DESC`,args)).rows
  const forecast=(await db.query(`SELECT to_char(d.expected_close,'YYYY-MM') AS month,coalesce(sum(d.value),0) AS value,coalesce(sum(d.value*d.probability/100),0) AS weighted_value FROM crm_deals d WHERE ${where} AND d.status='OPEN' AND NOT d.archived GROUP BY month ORDER BY month NULLS LAST`,args)).rows
  const sources=(await db.query(`SELECT source,count(*)::int AS total,count(*) FILTER(WHERE lifecycle='CUSTOMER')::int AS converted FROM ${crmClientSource} r WHERE company_id=$1 AND ($2::date IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date>=$2::date) AND ($3::date IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date<=$3::date) GROUP BY source ORDER BY total DESC`,args)).rows
  const losses=(await db.query(`SELECT d.loss_reason,count(*)::int AS count,coalesce(sum(d.value),0) AS value FROM crm_deals d WHERE ${where} AND d.status='LOST' GROUP BY d.loss_reason ORDER BY count DESC`,args)).rows
  return {pipeline:pipeline.map(crmRow),owners:owners.map(crmRow),forecast:forecast.map(crmRow),sources,losses:losses.map(crmRow)}
}
