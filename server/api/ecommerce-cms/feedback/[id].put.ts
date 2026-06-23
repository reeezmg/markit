import { pool } from '~/server/db'
import { ensureEcommFeedbackTable } from '~/server/utils/ecommFaqs'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{
    clientId?: string | null
    customerName?: string
    title?: string
    message?: string
    rating?: number
    sortOrder?: number
    status?: boolean
  }>(event)

  await ensureEcommFeedbackTable()

  const hasClientId = Object.prototype.hasOwnProperty.call(body, 'clientId')
  let clientName: string | null = null
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
    clientName = rows[0].name || rows[0].email || null
  }

  const rating = body.rating == null ? null : Math.max(1, Math.min(5, Number(body.rating)))
  const customerName = (clientName || body.customerName || '').trim()

  const { rows } = await pool.query(
    `
      UPDATE ecomm_feedback
      SET client_id = CASE WHEN $10 THEN $3 ELSE client_id END,
          customer_name = CASE WHEN $4::text <> '' THEN $4 ELSE customer_name END,
          title = COALESCE(NULLIF($5, ''), title),
          message = COALESCE(NULLIF($6, ''), message),
          rating = COALESCE($7, rating),
          sort_order = COALESCE($8, sort_order),
          status = COALESCE($9, status),
          updated_at = NOW()
      WHERE id = $1 AND company_id = $2
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
      id,
      session.data.companyId,
      body.clientId || null,
      customerName,
      body.title?.trim() || '',
      body.message?.trim() || '',
      rating,
      body.sortOrder,
      body.status,
      hasClientId,
    ]
  )

  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Feedback not found' })
  return rows[0]
})
