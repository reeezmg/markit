import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const res = await pool.query(
    `SELECT id, name FROM expense_categories WHERE company_id = $1 ORDER BY name ASC`,
    [companyId],
  )
  return res.rows
})
