import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { companyId, closingDate } = body

  if (!companyId || !closingDate) {
    throw createError({
      statusCode: 400,
      statusMessage: 'companyId and closingDate are required',
    })
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // ── Renumber bills (invoice_number) after closing date ──
    await client.query(`
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS new_num
        FROM bills
        WHERE company_id = $1 AND created_at > $2 AND deleted = false
      )
      UPDATE bills SET invoice_number = numbered.new_num
      FROM numbered WHERE bills.id = numbered.id
    `, [companyId, closingDate])

    const billCountRes = await client.query(`
      SELECT COUNT(*) AS cnt FROM bills
      WHERE company_id = $1 AND created_at > $2 AND deleted = false
    `, [companyId, closingDate])
    const nextBillCounter = Number(billCountRes.rows[0].cnt) + 1

    // ── Update company: set closing_date + reset bill counter ──
    await client.query(`
      UPDATE companies SET
        closing_date = $2,
        bill_counter = $3
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
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to start new year: ' + (err as Error).message,
    })
  } finally {
    client.release()
  }
})
