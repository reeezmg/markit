import { defineEventHandler, getQuery } from 'h3'
import { pool } from '~/server/db'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'

export default defineEventHandler(async event => {
  const { data } = await useCompanyRequestSession(event)
  const search = String(getQuery(event).search || '').trim().slice(0, 150)
  const result = await pool.query(
    `SELECT po.id, po.purchase_order_no AS "purchaseOrderNo", po.bill_no AS "billNo",
            d.name AS "distributorName"
     FROM purchase_orders po LEFT JOIN distributors d ON d.id=po.distributor_id
     WHERE po.company_id=$1 AND ($2='' OR po.purchase_order_no::text=$2
       OR 'PO-' || po.purchase_order_no::text ILIKE $3 OR po.bill_no ILIKE $3 OR d.name ILIKE $3)
     ORDER BY po.created_at DESC, po.id LIMIT 50`,
    [data.companyId, search, `%${search}%`],
  )
  return result.rows
})
