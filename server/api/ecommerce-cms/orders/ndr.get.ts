import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'

// Orders flagged as NDR (failed delivery) by the shipping webhook — i.e. those
// with meta.shipping.ndr set. Scoped to the authenticated seller's company.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { rows } = await pool.query(
    `SELECT id, order_number AS "orderNumber", status,
            items, shipping_address AS "shippingAddress",
            meta->'shipping' AS shipping,
            created_at AS "createdAt"
     FROM ecomm_orders
     WHERE company_id = $1 AND meta #> '{shipping,ndr}' IS NOT NULL
     ORDER BY (meta #>> '{shipping,ndr,at}') DESC NULLS LAST
     LIMIT 100`,
    [companyId],
  )
  return { orders: rows }
})
