import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const { billId, excludeEntryIds, companyId } = await readBody(event)

  if (!billId || !companyId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'billId and companyId are required'
    })
  }

  const client = await pool.connect()

  try {
    const res = await client.query(
      `
      SELECT
        id,
        item_id    AS "itemId",
        qty,
        size,
        variant_id AS "variantId",
        return
      FROM entries
      WHERE bill_id = $1
        AND company_id = $2
        AND (
          $3::text[] IS NULL
          OR id <> ALL($3::text[])
        )
      `,
      [
        billId,
        companyId,
        excludeEntryIds?.length ? excludeEntryIds : null
      ]
    )

    return res.rows
  } finally {
    client.release()
  }
})
