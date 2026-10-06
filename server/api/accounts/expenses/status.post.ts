import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'


export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<{ ids?: string[]; status?: string }>(event)
  const ids = (Array.isArray(body.ids) ? body.ids : []).map((v) => String(v)).filter(Boolean)
  const status = String(body.status || '').trim()
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'No expenses selected' })
  if (!status) throw createError({ statusCode: 400, statusMessage: 'Status is required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
      await lockCompanyRequest(event, client);
    const updated = await client.query(
      `
      UPDATE expenses
      SET status = $1, updated_at = now()
      WHERE company_id = $2 AND id = ANY($3)
      RETURNING id, total_amount AS "totalAmount", payment_mode AS "paymentMode", status, expense_date AS "expenseDate", note
      `,
      [status, companyId, ids],
    )

    await client.query('COMMIT')
    return { success: true, count: updated.rowCount }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
