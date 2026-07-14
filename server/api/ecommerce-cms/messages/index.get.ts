import { pool } from '~/server/db'
import { ensureEcommContactMessagesTable } from '~/server/utils/ecommContactMessages'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  await ensureEcommContactMessagesTable()

  const { rows } = await pool.query(
    `
      SELECT id,
             name,
             email,
             phone,
             message,
             status,
             replied_at AS "repliedAt",
             created_at AS "createdAt",
             updated_at AS "updatedAt"
      FROM ecomm_contact_messages
      WHERE company_id = $1
      ORDER BY created_at DESC
    `,
    [session.data.companyId]
  )

  return rows
})
