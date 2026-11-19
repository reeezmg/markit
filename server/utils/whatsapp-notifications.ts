import { randomUUID, createHash } from 'node:crypto'
import { createError } from 'h3'
import { pool } from '../db'
import { graph, connectionToken } from './connect-whatsapp'
import { normalizeRecipient } from './connect-whatsapp-security'
import { readNotificationFacts } from './whatsapp-notification-sources'
import { notificationEvents, normalizeNotificationRules, planNotifications, notificationStillRelevant, marketingEvent, eventLabel, type NotificationFact, type PlannedNotification } from '../../utils/whatsapp-notifications'
import { createReceiptShare } from './receiptShare'
import { createQuoteShare } from './quote-share'

type Db={query:(sql:string,args?:any[])=>Promise<any>}
export async function notificationsReady(db:Db=pool){
  const row=(await db.query(`SELECT to_regclass('public.whatsapp_notification_settings') IS NOT NULL
    AND to_regclass('public.whatsapp_notification_contacts') IS NOT NULL AND to_regclass('public.whatsapp_notification_sources') IS NOT NULL
    AND to_regclass('public.whatsapp_notification_outbox') IS NOT NULL AND to_regclass('public.whatsapp_installation_appointments') IS NOT NULL
    AND to_regclass('public.connect_whatsapp_connections') IS NOT NULL AND to_regclass('public.connect_whatsapp_messages') IS NOT NULL AS ready`)).rows[0]
  return !!row?.ready
}
export async function requireNotificationsReady(){if(!await notificationsReady())throw createError({statusCode:503,statusMessage:'Customer notification database setup is pending.'})}
const fail=(message:string)=>createError({statusCode:400,statusMessage:message})

