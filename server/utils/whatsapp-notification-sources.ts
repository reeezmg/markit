import type { NotificationFact } from '../../utils/whatsapp-notifications'
import { billCreditCents } from '../../utils/bill-credit'

type Db={query:(sql:string,args?:any[])=>Promise<any>}
const text=(value:any)=>value==null?'':String(value)
// Existing business timestamp-without-time-zone columns store UTC, as in the
// after-sales registration contract. Never interpret them in the worker's OS zone.
const iso=(value:any)=>value?new Date(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)&&!/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)?value+'Z':value).toISOString():''
const day=(value:any)=>text(value).slice(0,10)
const sources:Record<string,{table:string;sql:string;requires?:string[]}>={
  bill:{table:'bills',requires:['payments','ecomm_orders'],sql:`SELECT to_jsonb(b) AS source,
    (SELECT coalesce(sum(p.amount),0) FROM payments p WHERE p.bill_id=b.id AND p.company_id=b.company_id AND NOT p.deleted AND p.status='POS_CREDIT_RECEIPT') AS collected,
    EXISTS(SELECT 1 FROM payments p WHERE p.bill_id=b.id AND p.company_id=b.company_id AND NOT p.deleted AND p.status IN('POS_CREDIT_RECEIPT','POS_CREDIT_REVERSED')) AS has_receipts,
    (SELECT o.id FROM ecomm_orders o WHERE o.bill_id=b.id AND o.company_id=b.company_id) AS order_id
    FROM bills b WHERE b.company_id=$1 AND b.id>$2 AND ($3='' OR b.id=$3) ORDER BY b.id LIMIT 250`},
  order:{table:'ecomm_orders',sql:`SELECT to_jsonb(o) AS source FROM ecomm_orders o WHERE o.company_id=$1 AND o.id>$2 AND ($3='' OR o.id=$3) ORDER BY o.id LIMIT 250`},
  quote:{table:'quotes',requires:['quote_custom_field_values'],sql:`SELECT to_jsonb(q) AS source,f.field_values->'_erpQuote'->>'revision' AS revision FROM quotes q
    LEFT JOIN quote_custom_field_values f ON f.quote_id=q.id AND f.company_id=q.company_id WHERE q.company_id=$1 AND q.id>$2 AND ($3='' OR q.id=$3) ORDER BY q.id LIMIT 250`},
  payment:{table:'payments',requires:['bills'],sql:`SELECT to_jsonb(p) AS source,to_jsonb(b) AS bill,
    (SELECT coalesce(sum(receipt.amount),0) FROM payments receipt WHERE receipt.bill_id=b.id AND receipt.company_id=b.company_id AND NOT receipt.deleted AND receipt.status='POS_CREDIT_RECEIPT') AS collected
    FROM payments p JOIN bills b ON b.id=p.bill_id AND b.company_id=p.company_id
    WHERE p.company_id=$1 AND p.id>$2 AND ($3='' OR p.id=$3) AND p.status IN('POS_CREDIT_RECEIPT','POS_CREDIT_REVERSED') ORDER BY p.id LIMIT 250`},
  unit:{table:'customer_products',requires:['customer_service_agreements'],sql:`SELECT to_jsonb(p) AS source,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.snapshot->>'name','startsOn',a.starts_on,'endsOn',a.ends_on) ORDER BY a.id)
      FROM customer_service_agreements a WHERE a.customer_product_id=p.id AND a.company_id=p.company_id AND a.status='ACTIVE'),'[]'::jsonb) AS coverage
    FROM customer_products p WHERE p.company_id=$1 AND p.id>$2 AND ($3='' OR p.id=$3) ORDER BY p.id LIMIT 250`},
  agreement:{table:'customer_service_agreements',requires:['customer_products'],sql:`SELECT to_jsonb(a) AS source,to_jsonb(p) AS product FROM customer_service_agreements a
    JOIN customer_products p ON p.id=a.customer_product_id AND p.company_id=a.company_id WHERE a.company_id=$1 AND a.id>$2 AND ($3='' OR a.id=$3) ORDER BY a.id LIMIT 250`},
  occurrence:{table:'maintenance_occurrences',requires:['customer_service_agreements','customer_products'],sql:`SELECT to_jsonb(o) AS source,to_jsonb(a) AS agreement,to_jsonb(p) AS product FROM maintenance_occurrences o
    JOIN customer_service_agreements a ON a.id=o.agreement_id AND a.company_id=o.company_id JOIN customer_products p ON p.id=a.customer_product_id AND p.company_id=a.company_id
    WHERE o.company_id=$1 AND o.id>$2 AND ($3='' OR o.id=$3) ORDER BY o.id LIMIT 250`},
  job:{table:'service_jobs',requires:['customer_service_agreements','customer_products'],sql:`SELECT to_jsonb(j) AS source,to_jsonb(p) AS product,to_jsonb(a) AS agreement,coalesce(cu.name,'Service team') AS technician FROM service_jobs j
    JOIN customer_service_agreements a ON a.id=j.agreement_id AND a.company_id=j.company_id JOIN customer_products p ON p.id=a.customer_product_id AND p.company_id=a.company_id
    LEFT JOIN company_users cu ON cu.user_id=j.assigned_to AND cu.company_id=j.company_id WHERE j.company_id=$1 AND j.id>$2 AND ($3='' OR j.id=$3) ORDER BY j.id LIMIT 250`},
  installation:{table:'whatsapp_installation_appointments',requires:['customer_products'],sql:`SELECT to_jsonb(i) AS source,to_jsonb(p) AS product FROM whatsapp_installation_appointments i
    JOIN customer_products p ON p.id=i.customer_product_id AND p.company_id=i.company_id WHERE i.company_id=$1 AND i.id>$2 AND ($3='' OR i.id=$3) ORDER BY i.id LIMIT 250`},
}

