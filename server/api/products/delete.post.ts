import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { recalculatePurchaseOrderTotals } from '~/server/utils/purchase-order-totals'

// Raw-SQL replacement for useDeleteProduct (AddProduct/Table removeProduct).
// Deletes the product (variants + items cascade via FK onDelete: Cascade), company-scoped.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'No company in session' })

  const { id } = (await readBody(event)) || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing product id' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const product = await client.query(
      `SELECT purchaseorder_id FROM products WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [id, companyId],
    )
    const res = await client.query(`DELETE FROM products WHERE id = $1 AND company_id = $2`, [id, companyId])
    const purchaseOrderId = product.rows[0]?.purchaseorder_id
    if (purchaseOrderId) {
      await recalculatePurchaseOrderTotals(client, { companyId, poId: purchaseOrderId })
    }
    await client.query('COMMIT')
    return { success: true, deleted: res.rowCount }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})