export function validateNotificationTemplate(template:any,event:string){
  if(template.status!=='APPROVED')throw fail('Choose an approved template for '+eventLabel(event))
  if(!['UTILITY','MARKETING'].includes(template.category)||marketingEvent(event)&&template.category!=='MARKETING')throw fail('Feedback requests need a Marketing template; other notifications use Utility or Marketing.')
  const components=template.components||[],body=components.find((c:any)=>c.type==='BODY')?.text||''
  const variables=[...body.matchAll(/\{\{([^}]+)\}\}/g)].map((m:any)=>m[1])
  if(JSON.stringify([...new Set(variables)].sort())!==JSON.stringify(['1','2','3','4'])||components.some((c:any)=>c.type!=='BODY'&&(JSON.stringify(c).includes('{{')||c.format&&c.format!=='TEXT')))throw fail('Notification templates need exactly four numbered body variables: client, company, update, details. Use text-only headers and static buttons.')
  return template
}
export async function ownedNotificationTemplate(connection:any,id:string,event:string){
  if(!/^\d{1,40}$/.test(id))throw fail('Choose a notification template.')
  const token=connectionToken(connection);let after='';const seen=new Set<string>()
  do{
    const page=await graph(`${connection.waba_id}/message_templates`,token,'GET',undefined,{fields:'id,name,status,language,category,components',limit:'100',...(after?{after}:{})})
    const template=page.data?.find((t:any)=>t.id===id)
    if(template)return validateNotificationTemplate(template,event)
    after=page.paging?.next?page.paging?.cursors?.after||'':''
    if(seen.has(after))break;seen.add(after)
  }while(after)
  throw fail('The notification template does not belong to this company.')
}
export function notificationOrigin(){
  let url:URL
  try{url=new URL(process.env.WHATSAPP_NOTIFICATION_ORIGIN||'')}catch{throw fail('Configure WHATSAPP_NOTIFICATION_ORIGIN with the public Markit HTTPS address.')}
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw fail('WHATSAPP_NOTIFICATION_ORIGIN must be an HTTPS origin without a path or credentials.')
  return url.origin
}
export async function notificationSettings(company:string){
  if(!await notificationsReady())return {ready:false,enabled:false,rules:normalizeNotificationRules({}),events:notificationEvents}
  const row=(await pool.query('SELECT * FROM whatsapp_notification_settings WHERE company_id=$1',[company])).rows[0]
  return {ready:true,enabled:!!row?.enabled,rules:normalizeNotificationRules(row?.rules||{}),activatedAt:row?.activated_at,events:notificationEvents,originConfigured:!!process.env.WHATSAPP_NOTIFICATION_ORIGIN}
}
export async function saveNotificationSettings(company:string,actor:string,body:any){
  await requireNotificationsReady()
  if(typeof body.enabled!=='boolean')throw fail('Choose whether notifications are enabled.')
  const rules=normalizeNotificationRules(body.rules),conn=(await pool.query('SELECT * FROM connect_whatsapp_connections WHERE company_id=$1',[company])).rows[0]
  if(body.enabled){
    if(!conn?.active||!conn.subscribed)throw fail('Connect and subscribe this company’s WhatsApp number first.')
    notificationOrigin()
    if(['sale_created','service_invoice','payment_received','payment_reversed','return_completed'].some(event=>rules[event].enabled))createReceiptShare('configuration-check',company)
    if(rules.quote_shared.enabled)createQuoteShare('configuration-check',company,'configuration-check')
    const checked=new Map<string,any>()
    for(const [event,rule]of Object.entries(rules))if(rule.enabled){
      if(!checked.has(rule.templateId))checked.set(rule.templateId,await ownedNotificationTemplate(conn,rule.templateId,event))
      else validateNotificationTemplate(checked.get(rule.templateId),event)
    }
  }
  const db=await pool.connect()
  try{
    await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['wa-notifications:'+company])
    const old=(await db.query('SELECT enabled FROM whatsapp_notification_settings WHERE company_id=$1 FOR UPDATE',[company])).rows[0]
    // Baseline existing records before activation/re-activation. No historical sale or job blast.
    if(body.enabled&&!old?.enabled){
      for(const fact of await readNotificationFacts(db,company))await observeFact(db,company,fact)
    }
    await db.query(`INSERT INTO whatsapp_notification_settings(company_id,enabled,rules,updated_by,updated_at) VALUES($1,$2,$3::jsonb,$4,now())
      ON CONFLICT(company_id) DO UPDATE SET enabled=excluded.enabled,rules=excluded.rules,updated_by=excluded.updated_by,updated_at=now(),
      activated_at=CASE WHEN NOT whatsapp_notification_settings.enabled AND excluded.enabled THEN now() ELSE whatsapp_notification_settings.activated_at END`,[company,body.enabled,JSON.stringify(rules),actor])
    if(!body.enabled)await db.query("UPDATE whatsapp_notification_outbox SET status='CANCELLED',reason='Notifications paused',updated_at=now() WHERE company_id=$1 AND status='QUEUED'",[company])
    if(body.enabled&&!old?.enabled)await db.query("UPDATE whatsapp_notification_outbox SET status='QUEUED',reason='',updated_at=now() WHERE company_id=$1 AND status='CANCELLED' AND reason='Notifications paused' AND available_at>now() AND expires_at>now()",[company])
    await db.query('COMMIT')
  }catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}
  return notificationSettings(company)
}
async function observeFact(db:Db,company:string,fact:NotificationFact){
  await db.query(`INSERT INTO whatsapp_notification_sources(company_id,source_type,source_id,snapshot) VALUES($1,$2,$3,$4::jsonb)
    ON CONFLICT(company_id,source_type,source_id) DO UPDATE SET snapshot=excluded.snapshot,observed_at=now()`,[company,fact.type,fact.id,JSON.stringify(fact)])
}
async function enqueue(db:Db,company:string,event:PlannedNotification){
  return db.query(`INSERT INTO whatsapp_notification_outbox(id,company_id,event_key,event_type,source_type,source_id,client_id,payload,available_at,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) ON CONFLICT(company_id,event_key) DO NOTHING RETURNING id`,
    [randomUUID(),company,createHash('sha256').update(event.key).digest('hex'),event.type,event.sourceType,event.sourceId,event.clientId,JSON.stringify(event),event.availableAt,event.expiresAt])
}
/** Called inside a quote-share transaction, never performs an external send. */
export async function enqueueQuoteNotification(db:Db,company:string,quote:any){
  if(!await notificationsReady(db))return
  const settings=(await db.query('SELECT enabled,rules FROM whatsapp_notification_settings WHERE company_id=$1',[company])).rows[0]
  if(!settings?.enabled||!settings.rules?.quote_shared?.enabled)return
  const now=Date.now()
  if(!quote.clientId)return
  await enqueue(db,company,{type:'quote_shared',key:'quote_shared:quote:'+quote.id+':'+quote.clientId+':'+quote.revision,sourceType:'quote',sourceId:quote.id,clientId:quote.clientId,guard:{revision:quote.revision},availableAt:new Date(now).toISOString(),expiresAt:new Date(now+86400000).toISOString()})
}
export async function scanNotifications(company:string,now=new Date()){
  const db=await pool.connect();let queued=0
  try{
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
    const lock=(await db.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',['wa-notifications:'+company])).rows[0]
    if(!lock?.locked){await db.query('ROLLBACK');return {queued:0,busy:true}}
    const settings=(await db.query('SELECT * FROM whatsapp_notification_settings WHERE company_id=$1',[company])).rows[0]
    if(!settings?.enabled){await db.query('COMMIT');return {queued:0}}
    const previous=(await db.query('SELECT source_type,source_id,snapshot FROM whatsapp_notification_sources WHERE company_id=$1',[company])).rows
    const before=new Map(previous.map((r:any)=>[r.source_type+':'+r.source_id,r.snapshot as NotificationFact]))
    for(const fact of await readNotificationFacts(db,company)){
      for(const event of planNotifications(fact,before.get(fact.type+':'+fact.id) as NotificationFact|undefined,now,new Date(settings.activated_at).toISOString())){
        if(settings.rules?.[event.type]?.enabled)queued+=(await enqueue(db,company,event)).rowCount
      }
      await observeFact(db,company,fact)
    }
    await db.query("UPDATE whatsapp_notification_outbox SET status='CANCELLED',reason='Notification expired',updated_at=now() WHERE company_id=$1 AND status='QUEUED' AND expires_at<=now()",[company])
    await db.query('COMMIT');return {queued}
  }catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}
}
export async function saveNotificationContact(company:string,actor:string,body:any){
  await requireNotificationsReady()
  if(typeof body.serviceConsent!=='boolean'||typeof body.marketingConsent!=='boolean'||typeof body.evidence!=='string'||!body.evidence.trim()||body.evidence.length>1000)throw fail('Record the client’s permissions and how they were obtained.')
  let recipient:string;try{recipient=normalizeRecipient(body.recipient)}catch(e:any){throw fail(e.message)}
  const customer=(await pool.query(`SELECT c.phone FROM clients c JOIN company_clients cc ON cc.client_id=c.id WHERE cc.company_id=$1 AND c.id=$2 AND NOT c.deleted`,[company,String(body.clientId||'')])).rows[0]
  if(!customer)throw fail('Select a client linked to this company.')
  const db=await pool.connect()
  try{
    await db.query('BEGIN')
    await db.query('SELECT id FROM connect_whatsapp_connections WHERE company_id=$1 FOR UPDATE',[company])
    await db.query(`INSERT INTO whatsapp_notification_contacts(id,company_id,client_id,recipient,client_phone,service_consent,marketing_consent,evidence,updated_by,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) ON CONFLICT(company_id,client_id) DO UPDATE SET recipient=excluded.recipient,client_phone=excluded.client_phone,
      service_consent=excluded.service_consent,marketing_consent=excluded.marketing_consent,evidence=excluded.evidence,updated_by=excluded.updated_by,updated_at=now()`,
      [randomUUID(),company,body.clientId,recipient,customer.phone||'',body.serviceConsent,body.marketingConsent,body.evidence.trim(),actor])
    if(!body.serviceConsent&&!body.marketingConsent)await db.query("UPDATE whatsapp_notification_outbox SET status='CANCELLED',reason='Client opted out',updated_at=now() WHERE company_id=$1 AND client_id=$2 AND status='QUEUED'",[company,body.clientId])
    await db.query('COMMIT');return {saved:true}
  }catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}
}
export async function revokeNotificationContact(db:Db,connectionId:string,recipient:string,at=new Date()){
  if(!await notificationsReady(db))return
  // Meta timestamps have one-second precision; include permissions recorded in
  // that second so a newer STOP cannot miss a fractional-millisecond consent.
  await db.query(`UPDATE whatsapp_notification_contacts SET service_consent=false,marketing_consent=false,evidence='Client replied STOP',updated_by='webhook',updated_at=now()
    WHERE company_id=(SELECT company_id FROM connect_whatsapp_connections WHERE id=$1) AND recipient=$2 AND updated_at<($3::timestamptz + interval '1 second')`,[connectionId,recipient,at])
  await db.query(`UPDATE whatsapp_notification_outbox SET status='CANCELLED',reason='Client replied STOP',updated_at=now() WHERE status='QUEUED'
    AND company_id=(SELECT company_id FROM connect_whatsapp_connections WHERE id=$1) AND client_id IN(SELECT client_id FROM whatsapp_notification_contacts WHERE recipient=$2
    AND NOT service_consent AND NOT marketing_consent AND company_id=(SELECT company_id FROM connect_whatsapp_connections WHERE id=$1))`,[connectionId,recipient])
}
export async function saveInstallationAppointment(company:string,actor:string,body:any){
  await requireNotificationsReady()
  if(!['SCHEDULED','CANCELLED'].includes(body.status))throw fail('Choose a scheduled or cancelled installation appointment.')
  const at=new Date(body.appointmentOn),cancel=body.status==='CANCELLED'
  if(!cancel&&(!Number.isFinite(+at)||+at<=Date.now()))throw fail('Choose a future installation date and time.')
  if(typeof body.technician!=='string'||body.technician.length>200)throw fail('Enter the technician name.')
  const product=(await pool.query('SELECT id,status,installed_on FROM customer_products WHERE company_id=$1 AND id=$2',[company,String(body.customerProductId||'')])).rows[0]
  if(!product||!cancel&&(product.status!=='ACTIVE'||product.installed_on))throw fail('Choose an active product awaiting installation.')
  await pool.query(`INSERT INTO whatsapp_installation_appointments(id,company_id,customer_product_id,appointment_on,technician,status,updated_by,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(customer_product_id) DO UPDATE SET appointment_on=CASE WHEN excluded.status='CANCELLED' THEN whatsapp_installation_appointments.appointment_on ELSE excluded.appointment_on END,
    technician=excluded.technician,status=excluded.status,updated_by=excluded.updated_by,updated_at=now() WHERE whatsapp_installation_appointments.company_id=$2`,
    [randomUUID(),company,product.id,cancel?new Date():at,body.technician,cancel?'CANCELLED':'SCHEDULED',actor])
  return {saved:true}
}

