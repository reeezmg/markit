import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

// Update the dimension input toggles (product-level + size-level) for the company.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<{ productDimension?: boolean; sizeDimension?: boolean }>(event)

  if (typeof body?.productDimension === 'boolean') {
    await pool.query(`UPDATE product_inputs SET dimension = $2 WHERE company_id = $1`, [companyId, body.productDimension])
  }
  if (typeof body?.sizeDimension === 'boolean') {
    await pool.query(`UPDATE variant_inputs SET "sizeDimension" = $2 WHERE company_id = $1`, [companyId, body.sizeDimension])
  }
  return { success: true }
})
