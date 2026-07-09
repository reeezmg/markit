import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'

// Dimension input toggles for the company (product-level + size-level). Read
// straight from product_inputs / variant_inputs so the new flags work without a
// ZenStack regen. Defaults to false when a row/column is missing.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { rows } = await pool.query(
    `SELECT
       COALESCE((SELECT dimension FROM product_inputs WHERE company_id = $1 LIMIT 1), false)      AS "productDimension",
       COALESCE((SELECT "sizeDimension" FROM variant_inputs WHERE company_id = $1 LIMIT 1), false) AS "sizeDimension"`,
    [companyId],
  )
  return {
    productDimension: rows[0]?.productDimension ?? false,
    sizeDimension: rows[0]?.sizeDimension ?? false,
  }
})
