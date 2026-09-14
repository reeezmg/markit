import { createError, getRouterParam, readBody } from 'h3'
import { pool } from '~/server/db'
import { requireStorefrontStaff } from '~/server/utils/ecommMarketing'

export default defineEventHandler(async (event) => {
  const { companyId, userId } = await requireStorefrontStaff(event)
  const clientId = getRouterParam(event, 'id')
  const body = await readBody<{ kind?: string; body?: string; dueAt?: string }>(event)
  const kind = body.kind
  const content = String(body.body || '').trim()
  const dueAt = body.dueAt ? new Date(body.dueAt) : null
  if (!['note','task'].includes(kind || '') || !content || content.length > 2000 ||
    (dueAt && Number.isNaN(dueAt.getTime()))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid note or task' })
  }
  const result = await pool.query(`INSERT INTO ecomm_crm_activities
    (company_id, client_id, created_by, kind, body, due_at)
    SELECT $1, $2, $3, $4, $5, $6
    WHERE EXISTS (SELECT 1 FROM company_clients cc JOIN clients c ON c.id = cc.client_id
      WHERE cc.company_id = $1 AND cc.client_id = $2 AND COALESCE(c.deleted, false) = false)
    AND EXISTS (SELECT 1 FROM company_users cu WHERE cu.company_id = $1 AND cu.user_id = $3
      AND cu.status = true AND cu.deleted = false)
    RETURNING id`, [companyId, clientId, userId, kind, content, dueAt])
  if (!result.rows.length) throw createError({ statusCode: 404, statusMessage: 'Customer not found' })
  return { id: result.rows[0].id }
})
