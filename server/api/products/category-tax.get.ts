import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'
import { getReadCompanyIds } from '~/server/utils/organizationReadScope'

// Raw-SQL replacement for useFindUniqueCategory (tax fields) used to recompute
// variant tax when the category changes on the add/edit product pages.
export default defineEventHandler(async (event) => {
  const companyIds = await getReadCompanyIds(event)

  const id = getQuery(event).id as string
  if (!id) return null

  const client = await pool.connect()
  try {
    const res = await client.query(
      `SELECT fixed_tax, tax_below_threshold, tax_above_threshold, threshold_amount, tax_type
       FROM categories WHERE id = $1 AND company_id = ANY($2::text[])`,
      [id, companyIds],
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
