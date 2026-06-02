import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

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
    const res = await client.query(`DELETE FROM products WHERE id = $1 AND company_id = $2`, [id, companyId])
    return { success: true, deleted: res.rowCount }
  } finally {
    client.release()
  }
})
