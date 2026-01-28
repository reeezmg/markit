import { pool } from '~/server/db'
import { readBody, defineEventHandler, createError, sendError } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const session = await useAuthSession(event)

  const {
    items = [],
    returnedItems = [],
    companyId,
  } = body

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    /* -------------------------------------------------
       1. SOLD ITEMS → decrement qty, increment soldQty
    -------------------------------------------------- */
    for (const item of items) {
      if (!item?.id || !item?.qty || item.return) continue

      await client.query(
        `
        UPDATE items
        SET 
          qty = qty - $1,
          sold_qty = sold_qty + $1,
          updated_at = NOW()
        WHERE id = $2
          AND company_id = $3
        `,
        [item.qty, item.id, companyId]
      )
    }

    /* -------------------------------------------------
       2. RETURNED ITEMS → increment qty, decrement soldQty
    -------------------------------------------------- */
    for (const item of returnedItems) {
      if (!item?.id || !item?.qty) continue

      await client.query(
        `
        UPDATE items
        SET 
          qty = qty + $1,
          sold_qty = GREATEST(sold_qty - $1, 0),
          updated_at = NOW()
        WHERE id = $2
          AND company_id = $3
        `,
        [item.qty, item.id, companyId]
      )
    }

    await client.query('COMMIT')

    return { success: true }

  } catch (error: any) {
    await client.query('ROLLBACK')

    return sendError(
      event,
      createError({
        statusCode: 500,
        statusMessage: 'Failed to update stock',
        data: {
          message: error.message,
          items,
          returnedItems,
          companyId,
        },
      })
    )
  } finally {
    client.release()
  }
})
