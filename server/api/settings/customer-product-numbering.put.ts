import { createError, defineEventHandler, readBody } from 'h3'
import { pool } from '../../db'
import { getReadCompanyId } from '../../utils/organizationReadScope'
import { productNumberingRoles, saveProductNumbering } from '../../utils/customer-product-numbering'
export default defineEventHandler(async event => {
  const companyId = await getReadCompanyId(event), session = await requireAuthSession(event)
  if (!productNumberingRoles.includes(session.data.role)) throw createError({ statusCode: 403, statusMessage: 'You do not have permission to change product reference numbering.' })
  const body = await readBody(event), db = await pool.connect()
  try {
    await db.query('BEGIN')
    if (!(await db.query('SELECT id FROM companies WHERE id=$1 AND status=true FOR SHARE', [companyId])).rowCount)
      throw createError({ statusCode: 404, statusMessage: 'Active company not found.' })
    const result = await saveProductNumbering(db, companyId, session.data.id, body?.prefix)
    await db.query('COMMIT')
    return { ...result, canEdit: true }
  } catch (e) { await db.query('ROLLBACK'); throw e } finally { db.release() }
})