export function notificationDetails(event:PlannedNotification,fact:NotificationFact,company:string){
  const labels:Record<string,string>={document:'Document',product:'Product',reference:'Reference',serial:'Serial',coverage:'Coverage',start:'Starts',expiry:'Expires',dueDate:'Due',date:'Date',total:'Total',balance:'Balance',amount:'Amount',paymentMethod:'Payment method',status:'Status',awb:'Tracking number',appointment:'Appointment',technician:'Technician',assessment:'Assessment',resolution:'Resolution',completedOn:'Completed',installedOn:'Installed',parts:'Parts used',nextServiceDate:'Next service'}
  const fields={...fact.fields}
  if(fields.appointment)fields.appointment=new Date(fields.appointment).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST'
  let detail=Object.entries(fields).filter(([,v])=>v).map(([k,v])=>(labels[k]||k)+': '+v).join('; ')
  let links=''
  if(fact.type==='bill'||fact.type==='payment'||fact.type==='order'&&fact.state.billId){
    const billId=fact.type==='bill'?fact.id:fact.state.billId
    links+='; View / download invoice: '+notificationOrigin()+'/receipt/'+encodeURIComponent(billId)+'?share='+encodeURIComponent(createReceiptShare(billId,company))
  }
  if(fact.type==='quote')links+='; View quote: '+notificationOrigin()+'/quote/'+createQuoteShare(fact.id,company,fact.state.revision)
  if(event.type==='feedback')links+='; Please reply with your feedback.'
  return detail.slice(0,Math.max(0,3000-links.length))+links
}

