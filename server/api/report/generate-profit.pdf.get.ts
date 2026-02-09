import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { pool } from '~/server/db'
import { jsPDF } from 'jspdf'

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
       SALES (NO CREDIT / NO SPLIT CREDIT)
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
        ),0) AS total_sales

      FROM bills b

      LEFT JOIN LATERAL (
        SELECT
          (elem->>'method') AS method,
          (elem->>'amount')::numeric AS amount
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(b.split_payments::jsonb)='array'
            THEN b.split_payments::jsonb
            ELSE '[]'::jsonb
          END
        ) elem
      ) sp ON b.payment_method='Split'

      WHERE b.company_id=$1
        AND b.deleted=false
        AND b.is_markit=false
        AND b.created_at BETWEEN $2 AND $3
      `,
      [companyId, startDate, endDate]
    )

    const totalSales = Number(
      salesRes.rows[0].total_sales || 0
    )


    /* =====================================================
       COGS (FIXED RETURN COLUMN)
    ===================================================== */

    const cogsRes = await client.query(
      `
      WITH entry_calc AS (
        SELECT
          e.qty,
          e.rate,
          e.value,
          e.return,

          COALESCE(
            v.p_price,
            e.rate * (1 - (COALESCE(c.margin,100)/100.0))
          ) AS cost_price

        FROM entries e
        INNER JOIN bills b ON e.bill_id=b.id
        LEFT JOIN variants v ON e.variant_id=v.id
        LEFT JOIN categories c ON e.category_id=c.id

        WHERE b.company_id=$1
          AND b.deleted=false
          AND b.is_markit=false
          AND b.payment_status='PAID'
          AND b.created_at BETWEEN $2 AND $3
      )

      SELECT
        COALESCE(SUM(
          CASE
            WHEN entry_calc.return=true
              THEN -ABS(cost_price*qty)
            ELSE cost_price*qty
          END
        ),0) AS total_cogs
      FROM entry_calc
      `,
      [companyId, startDate, endDate]
    )

    const totalCOGS = Number(
      cogsRes.rows[0].total_cogs || 0
    )

    const totalProfit = totalSales - totalCOGS


    /* =====================================================
       EXPENSES
    ===================================================== */

    const expenseRes = await client.query(
      `
      SELECT COALESCE(SUM(e.total_amount),0) AS total_expense
      FROM expenses e
      JOIN expense_categories ec
        ON ec.id=e.expense_category_id
      WHERE e.company_id=$1
        AND ec.name<>'Purchase'
        AND e.expense_date BETWEEN $2 AND $3
      `,
      [companyId, startDate, endDate]
    )

    const totalExpense = Number(
      expenseRes.rows[0].total_expense || 0
    )

    const netProfit = totalProfit - totalExpense


    /* =====================================================
       PDF
    ===================================================== */

    const doc = new jsPDF({ unit: 'mm', format: 'a4' })

    const MARGIN = 20
    let y = 25

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text('Profit Summary Report', MARGIN, y)

    y += 10

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')

    doc.text(
      `From: ${startDate.toLocaleDateString()}  To: ${endDate.toLocaleDateString()}`,
      MARGIN,
      y
    )

    y += 15

    const lines = [
      ['Total Sales', totalSales],
      ['Total COGS', totalCOGS],
      ['Profit', totalProfit],
      ['Total Expense', totalExpense],
      ['Net Profit', netProfit]
    ]

    doc.setFontSize(13)

    lines.forEach(([label, value]) => {

      doc.setFont('helvetica', 'bold')
      doc.text(label as string, MARGIN, y)

      doc.setFont('helvetica', 'normal')
      doc.text(
        rs(value as number),
        190 - MARGIN,
        y,
        { align: 'right' }
      )

      y += 10
    })

    const pdf = Buffer.from(doc.output('arraybuffer'))

    setHeader(event, 'Content-Type', 'application/pdf')
    setHeader(
      event,
      'Content-Disposition',
      `attachment; filename="profit-summary.pdf"`
    )

    return pdf

  } finally {
    client.release()
  }
})


function rs(v: number) {
  return `Rs ${Number(v || 0).toFixed(2)}`
}
