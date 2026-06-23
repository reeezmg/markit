import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'
import { accountLedgerRowsForApi } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const query = getQuery(event)
  const from = query.from ? new Date(query.from as string) : new Date(0)
  const to = query.to ? new Date(query.to as string) : new Date()
  const client = await pool.connect()

  try {
    const bankRes = await client.query(
      `
      SELECT bank_name, acc_holder_name, account_no, ifsc, upi_id
      FROM companies
      WHERE id = $1
      `,
      [companyId],
    )
    const c = bankRes.rows[0] || {}
    const salesRes = await client.query(
      `
      WITH bill_rows AS (
        SELECT b.grand_total::numeric AS amount
        FROM bills b
        WHERE b.company_id = $1
          AND b.created_at BETWEEN $2 AND $3
          AND b.payment_method IN ('UPI', 'Card')
          AND b.deleted = false
          AND b.payment_status IN ('PAID', 'PENDING')
          AND b.is_markit = false

        UNION ALL

        SELECT (elem->>'amount')::numeric AS amount
        FROM bills b
        JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN b.split_payments IS NOT NULL AND jsonb_typeof(b.split_payments::jsonb) = 'array' THEN b.split_payments::jsonb
            ELSE '[]'::jsonb
          END
        ) elem ON true
        WHERE b.company_id = $1
          AND b.created_at BETWEEN $2 AND $3
          AND b.payment_method = 'Split'
          AND elem->>'method' IN ('UPI', 'Card')
          AND b.deleted = false
          AND b.payment_status IN ('PAID', 'PENDING')
          AND b.is_markit = false
      )
      SELECT COALESCE(SUM(amount), 0)::numeric AS total_sales
      FROM bill_rows
      WHERE COALESCE(amount, 0) > 0
      `,
      [companyId, from, to],
    )
    const result = await accountLedgerRowsForApi(client, { companyId, accountType: 'PRIMARY_BANK', accountId: null, from, to })
    return {
      bank: {
        id: 'PRIMARY',
        type: 'PRIMARY',
        bankName: c.bank_name || 'Primary Bank',
        accHolderName: c.acc_holder_name,
        accountNo: c.account_no,
        ifsc: c.ifsc,
        upiId: c.upi_id,
        openingBalance: result.openingBalance,
      },
      from,
      to,
      ledger: result.ledger,
      closingBalance: result.closingBalance,
      totalSales: Number(salesRes.rows[0]?.total_sales || 0),
    }
  } finally {
    client.release()
  }
})