async function preflight(db:Db,company:string,row:any,now:Date){
  const conn=(await db.query('SELECT * FROM connect_whatsapp_connections WHERE company_id=$1 FOR UPDATE',[company])).rows[0]
  if(!conn?.active||!conn.subscribed)return {reason:'Company WhatsApp connection unavailable'}
  const settings=(await db.query('SELECT * FROM whatsapp_notification_settings WHERE company_id=$1',[company])).rows[0]
  const rule=settings?.rules?.[row.event_type]
  if(!settings?.enabled||!rule?.enabled||!rule.templateId)return {reason:'Notification rule is disabled or incomplete'}
  const contact=(await db.query(`SELECT n.*,c.name AS client_name,c.phone AS current_phone FROM whatsapp_notification_contacts n
    JOIN company_clients cc ON cc.company_id=n.company_id AND cc.client_id=n.client_id JOIN clients c ON c.id=n.client_id AND NOT c.deleted
    WHERE n.company_id=$1 AND n.client_id=$2 FOR UPDATE OF n`,[company,row.client_id])).rows[0]
  if(!contact||contact.client_phone!==(contact.current_phone||'')||!(marketingEvent(row.event_type)?contact.marketing_consent:contact.service_consent))return {reason:'Client permission is missing, withdrawn or belongs to an earlier phone number'}
  const fact=(await readNotificationFacts(db,company,{type:row.source_type,id:row.source_id}))[0]
  if(!notificationStillRelevant(row.payload,fact,now))return {reason:'Source changed, was cancelled or is no longer due'}
  return {conn,rule,contact,fact}
}

