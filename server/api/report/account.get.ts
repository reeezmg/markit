import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data.companyId

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const client = await pool.connect()

  try {
    /* =================================================
       OPENING BALANCES
    ================================================== */
    const companyRes = await client.query(
      `
      SELECT cash, bank
      FROM companies
      WHERE id = $1
      `,
      [companyId]
    )

    const cashOpening = Number(companyRes.rows[0]?.cash || 0)
    const bankOpening = Number(companyRes.rows[0]?.bank || 0)

    let cash = cashOpening
    let bank = bankOpening

    /* =================================================
       SALES
    ================================================== */
    const salesRes = await client.query(
      `
      SELECT
        COALESCE(
          SUM(CASE WHEN b.payment_method != 'Split' THEN b.grand_total ELSE 0 END),
          0
        ) + COALESCE(SUM(sp.amount), 0) AS total_sales,

        COALESCE(
          SUM(CASE WHEN b.payment_method = 'Cash' THEN b.grand_total ELSE 0 END),
          0
        ) + COALESCE(
          SUM(CASE WHEN sp.method = 'Cash' THEN sp.amount ELSE 0 END),
          0
        ) AS cash_sales,

        COALESCE(
          SUM(CASE WHEN b.payment_method IN ('UPI','Card') THEN b.grand_total ELSE 0 END),
          0
        ) + COALESCE(
          SUM(CASE WHEN sp.method IN ('UPI','Card') THEN sp.amount ELSE 0 END),
          0
        ) AS bank_sales
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
        AND b.payment_status IN ('PAID','PENDING')
        AND b.is_markit = false
      `,
      [companyId]
    )

    const totalSales = Number(salesRes.rows[0].total_sales)
    const cashSales = Number(salesRes.rows[0].cash_sales)
    const bankSales = Number(salesRes.rows[0].bank_sales)

    cash += cashSales
    bank += bankSales

    /* =================================================
       EXPENSES
    ================================================== */
    const expenseRes = await client.query(
      `
      SELECT
        COALESCE(SUM(total_amount), 0) AS total,
        COALESCE(
          SUM(CASE WHEN payment_mode = 'BANK' THEN total_amount ELSE 0 END),
          0
        ) AS bank_expense
      FROM expenses
      WHERE company_id = $1
        AND UPPER(status) = 'PAID'
      `,
      [companyId]
    )

    const totalExpenses = Number(expenseRes.rows[0].total)
    const bankExpenses = Number(expenseRes.rows[0].bank_expense)
    const cashExpenses = totalExpenses - bankExpenses

    cash -= cashExpenses
    bank -= bankExpenses

    /* =================================================
       MONEY TRANSACTIONS (PRIMARY BANK ONLY)
    ================================================== */
    let cashReceived = 0
    let cashGiven = 0
    let bankReceived = 0
    let bankGiven = 0

    const mtRes = await client.query(
      `
      SELECT direction, payment_mode, SUM(amount) AS total
      FROM money_transactions
      WHERE company_id = $1
        AND status = 'PAID'
        AND (
          payment_mode = 'CASH'
          OR (payment_mode = 'BANK' AND account_id IS NULL)
        )
      GROUP BY direction, payment_mode
      `,
      [companyId]
    )

    for (const r of mtRes.rows) {
      const amt = Number(r.total)
      if (r.payment_mode === 'CASH') {
        r.direction === 'RECEIVED' ? (cashReceived += amt) : (cashGiven += amt)
      } else {
        r.direction === 'RECEIVED' ? (bankReceived += amt) : (bankGiven += amt)
      }
    }

    cash += cashReceived - cashGiven
    bank += bankReceived - bankGiven

    /* =================================================
       INVESTMENTS
    ================================================== */
    const invRes = await client.query(
      `
      SELECT direction, SUM(amount) AS total
      FROM investments
      WHERE company_id = $1
        AND status = 'COMPLETED'
      GROUP BY direction
      `,
      [companyId]
    )

    let investmentBalance = 0
    for (const r of invRes.rows) {
      const amt = Number(r.total)
      investmentBalance += r.direction === 'IN' ? amt : -amt
    }

    /* =================================================
       ACCOUNT TRANSFERS (PRIMARY BANK ONLY)
    ================================================== */
    let cashTransfersIn = 0
    let cashTransfersOut = 0
    let bankTransfersIn = 0
    let bankTransfersOut = 0
    let investmentTransfersOut = 0

    const transferRes = await client.query(
      `
      SELECT
        from_type,
        from_account_id,
        to_type,
        to_account_id,
        SUM(amount) AS total
      FROM account_transfers
      WHERE company_id = $1
      GROUP BY from_type, from_account_id, to_type, to_account_id
      `,
      [companyId]
    )

    for (const r of transferRes.rows) {
      const amt = Number(r.total)

      if (r.from_type === 'CASH') {
        cashTransfersOut += amt
      }

      if (r.to_type === 'CASH') {
        cashTransfersIn += amt
      }

      if (r.from_type === 'BANK' && r.from_account_id === null) {
        bankTransfersOut += amt
      }

      if (r.to_type === 'BANK' && r.to_account_id === null) {
        bankTransfersIn += amt
      }

      if (r.from_type === 'INVESTMENT') {
        investmentTransfersOut += amt
      }
    }

    cash += cashTransfersIn - cashTransfersOut
    bank += bankTransfersIn - bankTransfersOut
    investmentBalance -= investmentTransfersOut

    /* =================================================
       PROFIT & LOSS
    ================================================== */
    const netProfit = totalSales - totalExpenses

     /* =================================================
       CHART DATA
    ================================================== */
    const cashFlowChart = [
      { name: 'Opening Balance', value: cashOpening },
      { name: 'Sales', value: cashSales },
      { name: 'Money Received', value: cashReceived },
      { name: 'Expenses', value: -cashExpenses },
      { name: 'Money Given', value: -cashGiven },
      { name: 'Transfers', value: cashTransfersIn - cashTransfersOut }
    ]

    const bankFlowChart = [
      { name: 'Opening Balance', value: bankOpening },
      { name: 'Sales', value: bankSales },
      { name: 'Money Received', value: bankReceived },
      { name: 'Expenses', value: -bankExpenses },
      { name: 'Money Given', value: -bankGiven },
      { name: 'Transfers', value: bankTransfersIn - bankTransfersOut }
    ]

    const pnlPieChart = [
      { name: 'Expenses', value: totalExpenses },
      { name: 'Net Profit', value: netProfit }
    ]

    /* =================================================
       RESPONSE
    ================================================== */
    return {
      balances: {
        cash,
        bank,
        investment: investmentBalance,
      },

      breakdown: {
        cash: {
          openingBalance: cashOpening,
          sales: cashSales,
          expenses: cashExpenses,
          moneyReceived: cashReceived,
          moneyGiven: cashGiven,
          transfersIn: cashTransfersIn,
          transfersOut: cashTransfersOut,
          closingBalance: cash,
        },
        bank: {
          openingBalance: bankOpening,
          sales: bankSales,
          expenses: bankExpenses,
          moneyReceived: bankReceived,
          moneyGiven: bankGiven,
          transfersIn: bankTransfersIn,
          transfersOut: bankTransfersOut,
          closingBalance: bank,
        },
      },

      pnl: {
        sales: totalSales,
        expenses: totalExpenses,
        netProfit,
      },
      charts: {
              cashFlow: cashFlowChart.filter(i => i.value !== 0),
              bankFlow: bankFlowChart.filter(i => i.value !== 0),
              pnlPie: pnlPieChart
            }
    }
  } finally {
    client.release()
  }
})
