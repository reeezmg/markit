import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { syncExpensePartyLines } from '~/server/utils/expense-party';


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
    if ((await client.query('SELECT id FROM distributor_payments WHERE company_id=$1 AND expense_id=ANY($2::text[])', [companyId, ids])).rowCount) {
      throw createError({ statusCode: 409, statusMessage: 'Update linked expenses through their distributor payments' });
    }
    const updated = await client.query(
      `
      UPDATE expenses
      SET status = $1, updated_at = now()
      WHERE company_id = $2 AND id = ANY($3)
      RETURNING id, total_amount AS "totalAmount", payment_mode AS "paymentMode", status, expense_date AS "expenseDate", note
      `,
      [status, companyId, ids],
    )

    await syncExpensePartyLines(client, companyId, updated.rows.map(row => row.id));
    await client.query('COMMIT')
    return { success: true, count: updated.rowCount }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
