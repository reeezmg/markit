import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

/**
 * Customer picker for a manually created order, with their saved addresses.
 *
 * Searches this company's customers only — `clients` is shared across every
 * company on Markit, and one seller must never be able to page through
 * another's customer list. The join through `company_clients` is what enforces
 * that, so it is not optional.
 *
 * GET /api/ecommerce-cms/orders/client-search?q=9876
 */
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const q = String(getQuery(event).q || '').trim()
  const pattern = `%${q}%`

  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.phone, c.email,
            COALESCE(
              (SELECT json_agg(a ORDER BY a.created_at DESC)
               FROM (
                 SELECT id, name, phone_no AS "phoneNo", house_details AS "houseDetails",
                        street, locality, landmark, city, state, pincode, type, created_at
                 FROM addresses
                 WHERE client_id = c.id AND active = true
               ) a),
              '[]'::json
            ) AS addresses
     FROM clients c
     JOIN company_clients cc ON cc.client_id = c.id AND cc.company_id = $1
     WHERE c.deleted = false
       AND ($2 = '' OR c.name ILIKE $3 OR c.phone ILIKE $3 OR c.email ILIKE $3)
     ORDER BY c.name
     LIMIT 25`,
    [companyId, q, pattern],
  )

  return { clients: rows }
})
