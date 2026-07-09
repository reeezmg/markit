import { defineEventHandler, getRouterParam, createError } from 'h3'
import { pool } from '~/server/db'

// Delete a dimension preset (box or product) owned by the company.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const { rows } = await pool.query(
    `DELETE FROM shipping_boxes WHERE id = $1 AND company_id = $2 RETURNING id`,
    [id, companyId],
  )
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return { success: true }
})
