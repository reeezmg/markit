import { createError } from 'h3'
import { invoiceSendStatusSql } from './invoice-flow'
import { documentAmountSql, documentDateSql, documentListOptions } from './document-list'

export function invoiceListQuery(companyIds: string[], query: Record<string, any>, payments = false) {
  const sorts = payments
    ? ['paymentDate','invoiceNumber','clientName','amount','paymentMethod','receivingAccount','reference','status']
    : ['invoiceNumber','clientName','invoiceDate','dueDate','grandTotal','amountReceived','balanceDue','invoicePaymentStatus','sendStatus']
  const options = documentListOptions(query, sorts, payments ? 'paymentDate' : 'invoiceDate')
  const state = String(query.state || '')
  if (!['','unpaid','partial','paid','overdue'].includes(state)) throw createError({statusCode:400,statusMessage:'Invalid invoice status.'})
  const search = '%' + String(query.q || '').trim().slice(0,200) + '%'
  const values: any[] = [companyIds, search]
  let clientFilter = ''
  if (query.clientId) {
    if (typeof query.clientId !== 'string' || query.clientId.length > 128) throw createError({statusCode:400,statusMessage:'Invalid customer.'})
    values.push(query.clientId); clientFilter = ` AND b.client_id=$${values.length}`
  }
  const owner = `b.company_id=ANY($1::text[]) AND b.deleted=false AND b.precedence IS NOT TRUE
    AND b.is_markit=false AND COALESCE(b.type::text,'BILL')='BILL' AND b.credit_user_id IS NULL ${clientFilter}`
  const matches = `(COALESCE(b.invoice_code,b.invoice_number::text) ILIKE $2 OR c.name ILIKE $2 OR c.phone ILIKE $2 OR b.subject ILIKE $2)`
  let select: string
  if (payments) {
    const status = String(query.status || '')
    if (!['','POS_CREDIT_RECEIPT','POS_CREDIT_REVERSED'].includes(status)) throw createError({statusCode:400,statusMessage:'Invalid payment status.'})
    let filters = documentDateSql('p.payment_date', options.dates, values)
      + documentAmountSql('p.amount', options.amounts, values)
    if (status) { values.push(status); filters += ` AND p.status=$${values.length}` }
    select = `SELECT p.id,p.company_id AS "companyId",b.id AS "billId",b.invoice_number AS "invoiceNumber",
      b.invoice_code AS "invoiceCode",c.name AS "clientName",c.phone AS "clientPhone",co.name AS "companyName",
      p.payment_date AT TIME ZONE 'UTC' AS "paymentDate",p.payment_mode AS "paymentMethod",p.payment_reference AS reference,
      p.amount,p.status,a.name AS "receivingAccount",p.created_at AS "sortDate"
      FROM payments p JOIN bills b ON b.id=p.bill_id AND b.company_id=p.company_id
      JOIN companies co ON co.id=b.company_id LEFT JOIN clients c ON c.id=b.client_id
      LEFT JOIN accountant_v2_accounting_accounts a ON a.id=p.deposit_to AND a.company_id=p.company_id
      WHERE ${owner} AND p.deleted=false AND p.status IN ('POS_CREDIT_RECEIPT','POS_CREDIT_REVERSED')
      AND (${matches} OR p.payment_reference ILIKE $2) ${filters}`
  } else {
    const obligation = `CASE WHEN b.payment_method='Credit' THEN COALESCE(b.grand_total,0)
      ELSE COALESCE((SELECT SUM((part->>'amount')::numeric) FROM jsonb_array_elements(COALESCE(b.split_payments,'[]'::jsonb)) part WHERE part->>'method'='Credit'),0) END`
    select = `SELECT b.id,b.company_id AS "companyId",co.name AS "companyName",b.invoice_number AS "invoiceNumber",
      b.invoice_code AS "invoiceCode",b.created_at AT TIME ZONE 'UTC' AS "invoiceDate",b.created_at AS "sortDate",b.subject,
      to_char(b.due_date,'YYYY-MM-DD') AS "dueDate",b.invoice_payment_terms AS "invoicePaymentTerms",
      c.name AS "clientName",c.phone AS "clientPhone",b.grand_total AS "grandTotal",
      b.payment_method AS "paymentMethod",b.payment_status AS "paymentStatus",b.split_payments AS "splitPayments",
      (${obligation}) AS obligation,COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.bill_id=b.id AND p.company_id=b.company_id AND p.deleted=false AND p.status='POS_CREDIT_RECEIPT'),0) AS collected,
      COALESCE(${invoiceSendStatusSql},'Not sent') AS "sendStatus"
      FROM bills b JOIN companies co ON co.id=b.company_id LEFT JOIN clients c ON c.id=b.client_id
      WHERE ${owner} AND b.payment_status IN ('PENDING','PAID') AND b.client_id IS NOT NULL
      AND b.payment_method IN ('Credit','Split') AND ${query.collectible === '1' ? 'true' : 'b.invoice_code IS NOT NULL'} AND ${matches}
      ${documentDateSql('b.created_at', options.dates, values)}
      ${documentAmountSql('b.grand_total', options.amounts, values)}`
    select = `SELECT source.*,GREATEST(0,obligation-collected) AS "balanceDue",
      COALESCE("grandTotal",0)-GREATEST(0,obligation-collected) AS "amountReceived",
      CASE WHEN obligation-collected<=0.005 THEN 'Paid' WHEN collected>0 OR obligation<"grandTotal" THEN 'Partially paid' ELSE 'Unpaid' END AS "invoicePaymentStatus",
      ("dueDate"::date<(now() AT TIME ZONE 'Asia/Kolkata')::date AND obligation-collected>0.005) AS overdue
      FROM (${select}) source WHERE obligation>0`
    const filters: Record<string,string> = { unpaid: 'obligation-collected>0.005', partial: '(collected>0 OR obligation<"grandTotal") AND obligation-collected>0.005', paid: 'obligation-collected<=0.005', overdue: `"dueDate"::date<(now() AT TIME ZONE 'Asia/Kolkata')::date AND obligation-collected>0.005` }
    if (state) select += ' AND ' + filters[state]
  }
  const summary = payments
    ? `json_build_object('amount',COALESCE(sum(amount) FILTER (WHERE status='POS_CREDIT_RECEIPT'),0),
        'reversed',COALESCE(sum(amount) FILTER (WHERE status='POS_CREDIT_REVERSED'),0),
        'count',count(*) FILTER (WHERE status='POS_CREDIT_RECEIPT'))`
    : `json_build_object('amount',COALESCE(sum("grandTotal"),0),'received',COALESCE(sum("amountReceived"),0),
        'balance',COALESCE(sum("balanceDue"),0),'overdue',COALESCE(sum("balanceDue") FILTER (WHERE overdue),0))`
  values.push(options.pageSize, (options.page-1)*options.pageSize)
  return { sql: `WITH matched AS (${select}), paged AS (SELECT * FROM matched ORDER BY "${options.sort}" ${options.order} NULLS LAST,id DESC LIMIT $${values.length-1} OFFSET $${values.length})
    SELECT (SELECT count(*) FROM matched) AS total,COALESCE((SELECT json_agg(paged) FROM paged),'[]'::json) AS rows,
      (SELECT ${summary} FROM matched) AS summary`, values }
}
