import { pool } from '~/server/db'
import { ensureEcommContactMessagesTable } from '~/server/utils/ecommContactMessages'

const STATUSES = ['new', 'opened', 'replied', 'closed']

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ status?: string }>(event)

  const status = (body.status || '').trim()
  if (!STATUSES.includes(status)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
  }

  await ensureEcommContactMessagesTable()

  // Stamp replied_at the first time a message is marked replied; clear it if reopened.
  const { rows } = await pool.query(
    `
      UPDATE ecomm_contact_messages
      SET status = $3,
          replied_at = CASE
            WHEN $3 = 'replied' THEN COALESCE(replied_at, NOW())
            WHEN $3 = 'new' THEN NULL
            ELSE replied_at
          END,
          updated_at = NOW()
      WHERE id = $1 AND company_id = $2
      RETURNING id,
                name,
                email,
                phone,
                message,
                status,
                replied_at AS "repliedAt",
                created_at AS "createdAt",
                updated_at AS "updatedAt"
    `,
    [id, session.data.companyId, status]
  )

  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  return rows[0]
})
