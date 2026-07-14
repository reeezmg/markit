import { pool } from '~/server/db'
import { ensureEcommContactMessagesTable } from '~/server/utils/ecommContactMessages'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const id = getRouterParam(event, 'id')
  await ensureEcommContactMessagesTable()

  const result = await pool.query(
    'DELETE FROM ecomm_contact_messages WHERE id = $1 AND company_id = $2',
    [id, session.data.companyId]
  )

  if (!result.rowCount) throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  return { success: true }
})
