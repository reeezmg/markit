import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'


export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Payment id is required' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
      await lockCompanyRequest(event, client);

    const res = await client.query(`DELETE FROM distributor_payments WHERE id = $1 AND company_id = $2 RETURNING expense_id`, [id, companyId])
    if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Payment not found' })
    if (res.rows[0].expense_id) {

      const removed = await client.query('DELETE FROM expenses WHERE id=$1 AND company_id=$2 RETURNING id', [res.rows[0].expense_id, companyId])
      if (!removed.rowCount) throw createError({ statusCode: 409, statusMessage: 'Linked expense ownership changed' })
    }
    await client.query('COMMIT')
    return { success: true }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
