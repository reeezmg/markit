import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

// Hold a parcel back from pickups, or put it back in.
//
// Persisted on the order (meta.shipping.pickupExcluded) rather than kept in the
// page, so the decision survives a reload and is the same for whoever opens the
// pickup screen next. Excluded parcels still appear in the pickup list — just
// unticked — so the choice can always be reversed there too.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { orderId, excluded } = await readBody<{ orderId?: string; excluded?: boolean }>(event)
  if (!orderId) throw createError({ statusCode: 400, statusMessage: 'orderId is required' })

  const { rows } = await pool.query(
    `UPDATE ecomm_orders
     SET meta = jsonb_set(
           jsonb_set(COALESCE(meta, '{}'::jsonb), '{shipping}',
                     COALESCE(meta->'shipping', '{}'::jsonb), true),
           '{shipping,pickupExcluded}', to_jsonb($1::boolean), true),
         updated_at = now()
     WHERE company_id = $2 AND id = $3
     RETURNING order_number AS "orderNumber",
               (meta->'shipping'->>'pickupExcluded')::boolean AS excluded`,
    [Boolean(excluded), companyId, orderId],
  )
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Order not found' })
  return rows[0]
})
