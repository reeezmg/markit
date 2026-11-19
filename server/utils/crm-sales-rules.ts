import { createHash } from 'node:crypto'
import { crmAudit, crmRead, crmRow, readCrmSettings, saveCrmRecord, type CrmDb } from './crm'
import type { CrmSalesRule } from '../../utils/crm'

type State={status:string;paymentStatus:string;deleted:boolean;clientId:string|null}
const sources={
  QUOTE:{table:'quotes',select:"status::text AS status,''::text AS payment_status,deleted,client_id"},
  SALES_ORDER:{table:'sales_orders',select:"status::text AS status,''::text AS payment_status,deleted,client_id"},
  BILL:{table:'bills',select:"coalesce(status::text,'') AS status,payment_status::text AS payment_status,coalesce(deleted,false) AS deleted,client_id",extra:" AND NOT is_markit AND COALESCE(type::text,'BILL')='BILL' AND NOT COALESCE(precedence,false)"},
} as const
export function crmSalesEventMatches(event:CrmSalesRule['event'],kind:string,state:State){
  if(event==='INVOICE_CANCELLED')return kind==='BILL'&&(state.deleted||state.status==='CANCELED')
  if(state.deleted)return false
  if(kind==='QUOTE')return event==='QUOTE_'+state.status
  if(kind==='SALES_ORDER')return event==='SALES_ORDER_'+state.status
  if(kind==='BILL'&&state.status!=='CANCELED')return event==='INVOICE_PAID'?state.paymentStatus==='PAID':event==='INVOICE_PAYMENT_PENDING'&&state.paymentStatus==='PENDING'
  return false
}
export function crmSalesEventChanged(event:CrmSalesRule['event'],kind:string,before:State,after:State){
  if(!crmSalesEventMatches(event,kind,after))return false
  if(event==='INVOICE_CANCELLED')return !crmSalesEventMatches(event,kind,before)
  return event.startsWith('INVOICE_')?before.paymentStatus!==after.paymentStatus:before.status!==after.status
}
/** Caller holds the company's CRM transaction/advisory lock. Read sales sources;
 * write CRM only. Audited observations form an idempotent, no-replay cursor. */
export async function processCrmSalesRules(db:CrmDb,companyId:string,baselineOnly=false){
  const {settings}=await readCrmSettings(db,companyId),rules=settings.salesRules.filter(r=>r.enabled)
  const result={checked:0,baselined:0,updated:0,skipped:0}
  if(!rules.length)return result
  const actor={companyId,userId:'crm-sales-rules',role:'system',manager:true},changed=new Set<string>()
  // Keyset pages cover all links, including companies with more than one page.
  for(const rule of rules){
  const kind=rule.event.startsWith('QUOTE_')?'QUOTE':rule.event.startsWith('SALES_ORDER_')?'SALES_ORDER':'BILL'
  let cursor=''
  for(;;){
    const links=(await db.query(`SELECT id,deal_id,kind,document_id FROM crm_document_links WHERE company_id=$1 AND id>$2 AND kind=$3 ORDER BY id LIMIT 200`,[companyId,cursor,kind])).rows
    if(!links.length)break
    for(const link of links){
      cursor=link.id
      const source=sources[link.kind as keyof typeof sources]
      const document=(await db.query(`SELECT ${source.select} FROM ${source.table} WHERE company_id=$1 AND id=$2${'extra' in source?source.extra:''}`,[companyId,link.document_id])).rows[0]
      // A missing/deleted physical source cannot authorize a sales outcome.
      if(!document)continue
      const state:State={status:document.status,paymentStatus:document.payment_status,deleted:document.deleted===true,clientId:document.client_id||null}
        const revision=createHash('sha256').update(JSON.stringify(rule)).digest('hex').slice(0,24),identity=revision+':'+link.id
        const observed=(await db.query(`SELECT changes FROM crm_audit WHERE company_id=$1 AND entity_type='sales-rule' AND entity_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1`,[companyId,identity])).rows[0]?.changes?.after
        const snapshot={state,ruleKey:rule.key,ruleName:rule.name,linkId:link.id,documentId:link.document_id,documentKind:link.kind,dealId:link.deal_id}
        if(!observed){await crmAudit(db,actor,'sales-rule',identity,'Baseline recorded',null,snapshot);result.baselined++;continue}
        if(baselineOnly||JSON.stringify(observed.state)===JSON.stringify(state))continue
        result.checked++
        // Identity-only edits are not status transitions and never move deals.
        const transition=observed.state.status!==state.status||observed.state.paymentStatus!==state.paymentStatus||observed.state.deleted!==state.deleted
        let decision='No matching event'
        if(transition&&crmSalesEventChanged(rule.event,link.kind,observed.state,state)){
          const deal=await crmRead(db,companyId,'deals',link.deal_id,true)
          const pipeline=settings.pipelines.find(p=>p.key===rule.pipelineKey)!,target=pipeline.stages.find(s=>s.key===rule.stageKey)!
          const from=pipeline.stages.findIndex(s=>s.key===deal.stage_key),to=pipeline.stages.findIndex(s=>s.key===target.key)
          const owner=(await db.query(`SELECT user_id FROM company_users WHERE company_id=$1 AND user_id=$2 AND status=true AND deleted=false AND role::text IN('admin','manager','user','biller','accountant')`,[companyId,deal.owner_id])).rows[0]
          const client=deal.client_id?await crmRead(db,companyId,'clients',deal.client_id).catch((error:any)=>{if(error.statusCode===404)return null;throw error}):undefined
          if(deal.archived||deal.status!=='OPEN')decision='Skipped: deal is archived or closed'
          else if(deal.pipeline_key!==rule.pipelineKey||rule.fromStageKey&&deal.stage_key!==rule.fromStageKey)decision='Skipped: starting pipeline/stage does not match'
          else if(deal.client_id&&deal.client_id!==state.clientId)decision='Skipped: document client no longer matches deal'
          else if(deal.client_id&&(!client||client.archived))decision='Skipped: linked client is no longer active'
          else if(!owner)decision='Skipped: deal owner is no longer active'
          else if(changed.has(deal.id))decision='Skipped: an earlier rule already updated this deal in this check'
          else if(deal.stage_key===target.key||rule.forwardOnly&&to<=from)decision='Skipped: same or earlier stage'
          else{
            await saveCrmRecord(db,actor,'deals',{...crmRow(deal),stageKey:target.key,lossReason:target.status==='LOST'?rule.lossReason:deal.loss_reason},deal.id)
            await crmAudit(db,actor,'deals',deal.id,'Sales rule applied', {stageKey:deal.stage_key}, {...snapshot,name:deal.name,event:rule.event,stageKey:target.key})
            result.updated++;changed.add(deal.id);decision='Applied'
          }
          if(decision!=='Applied'){result.skipped++;await crmAudit(db,actor,'deals',deal.id,'Sales rule skipped',null,{...snapshot,name:deal.name,decision})}
        }
        await crmAudit(db,actor,'sales-rule',identity,'Sales state observed',observed,{...snapshot,decision})
    }
    if(links.length<200)break
  }
  }
  return result
}