export function notificationFact(type:string,row:any):NotificationFact {
  const r=row.source,p=row.product||{},d=r.details||{}
  const f:NotificationFact={type,id:r.id,clientId:r.client_id||p.client_id||'',createdAt:iso(r.created_at||p.created_at)||'1970-01-01T00:00:00Z',valid:!r.deleted&&!r.precedence,state:{},fields:{}}
  const unit={productId:p.id,productStatus:p.status}
  const unitFields={product:text(p.name),reference:text(p.reference),serial:text(p.serial_number)}
  if(type==='bill'){
    let credit=0;try{credit=billCreditCents(r)/100}catch{f.valid=false}
    f.valid=f.valid&&!r.is_markit&&!r.credit_user_id&&(!r.type||r.type==='BILL')
    f.state={total:r.grand_total,balance:Math.max(0,credit-Number(row.collected||0)),dueDate:day(r.due_date),paid:r.payment_status==='PAID',orderId:row.order_id||'',hasReceipts:row.has_receipts,serviceJobId:row.service_job_id||'',updatedAt:r.updated_at}
    f.fields={document:text(r.invoice_code||r.invoice_number),total:text(r.grand_total),balance:text(f.state.balance),dueDate:f.state.dueDate,date:day(r.created_at),paymentMethod:text(r.payment_method)}
  }else if(type==='order'){
    f.state={status:r.status,awb:r.meta?.awb||r.meta?.shipping?.awb||'',total:r.grand_total,paid:r.payment_status==='PAID',billId:r.bill_id||''}
    f.fields={document:text(r.order_number),total:text(r.grand_total),status:text(r.status),awb:f.state.awb,paymentMethod:text(r.payment_method)}
  }else if(type==='quote'){
    f.state={status:r.status,revision:row.revision||'',expiresOn:day(r.expiry_date)}
    f.fields={document:text(r.quote_number),total:text(r.total),expiry:day(r.expiry_date)}
  }else if(type==='payment'){
    const b=row.bill||{}
    f.clientId=f.clientId||b.client_id||''
    let credit=0;try{credit=billCreditCents(b)/100}catch{f.valid=false}
    f.valid=f.valid&&!b.deleted&&!b.precedence&&!b.is_markit&&!b.credit_user_id&&(!b.type||b.type==='BILL')
    f.state={status:r.status,billId:r.bill_id};f.fields={document:text(b.invoice_code||b.invoice_number),amount:text(r.amount),balance:text(Math.max(0,credit-Number(row.collected||0))),paymentMethod:text(r.payment_mode),date:day(r.payment_date)}
  }else if(type==='unit'){
    const coverage=row.coverage||[]
    f.state={status:r.status,installedOn:day(r.installed_on),replacementId:r.replaced_by_id||'',coverageVersion:coverage.length?JSON.stringify(coverage.map((a:any)=>[a.id,a.startsOn])):''}
    f.fields={product:text(r.name),reference:text(r.reference),serial:text(r.serial_number),installedOn:day(r.installed_on),coverage:coverage.map((a:any)=>`${a.name}: starts ${a.startsOn}${a.endsOn?', expires '+a.endsOn:''}`).join('; ')}
  }else if(type==='agreement'){
    f.state={...unit,status:r.status,startsOn:day(r.starts_on),endsOn:day(r.ends_on)}
    f.fields={...unitFields,coverage:text(r.snapshot?.name||r.kind),start:f.state.startsOn,expiry:f.state.endsOn}
  }else if(type==='occurrence'){
    f.state={...unit,status:r.status,dueOn:day(r.due_on),agreementStatus:row.agreement?.status}
    f.fields={...unitFields,dueDate:f.state.dueOn,coverage:text(r.snapshot?.name)}
  }else if(type==='job'){
    f.state={...unit,kind:r.kind,status:r.status,appointmentOn:iso(r.appointment_on),assignedTo:r.assigned_to||'',completedOn:day(r.completed_on),updatedAt:r.updated_at,assessment:d.assessment||'',resolution:d.resolution||''}
    f.valid=f.valid&&(p.status==='ACTIVE'||['COMPLETED','RESOLVED','REJECTED','CANCELLED'].includes(r.status))
    f.fields={...unitFields,status:text(r.status),appointment:f.state.appointmentOn,technician:text(row.technician),assessment:text(d.assessment),resolution:text(d.resolution),completedOn:f.state.completedOn,
      parts:(d.parts||[]).map((line:any)=>`${line.name} (${line.quantity})`).join(', '),nextServiceDate:day(row.agreement?.next_due)}
  }else if(type==='installation'){
    f.state={...unit,status:r.status,appointmentOn:iso(r.appointment_on),technician:r.technician,installedOn:day(p.installed_on),updatedAt:r.updated_at}
    f.fields={...unitFields,appointment:f.state.appointmentOn,technician:text(r.technician)}
  }
  return f
}

