import { createError, defineEventHandler, getRouterParam } from 'h3'
import { pool } from '../../db'
import { quoteCompany } from '../../utils/erp-quotes'

export default defineEventHandler(async event => {
  const { companyId } = await quoteCompany(event, true)
  const id = getRouterParam(event, 'quoteId')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Select a quote.' })
  const result = await pool.query('UPDATE quotes SET deleted=true WHERE id=$1 AND company_id=$2 RETURNING id', [id, companyId])
  if (!result.rowCount) throw createError({ statusCode: 404, statusMessage: 'Quote not found.' })
  return { success: true }
})
