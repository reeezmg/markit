import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { pool } from '~/server/db'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

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
       SALES (PERIOD)
    ===================================================== */
    const salesRes = await client.query(
  `
  SELECT
    /* TOTAL SALES (Exclude Credit + Split Credit) */
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

    /* CASH */
    COALESCE(SUM(
      CASE WHEN b.payment_method = 'Cash'
      THEN b.grand_total ELSE 0 END
    ),0)
    +
    COALESCE(SUM(
      CASE WHEN sp.method = 'Cash'
      THEN sp.amount ELSE 0 END
    ),0) AS cash,

    /* UPI */
    COALESCE(SUM(
      CASE WHEN b.payment_method = 'UPI'
      THEN b.grand_total ELSE 0 END
    ),0)
    +
    COALESCE(SUM(
      CASE WHEN sp.method = 'UPI'
      THEN sp.amount ELSE 0 END
    ),0) AS upi,

    /* CARD */
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

  /* SPLIT PAYMENTS PARSE */
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
       PURCHASE (DISTRIBUTOR)
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

    /* EXCLUDE CREDIT BILLS */
    AND payment_method != 'Credit'

    /* EXCLUDE PENDING BILLS */
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
       PDF GENERATION
    ===================================================== */

    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const MARGIN = 14
    let y = MARGIN



    /* ---------- TITLE ---------- */

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text('Store Summary', MARGIN, y)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    y += 7

    doc.text(
      `From: ${startDate.toLocaleDateString()}  To: ${endDate.toLocaleDateString()}`,
      MARGIN,
      y
    )

    y += 5
    doc.text(
      `Generated: ${new Date().toLocaleString()}`,
      MARGIN,
      y
    )

    y += 10



    /* =====================================================
       OPENING / CLOSING BALANCE
    ===================================================== */

    doc.setFontSize(13)
    doc.text('Opening & Closing Balance', MARGIN, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Type', 'Opening', 'Closing']],
      body: [
        ['Cash', rs(openingCash), rs(closingCash)],
        ['Bank', rs(openingBank), rs(closingBank)],
        [
          'Total',
          rs(openingCash + openingBank),
          rs(closingTotal)
        ]
      ],
      theme: 'grid'
    })

    y = doc.lastAutoTable.finalY + 8



    /* =====================================================
       SALES
    ===================================================== */

    doc.text('Sales Breakdown', MARGIN, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Type', 'Amount']],
      body: [
        ['Total Sales', rs(sales.total_sales)],
        ['Cash', rs(sales.cash)],
        ['UPI', rs(sales.upi)],
        ['Card', rs(sales.card)],
        ['Credit', rs(sales.credit)]
      ],
      theme: 'grid'
    })

    y = doc.lastAutoTable.finalY + 8



    /* =====================================================
       EXPENSES
    ===================================================== */

    doc.text('Expense Breakdown', MARGIN, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Type', 'Amount']],
      body: [
        ['Total Expense', rs(expenses.total_expense)],
        ['Cash', rs(expenses.cash)],
        ['UPI', rs(expenses.upi)],
        ['Card', rs(expenses.card)],
        ['Bank', rs(expenses.bank)],
        ['Cheque', rs(expenses.cheque)]
      ],
      theme: 'grid'
    })

    y = doc.lastAutoTable.finalY + 8



    /* =====================================================
       PURCHASE
    ===================================================== */

    doc.text('Distributor Purchase', MARGIN, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Type', 'Amount']],
      body: [
        ['Total Purchase', rs(purchase.total_purchase)],
        ['Cash', rs(purchase.cash)],
        ['UPI', rs(purchase.upi)],
        ['Card', rs(purchase.card)],
        ['Bank', rs(purchase.bank)],
        ['Cheque', rs(purchase.cheque)]
      ],
      theme: 'grid'
    })

    y = doc.lastAutoTable.finalY + 8



    /* =====================================================
       TRANSFERS
    ===================================================== */

    doc.text('Account Transfers', MARGIN, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Account', 'Debit', 'Credit', 'Net']],
      body: [
        [
          'Cash',
          rs(transfers.cash_debit),
          rs(transfers.cash_credit),
          rs(transferCashNet)
        ],
        [
          'Bank',
          rs(transfers.bank_debit),
          rs(transfers.bank_credit),
          rs(transferBankNet)
        ]
      ],
      theme: 'grid'
    })

    y = doc.lastAutoTable.finalY + 8



    /* =====================================================
       TRANSACTIONS
    ===================================================== */

    doc.text('Money Transactions', MARGIN, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Account', 'Debit', 'Credit', 'Net']],
      body: [
        [
          'Cash',
          rs(transactions.cash_debit),
          rs(transactions.cash_credit),
          rs(transactionCashNet)
        ],
        [
          'Bank',
          rs(transactions.bank_debit),
          rs(transactions.bank_credit),
          rs(transactionBankNet)
        ]
      ],
      theme: 'grid'
    })

    y = doc.lastAutoTable.finalY + 8



    /* =====================================================
       BILLS TABLE
    ===================================================== */

    doc.text('Bills', MARGIN, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Invoice', 'Date', 'Subtotal', 'Discount', 'Total', 'Payment']],
      body: billsRes.rows.length
        ? billsRes.rows.map(b => [
            b.invoice,
            new Date(b.date).toLocaleDateString(),
            rs(b.subtotal),
            rs(b.discount),
            rs(b.total),
            b.payment
          ])
        : [['—', '—', '—', '—', '—', 'No data']],
      styles: { fontSize: 8 },
      theme: 'grid'
    })

    y = doc.lastAutoTable.finalY + 8



    /* =====================================================
       EXPENSE ROWS
    ===================================================== */

    doc.text('Expense Details', MARGIN, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Category', 'Mode', 'Note', 'Amount']],
      body: expenseRows.length
        ? expenseRows.map(e => [
            new Date(e.date).toLocaleDateString(),
            e.category,
            e.mode,
            e.note ?? '-',
            rs(e.amount)
          ])
        : [['—', '—', '—', '—', 'No data']],
      styles: { fontSize: 8 },
      theme: 'grid'
    })

    y = doc.lastAutoTable.finalY + 8



    /* =====================================================
       EXPENSE BY CATEGORY
    ===================================================== */

    doc.text('Expense by Category', MARGIN, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Category', 'Amount']],
      body: Object.entries(expenseByCategory).map(([c, a]) => [
        c,
        rs(a)
      ]),
      theme: 'grid'
    })



    /* =====================================================
       PDF OUTPUT
    ===================================================== */

    const pdf = Buffer.from(doc.output('arraybuffer'))

    setHeader(event, 'Content-Type', 'application/pdf')
    setHeader(
      event,
      'Content-Disposition',
      `attachment; filename="summary.pdf"`
    )

    return pdf

  } finally {
    client.release()
  }
})



/* =====================================================
   RUPEE FORMATTER
===================================================== */

function rs(v: number) {
  return `Rs ${Number(v || 0).toFixed(2)}`
}
