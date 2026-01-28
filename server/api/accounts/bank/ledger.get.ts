import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data.companyId

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const bankId = query.bankId as string | undefined

  const from = query.from
    ? new Date(query.from as string)
    : new Date('1970-01-01')

  const to = query.to
    ? new Date(query.to as string)
    : new Date()

  const isPrimary = !bankId
  const client = await pool.connect()

  try {
    const rows: any[] = []

    /* =================================================
       BANK INFO + BASE OPENING BALANCE
    ================================================== */
    let baseOpening = 0
    let bankInfo: any = {}

    if (isPrimary) {
      const r = await client.query(
        `
        SELECT bank, bank_name, acc_holder_name, account_no, ifsc, upi_id
        FROM companies
        WHERE id = $1
        `,
        [companyId]
      )

      const c = r.rows[0]
      baseOpening = Number(c?.bank || 0)

      bankInfo = {
        id: 'PRIMARY',
        type: 'PRIMARY',
        bankName: c?.bank_name || 'Primary Bank',
        accHolderName: c?.acc_holder_name,
        accountNo: c?.account_no,
        ifsc: c?.ifsc,
        upiId: c?.upi_id,
      }
    } else {
      const r = await client.query(
        `
        SELECT id, bank_name, acc_holder_name, account_no, ifsc, upi_id, opening_balance
        FROM bank_accounts
        WHERE id = $1 AND company_id = $2
        `,
        [bankId, companyId]
      )

      const b = r.rows[0]
      if (!b) throw createError({ statusCode: 404, statusMessage: 'Bank not found' })

      baseOpening = Number(b.opening_balance || 0)

      bankInfo = {
        id: b.id,
        type: 'SECONDARY',
        bankName: b.bank_name,
        accHolderName: b.acc_holder_name,
        accountNo: b.account_no,
        ifsc: b.ifsc,
        upiId: b.upi_id,
      }
    }

    /* =================================================
       FAST OPENING BALANCE (SUMS ONLY)
    ================================================== */
    let salesBefore = 0
    let expensesBefore = 0
    let moneyNetBefore = 0
    let transferNetBefore = 0

    // A. SALES (PRIMARY ONLY)
    if (isPrimary) {
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
            AND (elem->>'method') IN ('UPI','Card')
            AND b.deleted = false
            AND b.payment_status IN ('PAID','PENDING')
            AND b.is_markit = false
            AND b.created_at < $2
        )
        SELECT
          COALESCE(SUM(
            CASE WHEN payment_method IN ('UPI','Card') THEN grand_total ELSE 0 END
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

    // B. EXPENSES (PRIMARY ONLY)
    if (isPrimary) {
      const r = await client.query(
        `
        SELECT COALESCE(SUM(total_amount), 0) AS total
        FROM expenses
        WHERE company_id = $1
          AND payment_mode = 'BANK'
          AND created_at < $2
        `,
        [companyId, from]
      )

      expensesBefore = Number(r.rows[0].total || 0)
    }

    // C. MONEY TRANSACTIONS (BANK-SPECIFIC)
    {
      const r = await client.query(
        `
        SELECT COALESCE(SUM(
          CASE WHEN direction = 'RECEIVED' THEN amount ELSE -amount END
        ), 0) AS net
        FROM money_transactions
        WHERE company_id = $1
          AND payment_mode = 'BANK'
          AND status = 'PAID'
          AND (
            ($2::text IS NULL AND account_id IS NULL)
            OR
            ($2::text IS NOT NULL AND account_id = $2)
          )
          AND created_at < $3
        `,
        [companyId, bankId ?? null, from]
      )

      moneyNetBefore = Number(r.rows[0].net || 0)
    }

    // D. ACCOUNT TRANSFERS (BANK-SPECIFIC)
    {
      const r = await client.query(
        `
        SELECT
          COALESCE(SUM(
            CASE
              WHEN to_type = 'BANK'
               AND ($2::text IS NULL OR to_account_id = $2)
              THEN amount ELSE 0 END
          ), 0)
          -
          COALESCE(SUM(
            CASE
              WHEN from_type = 'BANK'
               AND ($2::text IS NULL OR from_account_id = $2)
              THEN amount ELSE 0 END
          ), 0) AS net
        FROM account_transfers
        WHERE company_id = $1
          AND created_at < $3
        `,
        [companyId, bankId ?? null, from]
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
       LEDGER ROWS BETWEEN FROM → TO
    ================================================== */

    // SALES
    if (isPrimary) {
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
          'Sale via ' || b.payment_method AS description,
          0 AS debit,
          b.grand_total AS credit
        FROM bills b
        WHERE b.company_id = $1
          AND b.payment_method IN ('UPI','Card')
          AND b.deleted = false
          AND b.payment_status IN ('PAID','PENDING')
          AND b.is_markit = false
          AND b.created_at BETWEEN $2 AND $3

        UNION ALL

        SELECT
          s.created_at,
          'SALE',
          s.invoice_number::text,
          'Sale via ' || s.method || ' (Split)',
          0,
          s.amount
        FROM split s
        WHERE s.method IN ('UPI','Card')
        `,
        [companyId, from, to]
      )

      rows.push(...r.rows)
    }

    // EXPENSES
    if (isPrimary) {
      const r = await client.query(
        `
        SELECT
          created_at AS date,
          'EXPENSE' AS source,
          id::text AS ref,
          'Expense paid from bank' AS description,
          total_amount AS debit,
          0 AS credit
        FROM expenses
        WHERE company_id = $1
          AND payment_mode = 'BANK'
          AND created_at BETWEEN $2 AND $3
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
          'MONEY' AS source,
          id::text AS ref,
          direction || ' via bank' AS description,
          CASE WHEN direction = 'GIVEN' THEN amount ELSE 0 END AS debit,
          CASE WHEN direction = 'RECEIVED' THEN amount ELSE 0 END AS credit
        FROM money_transactions
        WHERE company_id = $1
          AND payment_mode = 'BANK'
          AND status = 'PAID'
          AND (
            ($4::text IS NULL AND account_id IS NULL)
            OR
            ($4::text IS NOT NULL AND account_id = $4)
          )
          AND created_at BETWEEN $2 AND $3
        `,
        [companyId, from, to, bankId ?? null]
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
            WHEN from_type = 'BANK'
             AND ($4::text IS NULL OR from_account_id = $4)
            THEN amount ELSE 0 END AS debit,
          CASE
            WHEN to_type = 'BANK'
             AND ($4::text IS NULL OR to_account_id = $4)
            THEN amount ELSE 0 END AS credit
        FROM account_transfers
        WHERE company_id = $1
          AND created_at BETWEEN $2 AND $3
        `,
        [companyId, from, to, bankId ?? null]
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
      bank: { ...bankInfo, openingBalance },
      from,
      to,
      ledger,
      closingBalance: balance,
    }
  } finally {
    client.release()
  }
})
