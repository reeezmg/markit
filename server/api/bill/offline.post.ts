import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { pool } from '~/server/db'
import { readBody, defineEventHandler, createError, sendError } from 'h3'
import { saveSourceRequest } from '~/server/utils/source-save-request'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const session = await useCompanyRequestSession(event)

  const {
    items = [],
    returnedItems = [],
    companyId = session.data.companyId,
  } = body

  if (companyId !== session.data.companyId) throw createError({statusCode:403,statusMessage:'Company access denied'})
  for (const item of [...items,...returnedItems]) {
    if (!item?.id || !Number.isSafeInteger(Number(item.qty)) || Number(item.qty)<=0) throw createError({statusCode:400,statusMessage:'Select an item and a positive whole quantity'})
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')
      await lockCompanyRequest(event, client);

    const result = await saveSourceRequest(client, session.data.companyId, session.data.id || 'offline', 'offline-stock', body.requestId,
      { items, returnedItems, companyId }, async () => {
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

    return { success: true }
    })
    await client.query('COMMIT')

    return result

  } catch (error: any) {
    await client.query('ROLLBACK')

    return sendError(
      event,
      createError({
        statusCode: error?.statusCode || 500,
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
