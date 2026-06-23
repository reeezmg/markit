import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'
import { deleteAccountLedgerForSource } from '~/server/utils/account-ledger'
import { recalculateManyUserLedgerBalances } from '~/server/utils/user-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const cycleId = event.context.params?.id
  if (!cycleId) throw createError({ statusCode: 400, statusMessage: 'cycle id is required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const cycleRes = await client.query(
      `
      SELECT id
      FROM payroll_cycles
      WHERE id = $1
        AND company_id = $2
      FOR UPDATE
      `,
      [cycleId, companyId],
    )
    if (!cycleRes.rowCount) throw createError({ statusCode: 404, statusMessage: 'Cycle not found' })

    const lineRes = await client.query(
      `
      SELECT id, user_id
      FROM payroll_cycle_lines
      WHERE company_id = $1
        AND cycle_id = $2
      `,
      [companyId, cycleId],
    )
    const lineIds = lineRes.rows.map((row: any) => row.id)
    const affectedUsers = new Set<string>(lineRes.rows.map((row: any) => row.user_id))

    const deletedLedger = await client.query(
      `
      DELETE FROM user_ledger_entries
      WHERE company_id = $1
        AND (
          (type = 'PAYROLL_ACCRUAL' AND source_type = 'PAYROLL_CYCLE' AND source_id = ANY($2::text[]))
          OR (type = 'CREDIT_BILL_PAYMENT' AND source_type = 'PAYROLL' AND source_id = ANY($3::text[]))
          OR (type = 'SALARY_PAYMENT' AND source_type = 'PAYROLL' AND source_id = ANY($4::text[]))
        )
      RETURNING id, user_id, type
      `,
      [
        companyId,
        lineRes.rows.map((row: any) => `${cycleId}:${row.user_id}`),
        lineIds,
        lineIds.map((lineId: string) => `${lineId}:salary-settlement`),
      ],
    )
    for (const row of deletedLedger.rows) affectedUsers.add(row.user_id)
    for (const row of deletedLedger.rows) {
      if (row.type === 'CREDIT_BILL_PAYMENT') {
        await deleteAccountLedgerForSource(client, {
          companyId,
          sourceType: 'USER_CREDIT',
          sourceId: row.id,
        })
      }
    }

    await client.query(
      `
      DELETE FROM payroll_cycles
      WHERE id = $1
        AND company_id = $2
      `,
      [cycleId, companyId],
    )

    await recalculateManyUserLedgerBalances(client, companyId, affectedUsers)
    await client.query('COMMIT')

    return { success: true }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
