import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

// How many shipped-but-not-yet-picked orders would be attached to a pickup for
// this location + carrier (i.e. SHIPPED via that carrier, not already on an
// active pickup request). Legacy shipments without a stored location still count.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { location = '', carrier } = getQuery(event) as { location?: string; carrier?: string }
  if (!carrier) return { count: 0 }

  const { rows } = await pool.query(
    `SELECT count(*)::int AS count
     FROM ecomm_orders
     WHERE company_id = $1
       AND status = 'SHIPPED'
       AND meta->'shipping'->>'provider' = $2
       AND (meta->'shipping'->>'location' = $3 OR meta->'shipping'->>'location' IS NULL)
       AND (meta->'shipping'->>'pickupRequestId') IS NULL`,
    [companyId, carrier, location],
  )
  return { count: rows[0]?.count ?? 0 }
})
