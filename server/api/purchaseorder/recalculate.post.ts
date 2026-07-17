import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { recalculatePurchaseOrderTotals } from '~/server/utils/purchase-order-totals'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'No company in session' })

  const { poId } = (await readBody(event)) || {}
  if (!poId) throw createError({ statusCode: 400, statusMessage: 'Missing poId' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const totals = await recalculatePurchaseOrderTotals(client, { companyId, poId })
    await client.query('COMMIT')
    return { success: true, poId, ...totals }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})
