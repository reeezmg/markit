import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { pool } from '~/server/db'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'

export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
  if (!['admin', 'manager', 'accountant'].includes(session.data.role)) throw createError({statusCode:403,statusMessage:'A manager or accountant must start the financial year'})
  const body = await readBody(event)
  const { companyId, closingDate } = body
  if (companyId && companyId !== session.data.companyId) throw createError({statusCode:403,statusMessage:'Company access denied'})

  if (!companyId || !closingDate) {
    throw createError({
      statusCode: 400,
      statusMessage: 'companyId and closingDate are required',
    })
  }
  if (typeof closingDate !== 'string' || !Number.isFinite(new Date(closingDate).getTime())) throw createError({statusCode:400,statusMessage:'Select a valid closing date'})

  const client = await pool.connect()

  try {
    await client.query('BEGIN')
      await lockCompanyRequest(event, client);
    const owner = await client.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId])
    if (!owner.rowCount) throw createError({statusCode:404,statusMessage:'Company not found'})

    // ── Renumber bills (invoice_number) after closing date ──
    await client.query(`
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS new_num
        FROM bills
        WHERE company_id = $1 AND created_at > $2::timestamp AND deleted = false
      )
      UPDATE bills SET invoice_number = numbered.new_num
      FROM numbered WHERE bills.id = numbered.id
    `, [companyId, closingDate])

    const billCountRes = await client.query(`
      SELECT COUNT(*) AS cnt FROM bills
      WHERE company_id = $1 AND created_at > $2::timestamp AND deleted = false
    `, [companyId, closingDate])
    const nextBillCounter = Number(billCountRes.rows[0].cnt) + 1

    // ── Update company: set closing_date + reset bill counter ──
    await client.query(`
      UPDATE companies SET
        closing_date = $2::timestamp,
        bill_counter = $3::integer
      WHERE id = $1
    `, [
      companyId,
      closingDate,
      nextBillCounter,
    ])

    await client.query('COMMIT')

    return {
      success: true,
      counters: {
        billCounter: nextBillCounter,
      },
    }
  } catch (err) {
    await client.query('ROLLBACK')
    if ((err as any)?.statusCode) throw err
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to start new year: ' + (err as Error).message,
    })
  } finally {
    client.release()
  }
})
