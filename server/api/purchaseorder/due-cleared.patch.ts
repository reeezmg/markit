import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'No company in session' })

  const { poId, dueCleared } = (await readBody(event)) || {}
  if (!poId) throw createError({ statusCode: 400, statusMessage: 'Missing poId' })
  if (typeof dueCleared !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'dueCleared must be a boolean' })
  }

  const result = await pool.query(
    `UPDATE purchase_orders
     SET due_cleared = $3, updated_at = now()
     WHERE id = $1 AND company_id = $2
     RETURNING id, due_cleared`,
    [poId, companyId, dueCleared],
  )
  if (!result.rowCount) throw createError({ statusCode: 404, statusMessage: 'Purchase order not found' })

  return { success: true, poId, dueCleared: result.rows[0].due_cleared }
})
