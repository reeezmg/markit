import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, getQuery } from 'h3'
import { pool } from '~/server/db'
import { getReadCompanyIds } from '~/server/utils/organizationReadScope'

export default defineEventHandler(async (event) => {
  const companyIds = String(getQuery(event).forWrite ?? '') === '1'
    ? [(await useCompanyRequestSession(event)).data.companyId]
    : await getReadCompanyIds(event)

  const res = await pool.query(
    `SELECT id, name, company_id AS "companyId" FROM expense_categories WHERE company_id = ANY($1::text[]) ORDER BY name ASC`,
    [companyIds],
  )
  return res.rows
})
