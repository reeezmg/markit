import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data.companyId

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
const rawStart = query.startDate as string | undefined
const rawEnd = query.endDate as string | undefined

    console.log('Profit Report - Start Date:', rawStart)
console.log('Profit Report - End Date:', rawEnd)

if (rawStart && isNaN(Date.parse(rawStart))) {
  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid startDate'
  })
}

if (rawEnd && isNaN(Date.parse(rawEnd))) {
  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid endDate'
  })
}

const startDate = rawStart ? new Date(rawStart) : new Date(0)
const endDate = rawEnd ? new Date(rawEnd) : new Date()


    console.log('Profit Report - Start Date:', startDate)
console.log('Profit Report - End Date:', endDate)
  const client = await pool.connect()

  try {
    /* -------------------------------------------------
       ENTRY DATA (RATE + VALUE + COGS SAFE)
    -------------------------------------------------- */
    const { rows } = await client.query(
      `
      WITH entry_calc AS (
        SELECT
          b.id              AS bill_id,
          b.created_at      AS bill_date,
          b.invoice_number,
          b.grand_total     AS bill_sales,

          e.id              AS entry_id,
          e.name            AS entry_name,
          e.qty,
          e.rate,                 -- ✅ FIX: include rate
          e.value,

          COALESCE(
            v.p_price,
            e.rate * (1 - (COALESCE(c.margin, 100) / 100.0))
          )                 AS cost_price,

          e.return          AS is_return

        FROM entries e
        INNER JOIN bills b ON e.bill_id = b.id
        LEFT JOIN variants v ON e.variant_id = v.id
        LEFT JOIN categories c ON e.category_id = c.id

        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.is_markit = false
          AND b.payment_status = 'PAID'
          AND b.created_at BETWEEN $2 AND $3
      )

      SELECT
        *,
        CASE
          WHEN is_return = true THEN
            -ABS(cost_price * qty)
          ELSE
            (cost_price * qty)
        END AS entry_cogs,

        CASE
          WHEN is_return = true THEN
            -ABS(value - (cost_price * qty))
          ELSE
            (value - (cost_price * qty))
        END AS entry_profit

      FROM entry_calc
      ORDER BY bill_date DESC;
      `,
      [companyId, startDate, endDate]
    )

    /* -------------------------------------------------
       EXPENSES
    -------------------------------------------------- */
    const expenseRes = await client.query(
      `
      SELECT COALESCE(SUM(total_amount), 0) AS total_expenses
      FROM expenses
      WHERE company_id = $1
        AND expense_date BETWEEN $2 AND $3;
      `,
      [companyId, startDate, endDate]
    )

    const totalExpenses = Number(expenseRes.rows[0].total_expenses)

    /* -------------------------------------------------
       TRANSFORM → BILL + ENTRY
    -------------------------------------------------- */
    const billMap = new Map<string, any>()

    for (const r of rows) {
      if (!billMap.has(r.bill_id)) {
        billMap.set(r.bill_id, {
          billId: r.bill_id,
          billDate: r.bill_date,
          invoiceNumber: r.invoice_number,
          billSales: Number(r.bill_sales), // ✅ FIX: always grand_total
          billCOGS: 0,
          billProfit: 0,
          marginPercent: 0,
          entries: []
        })
      }

      const bill = billMap.get(r.bill_id)

      const entryCOGS = Number(r.entry_cogs)
      const entryValue = Number(r.value)
      const entryProfit = Number(r.entry_profit)

      bill.billCOGS += entryCOGS

      bill.entries.push({
        slNo: bill.entries.length + 1,
        name: r.entry_name,
        qty: Number(r.qty),
        rate: Number(r.rate),          // ✅ FIX: rate now present
        value: entryValue,
        cogs: entryCOGS,
        profit: entryProfit,
        marginPercent:
          entryValue > 0 ? (entryProfit / entryValue) * 100 : 0
      })
    }

    /* -------------------------------------------------
       FINAL BILL + SUMMARY
    -------------------------------------------------- */
    let totalSales = 0
    let totalCOGS = 0

    const bills = Array.from(billMap.values()).map((b) => {
      b.billProfit = b.billSales - b.billCOGS
      b.marginPercent =
        b.billSales > 0 ? (b.billProfit / b.billSales) * 100 : 0

      totalSales += b.billSales
      totalCOGS += b.billCOGS

      return b
    })

    const totalProfit = totalSales - totalCOGS

    /* -------------------------------------------------
       RESPONSE
    -------------------------------------------------- */
    return {
      summary: {
        totalSales,                     // ✅ correct now
        totalCOGS,
        totalProfitBeforeExpense: totalProfit,
        totalExpenses,
        netProfit: totalProfit - totalExpenses,
        overallMarginPercent:
          totalSales > 0 ? (totalProfit / totalSales) * 100 : 0
      },
      bills
    }
  } finally {
    client.release()
  }
})
