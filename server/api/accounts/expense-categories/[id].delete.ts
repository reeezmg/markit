import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Category id is required' })

  try {
    const res = await pool.query(
      `DELETE FROM expense_categories WHERE id = $1 AND company_id = $2`,
      [id, companyId],
    )
    if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Category not found' })
    return { success: true }
  } catch (err: any) {
    // Foreign key violation — category is referenced by one or more expenses
    if (err?.code === '23503') {
      throw createError({ statusCode: 409, statusMessage: 'This category is used in one or more expenses.' })
    }
    throw err
  }
})
