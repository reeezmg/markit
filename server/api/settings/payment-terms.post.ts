import { createError, defineEventHandler, readBody } from 'h3'
import { pool } from '../../db'
import { getReadCompanyId } from '../../utils/organizationReadScope'
import { addInvoicePaymentTerm, paymentTermRoles } from '../../utils/invoice-payment-terms'
import { newPaymentTerm } from '../../../utils/invoice-payment-terms'

export default defineEventHandler(async event => {
  const companyId = await getReadCompanyId(event)
  const session = await requireAuthSession(event)
  if (!paymentTermRoles.includes(session.data.role)) throw createError({ statusCode: 403, statusMessage: 'You do not have permission to create payment terms.' })
  let input
  try { input = newPaymentTerm(await readBody(event)) }
  catch (error: any) { throw createError({ statusCode: 400, statusMessage: error.message }) }
  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    if (!(await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId])).rows.length) throw createError({ statusCode: 404, statusMessage: 'Company not found.' })
    const result = await addInvoicePaymentTerm(db, companyId, input)
    await db.query('COMMIT')
    return result
  } catch (error) { await db.query('ROLLBACK'); throw error }
  finally { db.release() }
})
