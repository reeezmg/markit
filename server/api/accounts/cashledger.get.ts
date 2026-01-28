import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data.companyId

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)

  const from = query.from
    ? new Date(query.from as string)
    : new Date('1970-01-01')

  const to = query.to
    ? new Date(query.to as string)
    : new Date()

  const client = await pool.connect()

  try {
    const rows: any[] = []

    /* =================================================
       CASH INFO + BASE OPENING
    ================================================== */
    const cashRes = await client.query(
      `
      SELECT cash
      FROM companies
      WHERE id = $1
      `,
      [companyId]
    )

    const baseOpening = Number(cashRes.rows[0]?.cash || 0)

    const cashInfo = {
      id: 'CASH',
      type: 'CASH',
      name: 'Cash',
    }

    /* =================================================
       OPENING BALANCE (FAST SUMS)
    ================================================== */
    let salesBefore = 0
    let expensesBefore = 0
    let moneyNetBefore = 0
    let transferNetBefore = 0

    // SALES (CASH ONLY)
    {
      const r = await client.query(
        `
        WITH split AS (
          SELECT (elem->>'amount')::numeric AS amount
          FROM bills b
          JOIN LATERAL jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(b.split_payments::jsonb) = 'array'
              THEN b.split_payments::jsonb
              ELSE '[]'::jsonb
            END
          ) elem ON true
          WHERE b.company_id = $1
            AND b.payment_method = 'Split'
            AND (elem->>'method') = 'Cash'
            AND b.deleted = false
            AND b.payment_status IN ('PAID','PENDING')
            AND b.is_markit = false
            AND b.created_at < $2
        )
        SELECT
          COALESCE(SUM(
            CASE WHEN payment_method = 'Cash' THEN grand_total ELSE 0 END
          ), 0)
          + COALESCE((SELECT SUM(amount) FROM split), 0) AS total
        FROM bills
        WHERE company_id = $1
          AND deleted = false
          AND payment_status IN ('PAID','PENDING')
          AND is_markit = false
          AND created_at < $2
        `,
        [companyId, from]
      )

      salesBefore = Number(r.rows[0].total || 0)
    }

    // EXPENSES (CASH ONLY)
    {
      const r = await client.query(
        `
        SELECT COALESCE(SUM(total_amount), 0) AS total
        FROM expenses
        WHERE company_id = $1
          AND payment_mode = 'CASH'
          AND UPPER(status) = 'PAID'
          AND expense_date < $2
        `,
        [companyId, from]
      )

      expensesBefore = Number(r.rows[0].total || 0)
    }

    // MONEY TRANSACTIONS (CASH ONLY)
    {
      const r = await client.query(
        `
        SELECT COALESCE(SUM(
          CASE
            WHEN direction = 'RECEIVED' THEN amount
            ELSE -amount
          END
        ), 0) AS net
        FROM money_transactions
        WHERE company_id = $1
          AND payment_mode = 'CASH'
          AND status = 'PAID'
          AND created_at < $2
        `,
        [companyId, from]
      )

      moneyNetBefore = Number(r.rows[0].net || 0)
    }

    // ACCOUNT TRANSFERS (CASH ONLY)
    {
      const r = await client.query(
        `
        SELECT
          COALESCE(SUM(
            CASE
              WHEN to_type = 'CASH'
              THEN amount ELSE 0 END
          ), 0)
          -
          COALESCE(SUM(
            CASE
              WHEN from_type = 'CASH'
              THEN amount ELSE 0 END
          ), 0) AS net
        FROM account_transfers
        WHERE company_id = $1
          AND created_at < $2
          AND (
            from_type = 'CASH'
            OR
            to_type = 'CASH'
          )
        `,
        [companyId, from]
      )

      transferNetBefore = Number(r.rows[0].net || 0)
    }

    const openingBalance =
      baseOpening +
      salesBefore -
      expensesBefore +
      moneyNetBefore +
      transferNetBefore

    /* =================================================
       OPENING ROW
    ================================================== */
    rows.push({
      date: from,
      source: 'OPENING',
      ref: '-',
      description: 'Opening Balance',
      debit: 0,
      credit: openingBalance,
    })

    /* =================================================
       LEDGER ROWS (CASH ONLY)
    ================================================== */

    // SALES
    {
      const r = await client.query(
        `
        WITH split AS (
          SELECT
            b.created_at,
            b.invoice_number,
            (elem->>'method') AS method,
            (elem->>'amount')::numeric AS amount
          FROM bills b
          JOIN LATERAL jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(b.split_payments::jsonb) = 'array'
              THEN b.split_payments::jsonb
              ELSE '[]'::jsonb
            END
          ) elem ON true
          WHERE b.company_id = $1
            AND b.payment_method = 'Split'
            AND b.deleted = false
            AND b.payment_status IN ('PAID','PENDING')
            AND b.is_markit = false
            AND b.created_at BETWEEN $2 AND $3
        )

        SELECT
          b.created_at AS date,
          'SALE' AS source,
          b.invoice_number::text AS ref,
          'Sale via Cash' AS description,
          0 AS debit,
          b.grand_total AS credit
        FROM bills b
        WHERE b.company_id = $1
          AND b.payment_method = 'Cash'
          AND b.deleted = false
          AND b.payment_status IN ('PAID','PENDING')
          AND b.is_markit = false
          AND b.created_at BETWEEN $2 AND $3

        UNION ALL

        SELECT
          s.created_at,
          'SALE',
          s.invoice_number::text,
          'Sale via Cash (Split)',
          0,
          s.amount
        FROM split s
        WHERE s.method = 'Cash'
        `,
        [companyId, from, to]
      )

      rows.push(...r.rows)
    }

    // EXPENSES
    {
      const r = await client.query(
        `
        SELECT
          expense_date AS date,
          'EXPENSE' AS source,
          id::text AS ref,
          'Expense paid by cash' AS description,
          total_amount AS debit,
          0 AS credit
        FROM expenses
        WHERE company_id = $1
          AND payment_mode = 'CASH'
          AND UPPER(status) = 'PAID'
          AND expense_date BETWEEN $2 AND $3
        `,
        [companyId, from, to]
      )

      rows.push(...r.rows)
    }

    // MONEY TRANSACTIONS
    {
      const r = await client.query(
        `
        SELECT
          created_at AS date,
          'TRANSACTION' AS source,
          id::text AS ref,
          direction || ' via cash' AS description,
          CASE WHEN direction = 'GIVEN' THEN amount ELSE 0 END AS debit,
          CASE WHEN direction = 'RECEIVED' THEN amount ELSE 0 END AS credit
        FROM money_transactions
        WHERE company_id = $1
          AND payment_mode = 'CASH'
          AND status = 'PAID'
          AND created_at BETWEEN $2 AND $3
        `,
        [companyId, from, to]
      )

      rows.push(...r.rows)
    }

    // ACCOUNT TRANSFERS
    {
      const r = await client.query(
        `
        SELECT
          created_at AS date,
          'TRANSFER' AS source,
          id::text AS ref,
          from_type || ' → ' || to_type AS description,
          CASE
            WHEN from_type = 'CASH'
            THEN amount ELSE 0 END AS debit,
          CASE
            WHEN to_type = 'CASH'
            THEN amount ELSE 0 END AS credit
        FROM account_transfers
        WHERE company_id = $1
          AND created_at BETWEEN $2 AND $3
          AND (
            from_type = 'CASH'
            OR
            to_type = 'CASH'
          )
        `,
        [companyId, from, to]
      )

      rows.push(...r.rows)
    }

    /* =================================================
       SORT + RUNNING BALANCE
    ================================================== */
    rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    let balance = 0
    const ledger = rows.map(r => {
      balance += Number(r.credit) - Number(r.debit)
      return { ...r, runningBalance: balance }
    })

    return {
      cash: { ...cashInfo, openingBalance },
      from,
      to,
      ledger,
      closingBalance: balance,
    }
  } finally {
    client.release()
  }
})
