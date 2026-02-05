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
    : new Date(0)

  const to = query.to
    ? new Date(query.to as string)
    : new Date()

  const client = await pool.connect()

  try {
    const rows: any[] = []

    /* =================================================
       PRIMARY BANK INFO + DATE FILTERED OPENING
    ================================================== */
    const bankRes = await client.query(
  `
  SELECT 
    bank,
    opening_bank_date,
    bank_name,
    acc_holder_name,
    account_no,
    ifsc,
    upi_id
  FROM companies
  WHERE id = $1
  `,
  [companyId]
)

const c = bankRes.rows[0]

let baseOpening = 0

/* =================================================
   INCLUDE ONLY IF OPENING DATE INSIDE RANGE
================================================= */
if (
  c?.bank &&
  c?.opening_bank_date &&
  new Date(c.opening_bank_date) <= from
) {
  baseOpening = Number(c.bank)
}

const bankInfo = {
  id: 'PRIMARY',
  type: 'PRIMARY',
  bankName: c?.bank_name || 'Primary Bank',
  accHolderName: c?.acc_holder_name,
  accountNo: c?.account_no,
  ifsc: c?.ifsc,
  upiId: c?.upi_id,
}


    /* =================================================
       OPENING FAST SUMS
    ================================================== */

    // ---------- SALES ----------
    const salesBeforeRes = await client.query(
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
          CASE 
            WHEN payment_method IN ('UPI','Card')
            THEN grand_total ELSE 0 END
        ),0)
        +
        COALESCE((SELECT SUM(amount) FROM split),0)
        AS total
      FROM bills
      WHERE company_id = $1
        AND deleted = false
        AND payment_status IN ('PAID','PENDING')
        AND is_markit = false
        AND created_at < $2
      `,
      [companyId, from]
    )

    const salesBefore =
      Number(salesBeforeRes.rows[0].total || 0)

    // ---------- EXPENSES ----------
    const expensesBeforeRes = await client.query(
      `
      SELECT COALESCE(SUM(total_amount),0) AS total
      FROM expenses
      WHERE company_id = $1
        AND payment_mode = 'BANK'
        AND UPPER(status) = 'PAID'
        AND expense_date < $2
      `,
      [companyId, from]
    )

    const expensesBefore =
      Number(expensesBeforeRes.rows[0].total || 0)

    // ---------- TRANSACTIONS ----------
    const moneyBeforeRes = await client.query(
      `
      SELECT COALESCE(SUM(
        CASE
          WHEN direction = 'RECEIVED'
          THEN amount ELSE -amount END
      ),0) AS net
      FROM money_transactions
      WHERE company_id = $1
        AND payment_mode = 'BANK'
        AND status = 'PAID'
        AND account_id IS NULL
        AND created_at < $2
      `,
      [companyId, from]
    )

    const moneyNetBefore =
      Number(moneyBeforeRes.rows[0].net || 0)

    // ---------- TRANSFERS ----------
    const transferBeforeRes = await client.query(
      `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN to_type = 'BANK'
              AND to_account_id IS NULL
            THEN amount ELSE 0 END
        ),0)
        -
        COALESCE(SUM(
          CASE
            WHEN from_type = 'BANK'
              AND from_account_id IS NULL
            THEN amount ELSE 0 END
        ),0)
        AS net
      FROM account_transfers
      WHERE company_id = $1
        AND created_at < $2
      `,
      [companyId, from]
    )

    const transferNetBefore =
      Number(transferBeforeRes.rows[0].net || 0)

      // ---------- DISTRIBUTOR PAYMENTS ----------
const distributorBeforeRes = await client.query(
  `
  SELECT COALESCE(SUM(amount),0) AS total
  FROM distributor_payments
  WHERE company_id = $1
    AND payment_type = 'BANK'
    AND created_at < $2
  `,
  [companyId, from]
)

const distributorBefore =
  Number(distributorBeforeRes.rows[0].total || 0)


    /* =================================================
       FINAL OPENING
    ================================================== */
const openingBalance =
  baseOpening +
  salesBefore -
  expensesBefore -
  distributorBefore +
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
       SALES LEDGER (WITH INVOICE NO)
    ================================================== */
    const salesLedgerRes = await client.query(
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
        'Sale via ' || b.payment_method ||
        ' (' || b.invoice_number || ')' AS description,
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
        'Sale via ' || s.method ||
        ' (' || s.invoice_number || ') (Split)',
        0,
        s.amount
      FROM split s
      WHERE s.method IN ('UPI','Card')
      `,
      [companyId, from, to]
    )

    rows.push(...salesLedgerRes.rows)

    /* =================================================
       EXPENSE LEDGER (CATEGORY + NOTE)
    ================================================== */
    const expenseLedgerRes = await client.query(
      `
      SELECT
        e.expense_date AS date,
        'EXPENSE' AS source,
        e.id::text AS ref,

        ec.name || 
        ' (' || COALESCE(e.note,'none') || ')' 
          AS description,

        e.total_amount AS debit,
        0 AS credit

      FROM expenses e
      JOIN expense_categories ec
        ON ec.id = e.expense_category_id

      WHERE e.company_id = $1
        AND e.payment_mode = 'BANK'
        AND UPPER(e.status) = 'PAID'
        AND e.expense_date BETWEEN $2 AND $3
      `,
      [companyId, from, to]
    )

    rows.push(...expenseLedgerRes.rows)

    /* =================================================
       DISTRIBUTOR PAYMENTS
    ================================================== */
    const purchaseLedgerRes = await client.query(
      `
      SELECT
        dp.created_at AS date,
        'PURCHASE' AS source,
        dp.id::text AS ref,

        'Paid to ' ||
        d.name ||
        ' (' || COALESCE(po.purchase_order_no::text,'-') || ')'
          AS description,

        dp.amount AS debit,
        0 AS credit

      FROM distributor_payments dp

      JOIN distributor_companies dc
        ON dc.distributor_id = dp.distributor_id
       AND dc.company_id = dp.company_id

      JOIN distributors d
        ON d.id = dc.distributor_id

      LEFT JOIN purchase_orders po
        ON po.id = dp.purchase_order_id

      WHERE dp.company_id = $1
        AND dp.payment_type = 'BANK'
        AND dp.created_at BETWEEN $2 AND $3
      `,
      [companyId, from, to]
    )

    rows.push(...purchaseLedgerRes.rows)

        /* =================================================
       MONEY TRANSACTIONS (WITH NOTE)
       PRIMARY BANK ONLY
    ================================================== */
    const transactionLedgerRes = await client.query(
      `
      SELECT
        mt.created_at AS date,
        'TRANSACTION' AS source,
        mt.id::text AS ref,

        mt.direction ||
        ' via bank' ||
        ' (' || COALESCE(mt.note,'none') || ')'
          AS description,

        CASE 
          WHEN mt.direction = 'GIVEN'
          THEN mt.amount ELSE 0 END AS debit,

        CASE 
          WHEN mt.direction = 'RECEIVED'
          THEN mt.amount ELSE 0 END AS credit

      FROM money_transactions mt
      WHERE mt.company_id = $1
        AND mt.payment_mode = 'BANK'
        AND mt.status = 'PAID'
        AND mt.account_id IS NULL
        AND mt.created_at BETWEEN $2 AND $3
      `,
      [companyId, from, to]
    )

    rows.push(...transactionLedgerRes.rows)

    /* =================================================
       ACCOUNT TRANSFERS (WITH NOTE)
       PRIMARY BANK ONLY
    ================================================== */
    const transferLedgerRes = await client.query(
      `
      SELECT
        at.created_at AS date,
        'TRANSFER' AS source,
        at.id::text AS ref,

        at.from_type || ' → ' || at.to_type ||
        ' (' || COALESCE(at.note,'none') || ')'
          AS description,

        CASE
          WHEN at.from_type = 'BANK'
            AND at.from_account_id IS NULL
          THEN at.amount ELSE 0 END AS debit,

        CASE
          WHEN at.to_type = 'BANK'
            AND at.to_account_id IS NULL
          THEN at.amount ELSE 0 END AS credit

      FROM account_transfers at
      WHERE at.company_id = $1
        AND at.created_at BETWEEN $2 AND $3
        AND (
          (at.from_type = 'BANK' AND at.from_account_id IS NULL)
          OR
          (at.to_type = 'BANK' AND at.to_account_id IS NULL)
        )
      `,
      [companyId, from, to]
    )

    rows.push(...transferLedgerRes.rows)

    /* =================================================
       SORT LEDGER CHRONOLOGICALLY
    ================================================== */
    rows.sort(
      (a, b) =>
        new Date(a.date).getTime() -
        new Date(b.date).getTime()
    )

    /* =================================================
       RUNNING BALANCE + CLOSING
    ================================================== */
    let balance = 0

    const ledger = rows.map(r => {
      balance +=
        Number(r.credit || 0) -
        Number(r.debit || 0)

      return {
        ...r,
        runningBalance: balance
      }
    })

    const closingBalance = balance

    /* =================================================
       RETURN
    ================================================== */
    return {
      bank: {
        ...bankInfo,
        openingBalance
      },

      from,
      to,

      ledger,

      closingBalance
    }

  } finally {
    client.release()
  }
})
