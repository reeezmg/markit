import { pool } from '~/server/db'
import { ensureEcommFeedbackTable } from '~/server/utils/ecommFaqs'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const body = await readBody<{
    clientId?: string
    customerName?: string
    title?: string
    message?: string
    rating?: number
    sortOrder?: number
    status?: boolean
  }>(event)

  if (!body.title?.trim() || !body.message?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Title and message are required' })
  }

  await ensureEcommFeedbackTable()

  let clientName = ''
  if (body.clientId) {
    const { rows } = await pool.query(
      `
        SELECT c.name, c.email
        FROM clients c
        INNER JOIN company_clients cc ON cc.client_id = c.id
        WHERE c.id = $1 AND cc.company_id = $2
        LIMIT 1
      `,
      [body.clientId, session.data.companyId]
    )
    if (!rows[0]) {
      throw createError({ statusCode: 400, statusMessage: 'Selected client is not linked to this company' })
    }
    clientName = rows[0].name || rows[0].email || ''
  }

  const customerName = (clientName || body.customerName || '').trim()
  if (!customerName) {
    throw createError({ statusCode: 400, statusMessage: 'Customer name is required' })
  }

  const rating = Math.max(1, Math.min(5, Number(body.rating || 5)))

  const { rows } = await pool.query(
    `
      INSERT INTO ecomm_feedback
        (company_id, client_id, customer_name, title, message, rating, sort_order, status)
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 0), COALESCE($8, TRUE))
      RETURNING id,
                client_id AS "clientId",
                customer_name AS "customerName",
                title,
                message,
                rating,
                sort_order AS "sortOrder",
                status,
                created_at AS "createdAt",
                updated_at AS "updatedAt"
    `,
    [
      session.data.companyId,
      body.clientId || null,
      customerName,
      body.title.trim(),
      body.message.trim(),
      rating,
      body.sortOrder ?? 0,
      body.status ?? true,
    ]
  )

  return rows[0]
})
