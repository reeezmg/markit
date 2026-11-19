import { createError, defineEventHandler, getQuery } from 'h3'
import { pool } from '~/server/db'
import { getReadCompanyIds } from '~/server/utils/organizationReadScope'

export default defineEventHandler(async event => {
  const companyIds = await getReadCompanyIds(event)
  const session = await requireAuthSession(event)
  const { id, page: pageValue = '1' } = getQuery(event)
  const page = Number(pageValue)
  if (typeof id !== 'string' || !id.trim() || !Number.isInteger(page) || page < 1 || page > 100000) {
    throw createError({statusCode:400,statusMessage:'Select a bill and a valid history page'})
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const cleanup = session.data.cleanup === true
    const bill = (await client.query(`SELECT id,company_id FROM bills
      WHERE id=$1 AND company_id=ANY($2::text[]) AND ($3 OR precedence IS NOT TRUE)`,[id,companyIds,cleanup])).rows[0]
    if (!bill) throw createError({statusCode:404,statusMessage:'Bill not found'})
    const args = [id,cleanup]
    const total = Number((await client.query('SELECT count(*)::int AS total FROM bill_history WHERE bill_id=$1 AND ($2 OR precedence IS NOT TRUE)',args)).rows[0].total)
    const rows = (await client.query(`SELECT id,data,operation,changed_at AS "changedAt" FROM bill_history
      WHERE bill_id=$1 AND ($2 OR precedence IS NOT TRUE)
      ORDER BY changed_at DESC,id DESC LIMIT 20 OFFSET $3`,[...args,(page-1)*20])).rows
    await client.query('COMMIT')
    return {rows,total,page,pageSize:20}
  } catch(error) {
    await client.query('ROLLBACK')
    throw error
  } finally {client.release()}
})
