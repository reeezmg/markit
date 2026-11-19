import { createError } from 'h3'
import { quoteStatuses } from '../../utils/erp-quote'
import { quoteColumns, quoteJoins } from './erp-quotes'
import { documentAmountSql, documentDateSql, documentListOptions } from './document-list'

export function quoteListQuery(companyId: string, query: Record<string, any>) {
  const options = documentListOptions(query, ['quoteNumber', 'quoteDate', 'clientName', 'expiryDate', 'status', 'total'], 'quoteDate')
  const status = String(query.status || '')
  if (status && !quoteStatuses.includes(status as any)) throw createError({ statusCode: 400, statusMessage: 'Select a valid quote status.' })
  const values: any[] = [companyId, `%${String(query.q || '').trim().slice(0, 200)}%`, status]
  const where = `q.company_id=$1 AND q.deleted=false AND ($3='' OR q.status::text=$3)
    AND (q.quote_number ILIKE $2 OR q.subject ILIKE $2 OR q.reference_number ILIKE $2 OR c.name ILIKE $2 OR c.phone ILIKE $2
      OR f.field_values->'_erpQuote'->'customer'->>'name' ILIKE $2 OR f.field_values->'_erpQuote'->'customer'->>'phone' ILIKE $2)`
    + (query.drafts === '1' ? ` AND q.status='ACCEPTED' AND f.field_values->'_erpQuote'->'workflow'->'invoiceDraft' IS NOT NULL
      AND f.field_values->'_erpQuote'->'workflow'->'invoiceDraft' <> 'null'::jsonb
      AND COALESCE(f.field_values->'_erpQuote'->'workflow'->>'invoiceId','')=''` : '')
    + documentDateSql('q.quote_date', options.dates, values, true)
    + documentAmountSql('q.total', options.amounts, values)
  values.push(options.pageSize, (options.page - 1) * options.pageSize)
  return { values, sql: `WITH matched AS (SELECT ${quoteColumns} FROM quotes q ${quoteJoins} WHERE ${where}),
    paged AS (SELECT * FROM matched ORDER BY "${options.sort}" ${options.order} NULLS LAST,"quoteNumber" DESC,id DESC LIMIT $${values.length - 1} OFFSET $${values.length})
    SELECT (SELECT count(*) FROM matched) AS total,
      COALESCE((SELECT json_agg(paged) FROM paged),'[]'::json) AS rows,
      (SELECT json_build_object('amount',COALESCE(sum(total),0),
        'draft',COALESCE(sum(total) FILTER (WHERE status='DRAFT'),0),
        'sent',COALESCE(sum(total) FILTER (WHERE status='SENT'),0),
        'accepted',COALESCE(sum(total) FILTER (WHERE status='ACCEPTED'),0),
        'declined',COALESCE(sum(total) FILTER (WHERE status='DECLINED'),0)) FROM matched) AS summary` }
}
