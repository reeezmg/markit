import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const { barcode } = getQuery(event)

  if (!barcode) {
    throw createError({ statusCode: 400, statusMessage: 'Barcode required' })
  }

  const client = await pool.connect()

  try {
    const { rows } = await client.query(
      `
      SELECT
        i.id,
        i.size,
        i.qty,
        json_build_object(
          'id', v.id,
          'name', v.name,
          'sprice', v.s_price,
          'product', json_build_object(
            'name', p.name,
            'categoryId', p.category_id
          )
        ) AS variant
      FROM items i
      JOIN variants v ON v.id = i.variant_id
      JOIN products p ON p.id = v.product_id
      WHERE i.barcode = $1
        AND i.company_id = $2
      LIMIT 1
      `,
      [barcode, companyId]
    )

    return rows[0] || null
  } finally {
    client.release()
  }
})
