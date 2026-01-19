import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { pool } from '~/server/db'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data.companyId

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const startDate = query.startDate
    ? new Date(JSON.parse(query.startDate as string))
    : new Date(0)

  const endDate = query.endDate
    ? new Date(JSON.parse(query.endDate as string))
    : new Date()

  const client = await pool.connect()

  try {
    /* ================= SALES ================= */
    const salesRes = await client.query(
      `
      SELECT
        COALESCE(SUM(b.grand_total),0) AS total_sales,
        COALESCE(SUM(CASE WHEN b.payment_method='Cash' THEN b.grand_total ELSE 0 END),0) AS cash_sales,
        COALESCE(SUM(CASE WHEN b.payment_method='UPI' THEN b.grand_total ELSE 0 END),0) AS upi_sales,
        COALESCE(SUM(CASE WHEN b.payment_method='Card' THEN b.grand_total ELSE 0 END),0) AS card_sales,
        COALESCE(SUM(CASE WHEN b.payment_method='Credit' THEN b.grand_total ELSE 0 END),0) AS credit_sales,
        COUNT(*) AS total_bills
      FROM bills b
      WHERE b.company_id=$1
        AND b.deleted=false
        AND b.created_at BETWEEN $2 AND $3
      `,
      [companyId, startDate, endDate]
    )

    const sales = salesRes.rows[0]

    /* ================= EXPENSES ================= */
    const expenseRes = await client.query(
      `
      SELECT
        e.expense_date AS date,
        ec.name AS category,
        e.payment_mode AS mode,
        e.note,
        e.total_amount AS amount
      FROM expenses e
      JOIN expense_categories ec ON ec.id = e.expense_category_id
      WHERE e.company_id=$1
        AND e.expense_date BETWEEN $2 AND $3
      ORDER BY e.expense_date DESC
      `,
      [companyId, startDate, endDate]
    )

    const expenses = expenseRes.rows.map(e => ({
      ...e,
      amount: Number(e.amount),
      mode: (e.mode || '').toUpperCase()
    }))

    const expenseByCategory: Record<string, number> = {}
    expenses.forEach(e => {
      expenseByCategory[e.category] =
        (expenseByCategory[e.category] || 0) + e.amount
    })

    const cashBalance =
      Number(sales.cash_sales) -
      expenses.filter(e => e.mode === 'CASH').reduce((s, e) => s + e.amount, 0)

    const bankBalance =
      (Number(sales.upi_sales) + Number(sales.card_sales)) -
      expenses
        .filter(e => ['UPI', 'CARD', 'BANK', 'CHEQUE'].includes(e.mode))
        .reduce((s, e) => s + e.amount, 0)

    const totalBalance = cashBalance + bankBalance

    /* ================= BILLS ================= */
    const billsRes = await client.query(
      `
      SELECT
        b.invoice_number AS invoice,
        b.created_at AS date,
        COALESCE(b.subtotal,0) AS subtotal,
        COALESCE(b.subtotal,0) - COALESCE(b.grand_total,0) AS discount,
        COALESCE(b.grand_total,0) AS total,
        b.payment_method AS payment
      FROM bills b
      WHERE b.company_id=$1
        AND b.deleted=false
        AND b.created_at BETWEEN $2 AND $3
      ORDER BY b.created_at DESC
      `,
      [companyId, startDate, endDate]
    )

    /* ================= PDF ================= */
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const MARGIN = 14
    let y = MARGIN

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text('Sales Report', MARGIN, y)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    y += 7
    doc.text(`Generated on: ${new Date().toLocaleString()}`, MARGIN, y)
    y += 12

    /* ---------- METRICS ---------- */
    doc.setFontSize(13)
    doc.text('Sales Metrics', MARGIN, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Amount']],
      body: [
        ['Total Sales', rs(sales.total_sales)],
        ['Total Bills', sales.total_bills],
        ['Cash Sales', rs(sales.cash_sales)],
        ['UPI Sales', rs(sales.upi_sales)],
        ['Card Sales', rs(sales.card_sales)],
        ['Credit Sales', rs(sales.credit_sales)]
      ],
      theme: 'grid'
    })

    y = doc.lastAutoTable.finalY + 10

    /* ---------- BALANCES ---------- */
    doc.setFontSize(13)
    doc.text('Balance Summary', MARGIN, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Type', 'Amount']],
      body: [
        ['Cash Balance', rs(cashBalance)],
        ['Bank Balance', rs(bankBalance)],
        ['Total Balance', rs(totalBalance)]
      ],
      theme: 'grid'
    })

    y = doc.lastAutoTable.finalY + 10

    /* ---------- BILLS ---------- */
    doc.setFontSize(13)
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
      theme: 'grid',
      styles: { fontSize: 8 }
    })

    y = doc.lastAutoTable.finalY + 10

    /* ---------- EXPENSES ---------- */
    doc.setFontSize(13)
    doc.text('Expenses', MARGIN, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Category', 'Mode', 'Note', 'Amount']],
      body: expenses.length
        ? expenses.map(e => [
            new Date(e.date).toLocaleDateString(),
            e.category,
            e.mode,
            e.note ?? '-',
            rs(e.amount)
          ])
        : [['—', '—', '—', '—', 'No data']],
      theme: 'grid',
      styles: { fontSize: 8 }
    })

    y = doc.lastAutoTable.finalY + 10

    /* ---------- EXPENSE BY CATEGORY ---------- */
    doc.setFontSize(13)
    doc.text('Expense by Category', MARGIN, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Category', 'Amount']],
      body: Object.keys(expenseByCategory).length
        ? Object.entries(expenseByCategory).map(([c, a]) => [c, rs(a)])
        : [['No data', rs(0)]],
      theme: 'grid'
    })

    const pdf = Buffer.from(doc.output('arraybuffer'))

    setHeader(event, 'Content-Type', 'application/pdf')
    setHeader(
      event,
      'Content-Disposition',
      'attachment; filename="sales-report.pdf"'
    )

    return pdf
  } finally {
    client.release()
  }
})

function rs(v: number) {
  return `Rs ${Number(v).toFixed(2)}`
}