/** Keyset pagination includes all committed seller/public records without source hooks or browser dependence. */
export async function readNotificationFacts(db:Db,company:string,filter?:{type:string;id:string}):Promise<NotificationFact[]>{
  const ready=(await db.query(`SELECT name,to_regclass('public.'||name) IS NOT NULL AS ready FROM unnest($1::text[]) AS name`,[[...new Set(Object.values(sources).flatMap(s=>[s.table,...s.requires||[]])),'service_jobs','ecomm_orders']])).rows
  const available=new Set(ready.filter((r:any)=>r.ready).map((r:any)=>r.name)),facts:NotificationFact[]=[]
  for(const [type,s]of Object.entries(sources)){
    if(filter&&filter.type!==type)continue
    if(![s.table,...s.requires||[]].every(t=>available.has(t)))continue
    let cursor=''
    do{
      const sql=type==='bill'&&available.has('service_jobs')?s.sql.replace('SELECT to_jsonb(b) AS source,',`SELECT to_jsonb(b) AS source,(SELECT j.id FROM service_jobs j WHERE j.bill_id=b.id AND j.company_id=b.company_id) AS service_job_id,`):s.sql
      const rows=(await db.query(sql,[company,cursor,filter?.id||''])).rows
      for(const row of rows)facts.push(notificationFact(type,row))
      if(filter||rows.length<250)break
      cursor=rows.at(-1).source.id
    }while(true)
  }
  return facts
}
