import { createError, getRouterParam } from 'h3'
import { pool } from '~/server/db'
import { requireStorefrontStaff } from '~/server/utils/ecommMarketing'

export default defineEventHandler(async (event) => {
  const { companyId, userId } = await requireStorefrontStaff(event)
  const { rowCount } = await pool.query(`UPDATE ecomm_crm_activities SET completed_at = now()
    WHERE id = $1 AND company_id = $2 AND client_id = $3 AND kind = 'task' AND completed_at IS NULL
      AND EXISTS (SELECT 1 FROM company_users cu WHERE cu.company_id = $2 AND cu.user_id = $4
        AND cu.status = true AND cu.deleted = false)`,
    [getRouterParam(event, 'activityId'), companyId, getRouterParam(event, 'id'), userId])
  if (!rowCount) throw createError({ statusCode: 404, statusMessage: 'Open task not found' })
  return { completed: true }
})
