import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const query = getQuery(event)
  const activeOnly = ['1', 'true'].includes(String(query.activeOnly || '').toLowerCase())

  const conditions = ['company_id = $1', 'deleted = false']
  if (activeOnly) conditions.push('status = true')

  const res = await pool.query(
    `
    SELECT user_id AS "userId", name, phone, status
    FROM company_users
    WHERE ${conditions.join(' AND ')}
    ORDER BY name ASC
    `,
    [companyId],
  )
  return res.rows
})
