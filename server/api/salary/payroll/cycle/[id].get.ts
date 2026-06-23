import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'

const optionalLineColumns = {
  late_entry_fine: 'lateEntryFine',
  early_exit_fine: 'earlyExitFine',
  commission_sales: 'commissionSales',
  commission_amount: 'commissionAmount',
}

const optionalPaymentColumns = {
  cycle_id: 'cycleId',
  cycle_line_id: 'cycleLineId',
}

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const cycleId = event.context.params?.id
  if (!cycleId) throw createError({ statusCode: 400, statusMessage: 'cycle id is required' })

  const client = await pool.connect()
  try {
    const cycleRes = await client.query(
      `
      SELECT
        id,
        name,
        month,
        year,
        status,
        payment_date AS "paymentDate",
        period_start AS "periodStart",
        period_end AS "periodEnd",
        total_net AS "totalNet"
      FROM payroll_cycles
      WHERE id = $1
        AND company_id = $2
      LIMIT 1
      `,
      [cycleId, companyId],
    )

    if (!cycleRes.rowCount) {
      throw createError({ statusCode: 404, statusMessage: 'Cycle not found' })
    }

    const lineColumns = await existingColumns(client, 'payroll_cycle_lines')
    const paymentColumns = await existingColumns(client, 'salary_payments')
    const hasUserLedgerEntries = await tableExists(client, 'user_ledger_entries')

    const optionalLineSelects = Object.entries(optionalLineColumns)
      .map(([column, alias]) =>
        lineColumns.has(column)
          ? `pcl.${column} AS "${alias}"`
          : `0 AS "${alias}"`,
      )
      .join(',\n        ')

    const linesRes = await client.query(
      `
      SELECT
        pcl.id,
        pcl.user_id AS "userId",
        pcl.base_salary AS "baseSalary",
        pcl.expected_days AS "expectedDays",
        pcl.present_days AS "presentDays",
        pcl.absent_days AS "absentDays",
        pcl.half_days AS "halfDays",
        pcl.leave_deduction AS "leaveDeduction",
        pcl.overtime_hours AS "overtimeHours",
        pcl.overtime_amount AS "overtimeAmount",
        ${optionalLineSelects},
        pcl.adjustment_total AS "adjustmentTotal",
        pcl.gross_pay AS "grossPay",
        pcl.net_pay AS "netPay",
        json_build_object(
          'userId', cu.user_id,
          'name', cu.name,
          'code', cu.code,
          'phone', cu.phone
        ) AS "user"
      FROM payroll_cycle_lines pcl
      LEFT JOIN company_users cu
        ON cu.company_id = pcl.company_id
       AND cu.user_id = pcl.user_id
      WHERE pcl.company_id = $1
        AND pcl.cycle_id = $2
      ORDER BY cu.name NULLS LAST, cu.code NULLS LAST
      `,
      [companyId, cycleId],
    )

    let payments: any[] = []
    if (paymentColumns.size) {
      const hasCycle = paymentColumns.has('cycle_id')
      const hasLine = paymentColumns.has('cycle_line_id')
      if (!hasCycle && !hasLine) {
        return {
          cycle: {
            ...cycleRes.rows[0],
            lines: linesRes.rows,
          },
          payments: [],
        }
      }
      const paymentSelects = Object.entries(optionalPaymentColumns)
        .map(([column, alias]) =>
          paymentColumns.has(column)
            ? `sp.${column} AS "${alias}"`
            : `NULL AS "${alias}"`,
        )
        .join(',\n          ')

      const paymentsRes = await client.query(
        `
        SELECT
          sp.id,
          sp.user_id AS "userId",
          sp.amount,
          ${paymentSelects}
        FROM salary_payments sp
        WHERE sp.company_id = $1
          ${hasCycle ? 'AND sp.cycle_id = $2' : ''}
          ${!hasCycle && hasLine ? 'AND sp.cycle_line_id = ANY($2::text[])' : ''}
        `,
        hasCycle
          ? [companyId, cycleId]
          : [companyId, linesRes.rows.map((line) => line.id)],
      )
      payments = paymentsRes.rows
    }

    let creditCuts: any[] = []
    let creditDues: any[] = []
    let carryForwards: any[] = []
    if (hasUserLedgerEntries) {
      const lineIds = linesRes.rows.map((line) => line.id)
      const userIds = linesRes.rows.map((line) => line.userId)
      const creditCutsRes = await client.query(
        `
        SELECT
          user_id AS "userId",
          source_id AS "cycleLineId",
          SUM(amount) AS amount
        FROM user_ledger_entries
        WHERE company_id = $1
          AND source_type = 'PAYROLL'
          AND type = 'CREDIT_BILL_PAYMENT'
          AND source_id = ANY($2::text[])
        GROUP BY user_id, source_id
        `,
        [companyId, lineIds],
      )
      creditCuts = creditCutsRes.rows

      const creditDuesRes = await client.query(
        `
        SELECT
          user_id AS "userId",
          SUM(
            CASE
              WHEN type = 'USER_CREDIT_BILL' THEN amount
              WHEN type = 'CREDIT_BILL_PAYMENT' THEN -amount
              ELSE 0
            END
          ) AS due
        FROM user_ledger_entries
        WHERE company_id = $1
          AND user_id = ANY($2::text[])
        GROUP BY user_id
        `,
        [companyId, userIds],
      )
      creditDues = creditDuesRes.rows

      const carryRes = await client.query(
        `
        SELECT
          ule.user_id AS "userId",
          SUM(CASE WHEN ule.direction = 'CREDIT' THEN ule.amount ELSE -ule.amount END) AS amount
        FROM user_ledger_entries ule
        LEFT JOIN salary_payments sp
          ON ule.company_id = sp.company_id
         AND ule.source_type = 'SALARY_PAYMENT'
         AND ule.source_id = sp.id
        WHERE ule.company_id = $1
          AND ule.user_id = ANY($2::text[])
          AND ule.created_at < $7
          AND NOT (
            ule.type = 'PAYROLL_ACCRUAL'
            AND ule.source_type = 'PAYROLL_CYCLE'
            AND ule.source_id = ANY($3::text[])
          )
          AND NOT (
            ule.type = 'SALARY_PAYMENT'
            AND (
              sp.cycle_id = $4
              OR (ule.source_type = 'PAYROLL' AND ule.source_id = ANY($5::text[]))
            )
          )
          AND NOT (
            ule.type = 'CREDIT_BILL_PAYMENT'
            AND ule.source_type = 'PAYROLL'
            AND ule.source_id = ANY($6::text[])
          )
        GROUP BY ule.user_id
        `,
        [
          companyId,
          userIds,
          userIds.map((userId) => `${cycleId}:${userId}`),
          cycleId,
          lineIds.map((lineId) => `${lineId}:salary-settlement`),
          lineIds,
          cycleRes.rows[0].periodStart,
        ],
      )
      carryForwards = carryRes.rows
    }

    return {
      cycle: {
        ...cycleRes.rows[0],
        lines: linesRes.rows,
      },
      payments,
      creditCuts,
      creditDues,
      carryForwards,
    }
  } finally {
    client.release()
  }
})

async function existingColumns(client: any, tableName: string) {
  const res = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = $1
    `,
    [tableName],
  )
  return new Set(res.rows.map((row: any) => row.column_name))
}

async function tableExists(client: any, tableName: string) {
  const res = await client.query(`SELECT to_regclass($1) AS table_name`, [tableName])
  return !!res.rows[0]?.table_name
}
