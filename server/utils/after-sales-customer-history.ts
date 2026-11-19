import { serviceError } from './after-sales-lifecycle'

/** Read purchases without registering or changing any historical customer units. */
export async function customerServiceHistory(db: any, companyId: string, input: any) {
  const clientId = typeof input.id === 'string' ? input.id : ''
  if (!clientId || clientId.length > 128) throw serviceError('Select a client.', 400)
  const page = Number(input.page ?? 1), pageSize = Number(input.pageSize ?? 20)
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || ![10, 20, 50].includes(pageSize))
    throw serviceError('Select a valid page and page size.', 400)
  const customer = (await db.query(`SELECT c.id,c.name,c.phone,c.email FROM clients c
    JOIN company_clients cc ON cc.client_id=c.id
    WHERE c.id=$1 AND cc.company_id=$2 AND c.deleted=false`, [clientId, companyId])).rows[0]
  if (!customer) throw serviceError('Client not found in this company.', 404)
  const result = (await db.query(`WITH purchases AS (
    SELECT 'unit:'||p.id AS id,p.id AS customer_product_id,p.name,
      COALESCE(NULLIF(i.barcode,''),e.barcode,'') AS barcode,p.serial_number,p.reference,
      p.purchased_on,p.bill_id,COALESCE(NULLIF(b.invoice_code,''),b.invoice_number::text) AS invoice_code,
      1::double precision AS quantity,p.status,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',a.kind,'name',a.snapshot->>'name','status',a.status) ORDER BY a.kind,a.id)
        FROM customer_service_agreements a WHERE a.customer_product_id=p.id AND a.company_id=p.company_id),'[]'::jsonb) AS agreements
    FROM customer_products p
    LEFT JOIN items i ON i.id=p.item_id AND i.company_id=p.company_id
    LEFT JOIN bills b ON b.id=p.bill_id AND b.company_id=p.company_id
    LEFT JOIN entries e ON e.id=p.entry_id AND e.bill_id=b.id
    WHERE p.company_id=$2 AND p.client_id=$1
    UNION ALL
    SELECT 'purchase:'||e.id,NULL::text,COALESCE(NULLIF(e.name,''),'Purchased product'),COALESCE(e.barcode,''),NULL::text,NULL::text,
      b.created_at::date,b.id,COALESCE(NULLIF(b.invoice_code,''),b.invoice_number::text),
      e.qty-COALESCE(registered.count,0),'UNREGISTERED','[]'::jsonb
    FROM bills b JOIN entries e ON e.bill_id=b.id
    LEFT JOIN LATERAL (SELECT count(*)::int AS count FROM customer_products p
      WHERE p.company_id=$2 AND p.client_id=$1 AND p.entry_id=e.id) registered ON true
    WHERE b.company_id=$2 AND b.client_id=$1 AND COALESCE(b.deleted,false)=false AND b.type='BILL'
      AND e.return=false AND e.qty>COALESCE(registered.count,0)
      AND (e.item_id IS NOT NULL OR e.variant_id IS NOT NULL OR NULLIF(e.barcode,'') IS NOT NULL)
  ), filtered AS (
    SELECT * FROM purchases WHERE concat_ws(' ',name,barcode,serial_number,reference,invoice_code) ILIKE $3
  ) SELECT (SELECT count(*)::int FROM filtered) AS total,
    COALESCE((SELECT jsonb_agg(paged ORDER BY purchased_on DESC,id) FROM
      (SELECT * FROM filtered ORDER BY purchased_on DESC,id LIMIT $4 OFFSET $5) paged),'[]'::jsonb) AS rows`,
  [clientId, companyId, '%' + String(input.q || '').trim().slice(0, 200) + '%', pageSize, (page - 1) * pageSize])).rows[0]
  return { customer, rows: result.rows, total: result.total, page, pageSize }
}
