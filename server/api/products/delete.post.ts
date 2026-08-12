import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { cleanupMediaKeys } from '~/server/utils/mediaCleanup'
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
  let imageKeys: string[] = []
  try {
    await client.query('BEGIN')
    const product = await client.query(
      `SELECT purchaseorder_id FROM products WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [id, companyId],
    )
    // Variants cascade away with the product, so read their images first.
    const variantImages = await client.query(
      `SELECT COALESCE(array_agg(DISTINCT img), '{}'::text[]) AS keys
         FROM variants v, unnest(v.images) AS img
        WHERE v.product_id = $1 AND v.company_id = $2`,
      [id, companyId],
    )
    imageKeys = variantImages.rows[0]?.keys || []

    const res = await client.query(`DELETE FROM products WHERE id = $1 AND company_id = $2`, [id, companyId])
    const purchaseOrderId = product.rows[0]?.purchaseorder_id
    if (purchaseOrderId) {
      await recalculatePurchaseOrderTotals(client, { companyId, poId: purchaseOrderId })
    }
    await client.query('COMMIT')

    // After the commit, so a cleanup failure can never roll back the delete.
    const removedMedia = res.rowCount ? await cleanupMediaKeys(imageKeys) : []
    return { success: true, deleted: res.rowCount, removedMedia: removedMedia.length }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})
