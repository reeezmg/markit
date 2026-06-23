import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const client = await pool.connect()
  try {
    const res = await client.query(
      `
      WITH ledger_totals AS (
        SELECT
          user_id,
          SUM(CASE WHEN type = 'USER_CREDIT_BILL' THEN amount ELSE 0 END) AS credit_total,
          SUM(CASE WHEN type = 'CREDIT_BILL_PAYMENT' THEN amount ELSE 0 END) AS payment_total,
          SUM(
            CASE
              WHEN type = 'USER_CREDIT_BILL' THEN amount
              WHEN type = 'CREDIT_BILL_PAYMENT' THEN -amount
              ELSE 0
            END
          ) AS credit_due
        FROM user_ledger_entries
        WHERE company_id = $1
          AND type IN ('USER_CREDIT_BILL', 'CREDIT_BILL_PAYMENT')
        GROUP BY user_id
      ),
      latest AS (
        SELECT DISTINCT ON (user_id)
          user_id,
          balance_after
        FROM user_ledger_entries
        WHERE company_id = $1
          AND type IN ('USER_CREDIT_BILL', 'CREDIT_BILL_PAYMENT')
        ORDER BY user_id, created_at DESC, id DESC
      )
      SELECT
        cu.user_id AS "userId",
        cu.name,
        cu.code,
        COALESCE(lt.credit_total, 0) AS "totalCredit",
        COALESCE(lt.payment_total, 0) AS "totalPayment",
        COALESCE(lt.credit_due, 0) AS "creditDue",
        COALESCE(lt.credit_due, 0) AS due,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ule.id,
              'type', ule.type,
              'direction', ule.direction,
              'sourceType', ule.source_type,
              'sourceId', ule.source_id,
              'paymentMode', mt.payment_mode,
              'amount', ule.amount,
              'balanceAfter', ule.balance_after,
              'note', ule.note,
              'createdAt', ule.created_at
            )
            ORDER BY ule.created_at DESC, ule.id DESC
          ) FILTER (WHERE ule.id IS NOT NULL),
          '[]'
        ) AS transactions
      FROM company_users cu
      LEFT JOIN ledger_totals lt ON lt.user_id = cu.user_id
      LEFT JOIN latest l ON l.user_id = cu.user_id
      LEFT JOIN user_ledger_entries ule
        ON ule.company_id = cu.company_id
       AND ule.user_id = cu.user_id
       AND ule.type IN ('USER_CREDIT_BILL', 'CREDIT_BILL_PAYMENT')
      LEFT JOIN money_transactions mt
        ON mt.company_id = cu.company_id
       AND mt.id = ule.id
      WHERE cu.company_id = $1
        AND cu.deleted = false
      GROUP BY cu.user_id, cu.name, cu.code, lt.credit_total, lt.payment_total, lt.credit_due, l.balance_after
      HAVING COUNT(ule.id) > 0
      ORDER BY cu.name NULLS LAST, cu.code NULLS LAST
      `,
      [companyId],
    )

    return res.rows
  } finally {
    client.release()
  }
})
