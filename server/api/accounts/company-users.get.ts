import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'
import { getReadCompanyIds } from '~/server/utils/organizationReadScope'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const companyIds = String(query.forWrite ?? '') === '1'
    ? [(await useCompanyRequestSession(event)).data.companyId]
    : await getReadCompanyIds(event)
  const activeOnly = ['1', 'true'].includes(String(query.activeOnly || '').toLowerCase())

  const conditions = ['company_id = ANY($1::text[])', 'deleted = false']
  if (activeOnly) conditions.push('status = true')

  const res = await pool.query(
    `
    SELECT user_id AS "userId", company_id AS "companyId", name, phone, status
    FROM company_users
    WHERE ${conditions.join(' AND ')}
    ORDER BY name ASC
    `,
    [companyIds],
  )
  return res.rows
})
