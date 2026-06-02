import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

// Raw-SQL replacement for useFindUniqueCategory (tax fields) used to recompute
// variant tax when the category changes on the add/edit product pages.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'No company in session' })

  const id = getQuery(event).id as string
  if (!id) return null

  const client = await pool.connect()
  try {
    const res = await client.query(
      `SELECT fixed_tax, tax_below_threshold, tax_above_threshold, threshold_amount, tax_type
       FROM categories WHERE id = $1 AND company_id = $2`,
      [id, companyId],
    )
    if (!res.rowCount) return null
    const c = res.rows[0]
    return {
      fixedTax: c.fixed_tax,
      taxBelowThreshold: c.tax_below_threshold,
      taxAboveThreshold: c.tax_above_threshold,
      thresholdAmount: c.threshold_amount,
      taxType: c.tax_type,
    }
  } finally {
    client.release()
  }
})