/** Intent commits before POST; uncertain/crashed sends never return to QUEUED. */
export async function deliverNotification(company:string,id:string,now=new Date()){
  const db=await pool.connect();let attempted=false,intent=false
  try{
    await db.query('BEGIN')
    await db.query('SELECT id FROM connect_whatsapp_connections WHERE company_id=$1 FOR UPDATE',[company])
    const row=(await db.query("SELECT * FROM whatsapp_notification_outbox WHERE id=$1 AND company_id=$2 AND status='QUEUED' AND available_at<=now() FOR UPDATE SKIP LOCKED",[id,company])).rows[0]
    if(!row){await db.query('COMMIT');return {skipped:true}}
    const state=await preflight(db,company,row,now)
    if(state.reason){await db.query("UPDATE whatsapp_notification_outbox SET status='SKIPPED',reason=$3,updated_at=now() WHERE id=$1 AND company_id=$2",[id,company,state.reason]);await db.query('COMMIT');return {skipped:true}}
    const template=await ownedNotificationTemplate(state.conn,state.rule.templateId,row.event_type)
    if(template.category==='MARKETING'&&!state.contact.marketing_consent)throw fail('Client has not permitted marketing messages.')
    const companyName=(await db.query('SELECT name FROM companies WHERE id=$1',[company])).rows[0]?.name||''
    const payload={messaging_product:'whatsapp',to:state.contact.recipient,type:'template',template:{name:template.name,language:{code:template.language},components:[{type:'body',parameters:[state.contact.client_name,companyName,eventLabel(row.event_type),notificationDetails(row.payload,state.fact!,company)].map(text=>({type:'text',text:String(text||'—')}))}]}}
    await db.query(`INSERT INTO connect_whatsapp_messages(id,connection_id,recipient,direction,kind,content,status,consent_at,actor_id)
      VALUES($1,$2,$3,'outbound','template',$4::jsonb,'PENDING',now(),'notification-worker')`,[id,state.conn.id,state.contact.recipient,JSON.stringify(payload)])
    await db.query("UPDATE whatsapp_notification_outbox SET status='SENDING',message_id=$1,updated_at=now() WHERE id=$1 AND company_id=$2",[id,company])
    await db.query('COMMIT');intent=true
    await db.query('BEGIN')
    // Same connection lock as signed receipts and opt-out processing.
    const current=await preflight(db,company,row,now)
    if(current.reason||current.contact.recipient!==state.contact.recipient||current.rule.templateId!==state.rule.templateId||template.category==='MARKETING'&&!current.contact.marketing_consent||JSON.stringify(current.fact)!==JSON.stringify(state.fact))throw createError({statusCode:409,statusMessage:'Notification changed before delivery'})
    attempted=true
    const result=await graph(`${current.conn.phone_id}/messages`,connectionToken(current.conn),'POST',payload)
    const metaId=result.messages?.[0]?.id
    if(!metaId)throw Error('Meta did not confirm a message ID')
    await db.query("UPDATE connect_whatsapp_messages SET status='ACCEPTED',meta_id=$2,status_at=now() WHERE id=$1",[id,metaId])
    await db.query("UPDATE whatsapp_notification_outbox SET status='ACCEPTED',reason='',updated_at=now() WHERE id=$1 AND company_id=$2",[id,company])
    await db.query('COMMIT');return {accepted:true}
  }catch(error:any){
    await db.query('ROLLBACK')
    const definiteRejection=error.statusCode===502&&Number(error.data?.httpStatus)>=400&&Number(error.data?.httpStatus)<500
    const status=attempted&&!definiteRejection?'UNKNOWN':'FAILED'
    const reason=attempted?(status==='UNKNOWN'?'Delivery unconfirmed; check activity before another send.':'Meta rejected the message; check its template/account.'):String(error.statusMessage||error.message||'Notification could not be prepared').slice(0,400)
    if(intent)await db.query('UPDATE connect_whatsapp_messages SET status=$2,status_at=now() WHERE id=$1',[id,status])
    await db.query("UPDATE whatsapp_notification_outbox SET status=$3,reason=$4,updated_at=now() WHERE id=$1 AND company_id=$2 AND status IN('QUEUED','SENDING')",[id,company,status,reason])
    return {failed:true,status}
  }finally{db.release()}
}
export async function processNotifications(company:string){
  await requireNotificationsReady()
  const scan=await scanNotifications(company)
  // A worker interrupted after its durable intent may have contacted Meta.
  await pool.query("UPDATE whatsapp_notification_outbox SET status='UNKNOWN',reason='Worker interrupted; check message activity before sending again.',updated_at=now() WHERE company_id=$1 AND status='SENDING' AND updated_at<now()-interval '10 minutes'",[company])
  const queued=(await pool.query("SELECT id FROM whatsapp_notification_outbox WHERE company_id=$1 AND status='QUEUED' AND available_at<=now() ORDER BY available_at,id LIMIT 10",[company])).rows
  const deliveries:any[]=[];for(const row of queued)deliveries.push(await deliverNotification(company,row.id))
  return {...scan,deliveries}
}
