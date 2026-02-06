import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { pool } from '~/server/db'
import ExcelJS from 'exceljs'

export default defineEventHandler(async (event) => {

  /* =====================================================
     AUTH
  ===================================================== */

  const session = await useAuthSession(event)
  const companyId = session.data.companyId

  if (!companyId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }



  /* =====================================================
     DATE FILTER
  ===================================================== */

  const query = getQuery(event)

  const startDate = query.startDate
    ? new Date(query.startDate as string)
    : new Date(0)

  const endDate = query.endDate
    ? new Date(query.endDate as string)
    : new Date()



  const client = await pool.connect()

  try {

    /* =====================================================
       BASE OPENING (COMPANY)
    ===================================================== */

    const baseRes = await client.query(
      `
      SELECT 
        cash,
        bank,
        opening_cash_date,
        opening_bank_date
      FROM companies
      WHERE id = $1
      `,
      [companyId]
    )

    const company = baseRes.rows[0] || {}

    const openingCash =
      company.cash &&
      new Date(company.opening_cash_date) <= startDate
        ? Number(company.cash)
        : 0

    const openingBank =
      company.bank &&
      new Date(company.opening_bank_date) <= startDate
        ? Number(company.bank)
        : 0



    /* =====================================================
       SALES
    ===================================================== */

    const salesRes = await client.query(
      `
      SELECT
        COALESCE(SUM(
          CASE 
            WHEN b.payment_method NOT IN ('Split','Credit')
            THEN b.grand_total 
            ELSE 0 
          END
        ),0)
        +
        COALESCE(SUM(
          CASE 
            WHEN sp.method != 'Credit'
            THEN sp.amount 
            ELSE 0 
          END
        ),0) AS total_sales,

        COALESCE(SUM(
          CASE WHEN b.payment_method = 'Cash'
          THEN b.grand_total ELSE 0 END
        ),0)
        +
        COALESCE(SUM(
          CASE WHEN sp.method = 'Cash'
          THEN sp.amount ELSE 0 END
        ),0) AS cash,

        COALESCE(SUM(
          CASE WHEN b.payment_method = 'UPI'
          THEN b.grand_total ELSE 0 END
        ),0)
        +
        COALESCE(SUM(
          CASE WHEN sp.method = 'UPI'
          THEN sp.amount ELSE 0 END
        ),0) AS upi,

        COALESCE(SUM(
          CASE WHEN b.payment_method = 'Card'
          THEN b.grand_total ELSE 0 END
        ),0)
        +
        COALESCE(SUM(
          CASE WHEN sp.method = 'Card'
          THEN sp.amount ELSE 0 END
        ),0) AS card

      FROM bills b

      LEFT JOIN LATERAL (
        SELECT
          (elem->>'method') AS method,
          (elem->>'amount')::numeric AS amount
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(b.split_payments::jsonb) = 'array'
            THEN b.split_payments::jsonb
            ELSE '[]'::jsonb
          END
        ) elem
      ) sp ON b.payment_method = 'Split'

      WHERE b.company_id = $1
        AND b.deleted = false
        AND b.created_at BETWEEN $2 AND $3
      `,
      [companyId, startDate, endDate]
    )

    const sales = salesRes.rows[0]



    /* =====================================================
       EXPENSES
    ===================================================== */

    const expenseRes = await client.query(
      `
      SELECT
        SUM(total_amount) AS total_expense,

        SUM(CASE WHEN payment_mode='CASH' THEN total_amount ELSE 0 END) AS cash,
        SUM(CASE WHEN payment_mode='UPI' THEN total_amount ELSE 0 END) AS upi,
        SUM(CASE WHEN payment_mode='CARD' THEN total_amount ELSE 0 END) AS card,
        SUM(CASE WHEN payment_mode='BANK' THEN total_amount ELSE 0 END) AS bank,
        SUM(CASE WHEN payment_mode='CHEQUE' THEN total_amount ELSE 0 END) AS cheque

      FROM expenses
      WHERE company_id=$1
        AND UPPER(status)='PAID'
        AND expense_date BETWEEN $2 AND $3
      `,
      [companyId, startDate, endDate]
    )

    const expenses = expenseRes.rows[0]



    /* =====================================================
       PURCHASE
    ===================================================== */

    const purchaseRes = await client.query(
      `
      SELECT
        SUM(amount) AS total_purchase,

        SUM(CASE WHEN payment_type='CASH' THEN amount ELSE 0 END) AS cash,
        SUM(CASE WHEN payment_type='UPI' THEN amount ELSE 0 END) AS upi,
        SUM(CASE WHEN payment_type='CARD' THEN amount ELSE 0 END) AS card,
        SUM(CASE WHEN payment_type='BANK' THEN amount ELSE 0 END) AS bank,
        SUM(CASE WHEN payment_type='CHEQUE' THEN amount ELSE 0 END) AS cheque

      FROM distributor_payments
      WHERE company_id=$1
        AND created_at BETWEEN $2 AND $3
      `,
      [companyId, startDate, endDate]
    )

    const purchase = purchaseRes.rows[0]

        /* =====================================================
       ACCOUNT TRANSFERS
    ===================================================== */

    const transferRes = await client.query(
      `
      SELECT

        /* ---------- CASH ---------- */

        SUM(CASE WHEN from_type='CASH' THEN amount ELSE 0 END) AS cash_debit,
        SUM(CASE WHEN to_type='CASH' THEN amount ELSE 0 END) AS cash_credit,


        /* ---------- BANK ---------- */

        SUM(
          CASE 
            WHEN from_type!='CASH'
              AND (from_account_id IS NULL OR from_account_id='')
            THEN amount ELSE 0 END
        ) AS bank_debit,

        SUM(
          CASE 
            WHEN to_type!='CASH'
              AND (to_account_id IS NULL OR to_account_id='')
            THEN amount ELSE 0 END
        ) AS bank_credit

      FROM account_transfers
      WHERE company_id=$1
        AND created_at BETWEEN $2 AND $3
      `,
      [companyId, startDate, endDate]
    )

    const transfers = transferRes.rows[0]

    const transferCashNet =
      Number(transfers.cash_credit || 0) -
      Number(transfers.cash_debit || 0)

    const transferBankNet =
      Number(transfers.bank_credit || 0) -
      Number(transfers.bank_debit || 0)



    /* =====================================================
       MONEY TRANSACTIONS
    ===================================================== */

    const transactionRes = await client.query(
      `
      SELECT

        /* ---------- CASH ---------- */

        SUM(
          CASE 
            WHEN payment_mode='CASH'
              AND direction='GIVEN'
            THEN amount ELSE 0 END
        ) AS cash_debit,

        SUM(
          CASE 
            WHEN payment_mode='CASH'
              AND direction='RECEIVED'
            THEN amount ELSE 0 END
        ) AS cash_credit,


        /* ---------- BANK ---------- */

        SUM(
          CASE 
            WHEN payment_mode!='CASH'
              AND direction='GIVEN'
              AND (account_id IS NULL OR account_id='')
            THEN amount ELSE 0 END
        ) AS bank_debit,

        SUM(
          CASE 
            WHEN payment_mode!='CASH'
              AND direction='RECEIVED'
              AND (account_id IS NULL OR account_id='')
            THEN amount ELSE 0 END
        ) AS bank_credit

      FROM money_transactions
      WHERE company_id=$1
        AND status='PAID'
        AND created_at BETWEEN $2 AND $3
      `,
      [companyId, startDate, endDate]
    )

    const transactions = transactionRes.rows[0]

    const transactionCashNet =
      Number(transactions.cash_credit || 0) -
      Number(transactions.cash_debit || 0)

    const transactionBankNet =
      Number(transactions.bank_credit || 0) -
      Number(transactions.bank_debit || 0)



    /* =====================================================
       CLOSING BALANCE
    ===================================================== */

    const closingCash =
      openingCash +
      Number(sales.cash) -
      (Number(expenses.cash) + Number(purchase.cash)) +
      transactionCashNet +
      transferCashNet

    const closingBank =
      openingBank +
      (Number(sales.upi) + Number(sales.card)) -
      (
        Number(expenses.upi) +
        Number(expenses.card) +
        Number(expenses.bank) +
        Number(expenses.cheque) +
        Number(purchase.upi) +
        Number(purchase.card) +
        Number(purchase.bank) +
        Number(purchase.cheque)
      ) +
      transactionBankNet +
      transferBankNet

    const closingTotal = closingCash + closingBank



    /* =====================================================
       BILL ROWS
    ===================================================== */

    const billsRes = await client.query(
      `
      SELECT
        invoice_number AS invoice,
        created_at AS date,
        COALESCE(subtotal,0) AS subtotal,
        COALESCE(subtotal,0) - COALESCE(grand_total,0) AS discount,
        grand_total AS total,
        payment_method AS payment

      FROM bills

      WHERE company_id = $1
        AND deleted = false
        AND payment_method != 'Credit'
        AND payment_status != 'PENDING'
        AND created_at BETWEEN $2 AND $3

      ORDER BY created_at DESC
      `,
      [companyId, startDate, endDate]
    )



    /* =====================================================
       EXPENSE ROWS
    ===================================================== */

    const expenseRowsRes = await client.query(
      `
      SELECT
        e.expense_date AS date,
        ec.name AS category,
        e.payment_mode AS mode,
        e.note,
        e.total_amount AS amount
      FROM expenses e
      JOIN expense_categories ec
        ON ec.id=e.expense_category_id
      WHERE e.company_id=$1
        AND e.expense_date BETWEEN $2 AND $3
      ORDER BY e.expense_date DESC
      `,
      [companyId, startDate, endDate]
    )

    const expenseRows = expenseRowsRes.rows.map(r => ({
      ...r,
      amount: Number(r.amount)
    }))



    /* =====================================================
       EXPENSE BY CATEGORY
    ===================================================== */

    const expenseByCategory: Record<string, number> = {}

    expenseRows.forEach(e => {
      expenseByCategory[e.category] =
        (expenseByCategory[e.category] || 0) +
        Number(e.amount)
    })

        /* =====================================================
       EXCEL WORKBOOK
    ===================================================== */

    const workbook = new ExcelJS.Workbook()

    workbook.creator = 'Financial System'
    workbook.created = new Date()



    /* =====================================================
       SUMMARY SHEET
    ===================================================== */

    const summarySheet = workbook.addWorksheet('Summary')

    summarySheet.addRow(['Store Financial Summary'])
    summarySheet.addRow([
      `From: ${startDate.toLocaleDateString()}  To: ${endDate.toLocaleDateString()}`
    ])
    summarySheet.addRow([])



    /* ---------- OPENING / CLOSING ---------- */

    summarySheet.addRow([
      'Type',
      'Opening Balance',
      'Closing Balance'
    ])

    summarySheet.addRow([
      'Cash',
      openingCash,
      closingCash
    ])

    summarySheet.addRow([
      'Bank',
      openingBank,
      closingBank
    ])

    summarySheet.addRow([
      'Total',
      openingCash + openingBank,
      closingTotal
    ])



    /* =====================================================
       SALES SHEET
    ===================================================== */

    const salesSheet = workbook.addWorksheet('Sales')

    salesSheet.addRow(['Type', 'Amount'])

    salesSheet.addRow(['Total Sales', sales.total_sales])
    salesSheet.addRow(['Cash', sales.cash])
    salesSheet.addRow(['UPI', sales.upi])
    salesSheet.addRow(['Card', sales.card])



    /* =====================================================
       EXPENSE SHEET
    ===================================================== */

    const expenseSheet = workbook.addWorksheet('Expenses')

    expenseSheet.addRow(['Type', 'Amount'])

    expenseSheet.addRow(['Total Expense', expenses.total_expense])
    expenseSheet.addRow(['Cash', expenses.cash])
    expenseSheet.addRow(['UPI', expenses.upi])
    expenseSheet.addRow(['Card', expenses.card])
    expenseSheet.addRow(['Bank', expenses.bank])
    expenseSheet.addRow(['Cheque', expenses.cheque])



    /* =====================================================
       PURCHASE SHEET
    ===================================================== */

    const purchaseSheet = workbook.addWorksheet('Purchases')

    purchaseSheet.addRow(['Type', 'Amount'])

    purchaseSheet.addRow(['Total Purchase', purchase.total_purchase])
    purchaseSheet.addRow(['Cash', purchase.cash])
    purchaseSheet.addRow(['UPI', purchase.upi])
    purchaseSheet.addRow(['Card', purchase.card])
    purchaseSheet.addRow(['Bank', purchase.bank])
    purchaseSheet.addRow(['Cheque', purchase.cheque])



    /* =====================================================
       TRANSFERS SHEET
    ===================================================== */

    const transferSheet = workbook.addWorksheet('Transfers')

    transferSheet.addRow([
      'Account',
      'Debit',
      'Credit',
      'Net'
    ])

    transferSheet.addRow([
      'Cash',
      transfers.cash_debit,
      transfers.cash_credit,
      transferCashNet
    ])

    transferSheet.addRow([
      'Bank',
      transfers.bank_debit,
      transfers.bank_credit,
      transferBankNet
    ])



    /* =====================================================
       TRANSACTIONS SHEET
    ===================================================== */

    const txnSheet = workbook.addWorksheet('Transactions')

    txnSheet.addRow([
      'Account',
      'Debit',
      'Credit',
      'Net'
    ])

    txnSheet.addRow([
      'Cash',
      transactions.cash_debit,
      transactions.cash_credit,
      transactionCashNet
    ])

    txnSheet.addRow([
      'Bank',
      transactions.bank_debit,
      transactions.bank_credit,
      transactionBankNet
    ])



    /* =====================================================
       BILLS SHEET
    ===================================================== */

    const billsSheet = workbook.addWorksheet('Bills')

    billsSheet.addRow([
      'Invoice',
      'Date',
      'Subtotal',
      'Discount',
      'Total',
      'Payment'
    ])

    billsRes.rows.forEach(b => {
      billsSheet.addRow([
        b.invoice,
        new Date(b.date).toLocaleDateString(),
        b.subtotal,
        b.discount,
        b.total,
        b.payment
      ])
    })



    /* =====================================================
       EXPENSE DETAILS SHEET
    ===================================================== */

    const expenseDetailSheet =
      workbook.addWorksheet('Expense Details')

    expenseDetailSheet.addRow([
      'Date',
      'Category',
      'Mode',
      'Note',
      'Amount'
    ])

    expenseRows.forEach(e => {
      expenseDetailSheet.addRow([
        new Date(e.date).toLocaleDateString(),
        e.category,
        e.mode,
        e.note ?? '-',
        e.amount
      ])
    })



    /* =====================================================
       EXPENSE CATEGORY SHEET
    ===================================================== */

    const expCatSheet =
      workbook.addWorksheet('Expense by Category')

    expCatSheet.addRow(['Category', 'Amount'])

    Object.entries(expenseByCategory).forEach(
      ([category, amount]) => {
        expCatSheet.addRow([category, amount])
      }
    )



    /* =====================================================
       AUTO COLUMN WIDTH
    ===================================================== */

    workbook.worksheets.forEach(sheet => {
      sheet.columns.forEach(column => {
        column.width = 18
      })
    })



    /* =====================================================
       BUFFER OUTPUT
    ===================================================== */

    const buffer = await workbook.xlsx.writeBuffer()



    /* =====================================================
       DOWNLOAD HEADERS
    ===================================================== */

    setHeader(
      event,
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

    setHeader(
      event,
      'Content-Disposition',
      'attachment; filename="summary.xlsx"'
    )

    return Buffer.from(buffer)
} finally {
  client.release()
}
})