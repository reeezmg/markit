import { defineEventHandler, getQuery, getRequestURL, readBody, setHeader } from 'h3'
import { pool } from '../../db'
import { crmActor, crmError, crmRequireManager } from '../../utils/crm-access'
import { crmReady, crmRow, crmList, crmTableReady, readCrmSettings, saveCrmSettings, saveCrmRecord, archiveCrmRecords, crmStaffList } from '../../utils/crm'
import { crmDetail, crmClientChoices, crmSummary, crmReports, crmImport, crmRead, linkCrmDocument } from '../../utils/crm-workflows'
import { crmKinds, crmCsv, type CrmKind } from '../../../utils/crm'
import { crmCampaigns } from '../../utils/crm-campaigns'
import { readSalesWorkflow } from '../../utils/sales-workflow'

export default defineEventHandler(async event=>{
  const actor=await crmActor(event),query=getQuery(event)
  const path=getRequestURL(event).pathname.replace(/^\/api\/crm\/?/,'').split('/').filter(Boolean).map(decodeURIComponent)
  const [resource,id,action]=path
  if(resource==='campaigns')return crmCampaigns(event,actor,path)
  const write=event.method!=='GET',body=write?await readBody(event):query
  if(!body||typeof body!=='object'||Array.isArray(body))throw crmError('Enter valid CRM details.')
  const db=await pool.connect()
  try{
    await db.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    if(write)await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['crm:'+actor.companyId])
    const ready=await crmReady(db)
    let result:any
    if(resource==='bootstrap'&&event.method==='GET'){
      const staff=await crmStaffList(db,actor.companyId)
      const company=(await db.query('SELECT currency FROM companies WHERE id=$1',[actor.companyId])).rows[0]
      result={ready,...(ready?await readCrmSettings(db,actor.companyId):{}),staff,actor,currency:company?.currency||'INR',workflow:await readSalesWorkflow(db,actor.companyId),marketingReady:await crmTableReady(db,'ecomm_marketing_campaigns')}
    }else{
      if(!ready)throw crmError('CRM database installation is pending. Review the prepared CRM update before activation.',503)
      const kind=resource as CrmKind
      if(resource==='settings'&&event.method==='GET')result=await readCrmSettings(db,actor.companyId)
      else if(resource==='settings'&&event.method==='PUT')result=await saveCrmSettings(db,actor,body)
      else if(resource==='summary'&&event.method==='GET')result=await crmSummary(db,actor)
      else if(resource==='reports'&&event.method==='GET')result=await crmReports(db,actor,query)
      else if(resource==='client-choices'&&event.method==='GET')result=await crmClientChoices(db,actor,String(query.q||''))
      else if(resource==='order-summary'&&id&&event.method==='GET'){
        if(!await crmTableReady(db,'ecomm_orders'))throw crmError('Order history is unavailable.',503)
        const order=(await db.query(`SELECT id,order_number AS number,grand_total AS total,status,payment_status,bill_id,created_at FROM ecomm_orders WHERE company_id=$1 AND id=$2`,[actor.companyId,id])).rows[0]
        if(!order)throw crmError('Order not found.',404);result=crmRow(order)
      }
      else if(resource==='clients'&&id==='import'&&event.method==='POST')result=await crmImport(db,actor,body)
      else if(resource==='deals'&&id&&action==='documents'&&event.method==='POST')result=await linkCrmDocument(db,actor,id,body)
      else if(resource==='documents'&&event.method==='GET'){
        const kinds:Record<string,{table:string;label:string;extra:string}>={QUOTE:{table:'quotes',label:'quote_number',extra:'AND deleted=false'},BILL:{table:'bills',label:'coalesce(invoice_code,invoice_number::text)',extra:"AND deleted=false AND is_markit=false AND COALESCE(type::text,'BILL')='BILL'"},ORDER:{table:'ecomm_orders',label:'order_number::text',extra:''}}
        const source=Object.hasOwn(kinds,String(query.kind))?kinds[String(query.kind)]:null;if(!source)throw crmError('Choose a document type.')
        result=await crmTableReady(db,source.table)?(await db.query(`SELECT id,${source.label} AS name,client_id FROM ${source.table} WHERE company_id=$1 AND ($2='' OR client_id=$2) AND concat_ws(' ',id,${source.label}) ILIKE $3 ${source.extra} ORDER BY id LIMIT 50`,[actor.companyId,String(query.clientId||''),'%'+String(query.q||'').slice(0,100)+'%'])).rows:[]
      }
      else if(crmKinds.includes(kind)&&id==='export'&&event.method==='GET'){
        const list=await crmList(db,actor,kind,query,true)
        const columns:[string,string][]=kind==='clients'?[['clientId','Client ID'],['name','Name'],['phone','Phone'],['email','Email'],['lifecycle','Type'],['leadStatus','Lead status'],['source','Source'],['ownerName','Owner'],['score','Score'],['tags','Tags']]:kind==='deals'?[['name','Deal'],['clientName','Contact'],['pipelineKey','Pipeline'],['stageKey','Stage'],['status','Outcome'],['value','Value'],['probability','Probability'],['expectedClose','Expected close'],['ownerName','Owner']]:kind==='accounts'?[['name','Account'],['industry','Industry'],['phone','Phone'],['email','Email'],['website','Website'],['ownerName','Owner']]:[['subject','Subject'],['kind','Type'],['status','Status'],['priority','Priority'],['dueAt','Due'],['ownerName','Owner'],['clientName','Contact']]
        if(kind==='clients'){const {settings}=await readCrmSettings(db,actor.companyId);for(const field of settings.customFields){const key='custom:'+field.label;columns.push([key,key]);for(const row of list.rows)row[key]=row.customFields?.[field.key]??''}}
        setHeader(event,'Content-Type','text/csv; charset=utf-8');setHeader(event,'Content-Disposition',`attachment; filename="crm-${kind}.csv"`)
        setHeader(event,'X-CRM-Export-Truncated',String(list.truncated));result=crmCsv(list.rows,columns)
      }
      else if(crmKinds.includes(kind)&&id==='bulk'&&event.method==='POST'){
        if(body.action==='archive')result=await archiveCrmRecords(db,actor,kind,body)
        else if(body.action==='assign'){
          crmRequireManager(actor);if(!Array.isArray(body.records)||!body.records.length||body.records.length>200)throw crmError('Select up to 200 records.')
          for(const item of body.records){const row=await crmRead(db,actor,kind,String(item.id));await saveCrmRecord(db,actor,kind,{...crmRow(row),ownerId:body.ownerId,version:item.version},row.id)}result={count:body.records.length}
        }else throw crmError('Choose an available bulk action.')
      }
      else if(crmKinds.includes(kind)&&!id&&event.method==='GET')result=await crmList(db,actor,kind,query)
      else if(crmKinds.includes(kind)&&!id&&event.method==='POST')result=await saveCrmRecord(db,actor,kind,body)
      else if(crmKinds.includes(kind)&&id&&!action&&event.method==='GET')result=await crmDetail(db,actor,kind,id)
      else if(crmKinds.includes(kind)&&id&&!action&&event.method==='PUT')result=await saveCrmRecord(db,actor,kind,body,id)
      else throw crmError('CRM endpoint not found.',404)
    }
    await db.query('COMMIT');return result
  }catch(error:any){await db.query('ROLLBACK');if(error.code==='23505')throw crmError('A matching record was saved in another session. Reload and open the existing record.',409);throw error}finally{db.release()}
})
