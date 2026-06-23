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
          SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END) AS credit_total,
          SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END) AS debit_total
        FROM user_ledger_entries
        WHERE company_id = $1
        GROUP BY user_id
      ),
      latest AS (
        SELECT DISTINCT ON (user_id)
          user_id,
          balance_after
        FROM user_ledger_entries
        WHERE company_id = $1
        ORDER BY user_id, created_at DESC, id DESC
      )
      SELECT
        cu.user_id AS "userId",
        cu.name,
        cu.code,
        COALESCE(lt.credit_total, 0) AS "totalCredit",
        COALESCE(lt.debit_total, 0) AS "totalDebit",
        COALESCE(l.balance_after, 0) AS balance,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ule.id,
              'type', ule.type,
              'direction', ule.direction,
              'sourceType', ule.source_type,
              'sourceId', ule.source_id,
              'amount', ule.amount,
              'balanceAfter', ule.balance_after,
              'note', ule.note,
              'createdAt', ule.created_at
            )
            ORDER BY ule.created_at DESC, ule.id DESC
          ) FILTER (WHERE ule.id IS NOT NULL),
          '[]'
        ) AS entries
      FROM company_users cu
      LEFT JOIN ledger_totals lt ON lt.user_id = cu.user_id
      LEFT JOIN latest l ON l.user_id = cu.user_id
      LEFT JOIN user_ledger_entries ule
        ON ule.company_id = cu.company_id
       AND ule.user_id = cu.user_id
      WHERE cu.company_id = $1
        AND cu.deleted = false
      GROUP BY cu.user_id, cu.name, cu.code, lt.credit_total, lt.debit_total, l.balance_after
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
