import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

// Approve or reject a pending return/exchange request.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { id, status } = await readBody(event)
  if (!id || !['APPROVED', 'REJECTED'].includes(status)) {
    throw createError({ statusCode: 400, statusMessage: 'id and status (APPROVED/REJECTED) are required' })
  }

  const { rows } = await pool.query(
    `UPDATE ecomm_order_requests
     SET status = $1, updated_at = now()
     WHERE id = $2 AND company_id = $3 AND status = 'PENDING'
     RETURNING id, status`,
    [status, id, companyId],
  )
  if (!rows.length) throw createError({ statusCode: 400, statusMessage: 'Request not found or already decided' })
  return { request: rows[0] }
})
