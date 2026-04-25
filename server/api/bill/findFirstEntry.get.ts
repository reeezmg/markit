import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const barcode = query.barcode as string | undefined
  const companyId = query.companyId as string | undefined
  const invoiceNumber = query.invoiceNumber as string | undefined

  if (!barcode || !companyId || !invoiceNumber) {
    throw createError({
      statusCode: 400,
      statusMessage: 'barcode, companyId, and invoiceNumber are required',
    })
  }

  const invoiceNum = Number(invoiceNumber)
  if (Number.isNaN(invoiceNum)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'invoiceNumber must be a valid number',
    })
  }

  const client = await pool.connect()

  try {
    const res = await client.query(
      `
      SELECT
        e.id,
        e.name,
        e.barcode,
        e.qty,
        e.rate,
        e.discount,
        e.tax,
        e.value,
        e.size,
        e.item_id       AS "itemId",
        e.variant_id    AS "variantId",
        e.category_id   AS "categoryId",
        v.sizes
      FROM entries e
      INNER JOIN bills b ON b.id = e.bill_id
      LEFT JOIN variants v ON v.id = e.variant_id
      WHERE e.barcode = $1
        AND b.company_id = $2
        AND b.invoice_number = $3
      LIMIT 1;
      `,
      [barcode, companyId, invoiceNum]
    )

    return res.rows[0] ?? null
  } finally {
    client.release()
  }
})
