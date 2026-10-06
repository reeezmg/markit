import { assertSalaryManager } from '~/server/utils/salary-input'
import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'

import { recalculateManyUserLedgerBalances } from '~/server/utils/user-ledger'

export default defineEventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
    assertSalaryManager(session.data.role)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const cycleId = event.context.params?.id
  if (!cycleId) throw createError({ statusCode: 400, statusMessage: 'cycle id is required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId])
    await lockCompanyRequest(event, client)

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

    // Reversing credit cuts leaves only actual cash payouts in the salary ledger.
    await client.query(`UPDATE user_ledger_entries ule SET amount=sp.amount, updated_at=now()
      FROM salary_payments sp WHERE sp.company_id=$1 AND sp.cycle_id=$2
        AND ule.company_id=sp.company_id AND ule.source_type='SALARY_PAYMENT' AND ule.source_id=sp.id`, [companyId, cycleId])
    await client.query('UPDATE salary_payments SET cycle_id=NULL, cycle_line_id=NULL WHERE company_id=$1 AND cycle_id=$2', [companyId, cycleId])

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
