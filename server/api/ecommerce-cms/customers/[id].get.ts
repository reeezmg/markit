import { createError, getRouterParam } from 'h3'
import { pool } from '~/server/db'
import { requireStorefrontStaff } from '~/server/utils/ecommMarketing'

export default defineEventHandler(async (event) => {
  const { companyId } = await requireStorefrontStaff(event)
  const clientId = getRouterParam(event, 'id')

  const customer = await pool.query(
    `SELECT c.id, c.name, c.email, c.phone, cc.status, cc.pipeline_status AS "pipelineStatus",
      cc.marketing_opt_in_requested_at AS "marketingOptInRequestedAt",
      cc.marketing_opt_in_at AS "marketingOptInAt",
      cc.marketing_opt_in_email AS "marketingOptInEmail"
     FROM company_clients cc JOIN clients c ON c.id = cc.client_id
     WHERE cc.company_id = $1 AND cc.client_id = $2 AND COALESCE(c.deleted, false) = false`,
    [companyId, clientId],
  )
  if (!customer.rows.length) throw createError({ statusCode: 404, statusMessage: 'Customer not found' })

  const args = [companyId, clientId]
  const [orders, cart, wishlist, feedback, activities] = await Promise.all([
    pool.query(`SELECT id, order_number AS "orderNumber", status, payment_status AS "paymentStatus",
      grand_total AS "grandTotal", items, created_at AS "createdAt"
      FROM ecomm_orders WHERE company_id = $1 AND client_id = $2
      ORDER BY created_at DESC LIMIT 50`, args),
    pool.query(`SELECT items, updated_at AS "updatedAt" FROM ecomm_carts
      WHERE company_id = $1 AND client_id = $2`, args),
    pool.query(`SELECT items, updated_at AS "updatedAt" FROM ecomm_wishlists
      WHERE company_id = $1 AND client_id = $2`, args),
    pool.query(`SELECT id, title, message, rating, created_at AS "createdAt"
      FROM ecomm_feedback WHERE company_id = $1 AND client_id = $2
      ORDER BY created_at DESC LIMIT 20`, args),
    pool.query(`SELECT id, kind, body, due_at AS "dueAt", completed_at AS "completedAt",
      created_at AS "createdAt" FROM ecomm_crm_activities
      WHERE company_id = $1 AND client_id = $2 ORDER BY created_at DESC LIMIT 100`, args),
  ])
  return { customer: customer.rows[0], orders: orders.rows, cart: cart.rows[0] || null,
    wishlist: wishlist.rows[0] || null, feedback: feedback.rows, activities: activities.rows }
})
