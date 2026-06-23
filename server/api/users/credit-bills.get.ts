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
      SELECT
        cu.user_id AS "userId",
        cu.name,
        cu.code,
        COALESCE(
          json_agg(
            json_build_object(
              'id', b.id,
              'invoiceNumber', b.invoice_number,
              'createdAt', b.created_at,
              'grandTotal', b.grand_total,
              'paymentMethod', b.payment_method,
              'paymentStatus', b.payment_status,
              'splitPayments', b.split_payments,
              'notes', b.notes,
              'entriesCount', COALESCE(ec.entries_count, 0),
              'creditAmount',
                CASE
                  WHEN b.payment_method = 'Split' THEN COALESCE(st.credit_amount, 0)
                  ELSE COALESCE(b.grand_total, 0)
                END
            )
            ORDER BY b.created_at DESC
          ) FILTER (WHERE b.id IS NOT NULL),
          '[]'
        ) AS bills
      FROM company_users cu
      LEFT JOIN bills b
        ON b.company_id = cu.company_id
       AND b.credit_user_id = cu.user_id
       AND b.deleted = false
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS entries_count
        FROM entries e
        WHERE e.bill_id = b.id
      ) ec ON true
      LEFT JOIN LATERAL (
        SELECT SUM((payment ->> 'amount')::numeric) AS credit_amount
        FROM jsonb_array_elements(COALESCE(b.split_payments::jsonb, '[]'::jsonb)) payment
        WHERE payment ->> 'method' = 'Credit'
      ) st ON true
      WHERE cu.company_id = $1
        AND cu.deleted = false
        AND EXISTS (
          SELECT 1
          FROM bills bx
          WHERE bx.company_id = cu.company_id
            AND bx.credit_user_id = cu.user_id
            AND bx.deleted = false
        )
      GROUP BY cu.user_id, cu.name, cu.code
      ORDER BY cu.name NULLS LAST, cu.code NULLS LAST
      `,
      [companyId],
    )

    return res.rows
  } finally {
    client.release()
  }
})
