import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'

// List pickup requests for the company (most recent first), with order count.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { rows } = await pool.query(
    `SELECT id, location, carrier,
            pickup_date AS "pickupDate", pickup_time AS "pickupTime",
            package_count AS "packageCount", status,
            carrier_pickup_id AS "carrierPickupId",
            order_ids AS "orderIds",
            jsonb_array_length(COALESCE(order_ids, '[]'::jsonb)) AS "orderCount",
            created_at AS "createdAt"
     FROM ecomm_pickup_requests
     WHERE company_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [companyId],
  )
  return { requests: rows }
})
