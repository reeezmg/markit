import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'
import { PICKUP_SHIPMENTS_SQL } from '~/server/utils/pickup-shipments'

// The parcels a pickup would collect, with enough detail for the seller to
// recognise them on the bench. Same selection as the count endpoint, but
// returning rows so the raise flow can show them and let any be left out.
//
// Rows are shipments, not orders: an order with an exchange contributes both its
// forward parcel and the REPL replacement, each with its own id and pickup tag.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { location = '', carrier } = getQuery(event) as { location?: string; carrier?: string }
  if (!carrier) return { orders: [] }

  const { rows } = await pool.query(
    `SELECT * FROM (${PICKUP_SHIPMENTS_SQL}) s ORDER BY s."createdAt" ASC`,
    [companyId, carrier, location],
  )
  return { orders: rows }
})
