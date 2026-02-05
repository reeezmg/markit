import { defineEventHandler, createError, getQuery } from 'h3'
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
    /* =================================================
       OPENING BALANCES (DATE FILTERED)
    ================================================== */

    const companyRes = await client.query(
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

    const c = companyRes.rows[0] || {}

    /* ---------- CASH OPENING ---------- */
    let cashOpening = 0

    if (
      c.cash &&
      c.opening_cash_date &&
      new Date(c.opening_cash_date) <= from
    ) {
      cashOpening = Number(c.cash)
    }

    /* ---------- BANK OPENING ---------- */
    let bankOpening = 0

    if (
      c.bank &&
      c.opening_bank_date &&
      new Date(c.opening_bank_date) <= from
    ) {
      bankOpening = Number(c.bank)
    }

    let cash = cashOpening
    let bank = bankOpening

    /* =================================================
       SALES (DATE FILTERED)
    ================================================== */

    const salesRes = await client.query(
      `
      SELECT
        COALESCE(
          SUM(CASE 
            WHEN b.payment_method NOT IN ('Split','Credit') 
            THEN b.grand_total ELSE 0 END
          ),0
        )
        +
        COALESCE(SUM(
          CASE 
            WHEN sp.method != 'Credit'
            THEN sp.amount ELSE 0 END
        ),0) AS total_sales,

        COALESCE(
          SUM(CASE 
            WHEN b.payment_method = 'Cash'
            THEN b.grand_total ELSE 0 END
          ),0
        )
        +
        COALESCE(SUM(
          CASE 
            WHEN sp.method = 'Cash'
            THEN sp.amount ELSE 0 END
        ),0) AS cash_sales,

        COALESCE(
          SUM(CASE 
            WHEN b.payment_method IN ('UPI','Card')
            THEN b.grand_total ELSE 0 END
          ),0
        )
        +
        COALESCE(SUM(
          CASE 
            WHEN sp.method IN ('UPI','Card')
            THEN sp.amount ELSE 0 END
        ),0) AS bank_sales

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
        AND b.created_at BETWEEN $2 AND $3
      `,
      [companyId, from, to]
    )

    const totalSales = Number(salesRes.rows[0].total_sales || 0)
    const cashSales = Number(salesRes.rows[0].cash_sales || 0)
    const bankSales = Number(salesRes.rows[0].bank_sales || 0)

    cash += cashSales
    bank += bankSales

    /* =================================================
       EXPENSES (DATE FILTERED)
    ================================================== */

    const expenseRes = await client.query(
      `
      SELECT
        COALESCE(SUM(total_amount),0) AS total,

        COALESCE(SUM(
          CASE 
            WHEN payment_mode = 'CASH'
            THEN total_amount ELSE 0 END
        ),0) AS cash_expense,

        COALESCE(SUM(
          CASE 
            WHEN payment_mode = 'BANK'
            THEN total_amount ELSE 0 END
        ),0) AS bank_expense

      FROM expenses
      WHERE company_id = $1
        AND UPPER(status) = 'PAID'
        AND expense_date BETWEEN $2 AND $3
      `,
      [companyId, from, to]
    )

    const totalExpenses = Number(expenseRes.rows[0].total || 0)
    const cashExpenses = Number(expenseRes.rows[0].cash_expense || 0)
    const bankExpenses = Number(expenseRes.rows[0].bank_expense || 0)

    cash -= cashExpenses
    bank -= bankExpenses

    /* =================================================
       DISTRIBUTOR PAYMENTS (NEW — DATE FILTERED)
    ================================================== */

    let distributorCash = 0
    let distributorBank = 0

    const dpRes = await client.query(
      `
      SELECT
        payment_type,
        SUM(amount) AS total
      FROM distributor_payments
      WHERE company_id = $1
        AND created_at BETWEEN $2 AND $3
      GROUP BY payment_type
      `,
      [companyId, from, to]
    )

    for (const r of dpRes.rows) {
      const amt = Number(r.total || 0)

      if (r.payment_type === 'CASH') {
        distributorCash += amt
      } else {
        distributorBank += amt
      }
    }

    cash -= distributorCash
    bank -= distributorBank
    /* =================================================
       MONEY TRANSACTIONS (DATE FILTERED)
    ================================================== */

    let cashReceived = 0
    let cashGiven = 0
    let bankReceived = 0
    let bankGiven = 0

    const mtRes = await client.query(
      `
      SELECT 
        direction,
        payment_mode,
        SUM(amount) AS total
      FROM money_transactions
      WHERE company_id = $1
        AND status = 'PAID'
        AND created_at BETWEEN $2 AND $3
        AND (
          payment_mode = 'CASH'
          OR (payment_mode = 'BANK' AND account_id IS NULL)
        )
      GROUP BY direction, payment_mode
      `,
      [companyId, from, to]
    )

    for (const r of mtRes.rows) {
      const amt = Number(r.total || 0)

      if (r.payment_mode === 'CASH') {
        r.direction === 'RECEIVED'
          ? (cashReceived += amt)
          : (cashGiven += amt)
      } else {
        r.direction === 'RECEIVED'
          ? (bankReceived += amt)
          : (bankGiven += amt)
      }
    }

    cash += cashReceived - cashGiven
    bank += bankReceived - bankGiven

    /* =================================================
   TOTAL DISTRIBUTOR PAYMENTS
================================================== */
const totalDistributorPaymentsRes = await client.query(
  `
  SELECT
    COALESCE(SUM(amount), 0) AS total
  FROM distributor_payments
  WHERE company_id = $1
    AND created_at BETWEEN $2 AND $3
  `,
  [companyId, from, to]
)

const totalDistributorPayments =
  Number(totalDistributorPaymentsRes.rows[0].total || 0)

    /* =================================================
       INVESTMENTS (DATE FILTERED)
    ================================================== */

    const invRes = await client.query(
      `
      SELECT direction, SUM(amount) AS total
      FROM investments
      WHERE company_id = $1
        AND status = 'COMPLETED'
        AND created_at BETWEEN $2 AND $3
      GROUP BY direction
      `,
      [companyId, from, to]
    )

    let investmentBalance = 0

    for (const r of invRes.rows) {
      const amt = Number(r.total || 0)
      investmentBalance += r.direction === 'IN' ? amt : -amt
    }

    /* =================================================
       ACCOUNT TRANSFERS (PRIMARY BANK ONLY — DATE FILTERED)
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
        AND created_at BETWEEN $2 AND $3
      GROUP BY 
        from_type,
        from_account_id,
        to_type,
        to_account_id
      `,
      [companyId, from, to]
    )

    for (const r of transferRes.rows) {
      const amt = Number(r.total || 0)

      /* ---------- CASH ---------- */
      if (r.from_type === 'CASH') {
        cashTransfersOut += amt
      }

      if (r.to_type === 'CASH') {
        cashTransfersIn += amt
      }

      /* ---------- PRIMARY BANK ---------- */
      if (r.from_type === 'BANK' && r.from_account_id === null) {
        bankTransfersOut += amt
      }

      if (r.to_type === 'BANK' && r.to_account_id === null) {
        bankTransfersIn += amt
      }

      /* ---------- INVESTMENT ---------- */
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
      { name: 'Distributor Payments', value: -distributorCash },
      { name: 'Money Given', value: -cashGiven },
      { name: 'Transfers', value: cashTransfersIn - cashTransfersOut }
    ]

    const bankFlowChart = [
      { name: 'Opening Balance', value: bankOpening },
      { name: 'Sales', value: bankSales },
      { name: 'Money Received', value: bankReceived },
      { name: 'Expenses', value: -bankExpenses },
      { name: 'Distributor Payments', value: -distributorBank },
      { name: 'Money Given', value: -bankGiven },
      { name: 'Transfers', value: bankTransfersIn - bankTransfersOut }
    ]

    const pnlPieChart = [
      { name: 'Expenses', value: totalExpenses },
      { name: 'Net Profit', value: netProfit }
    ]

    /* =================================================
       FINAL RESPONSE
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
          distributorPayments: distributorCash,
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
          distributorPayments: distributorBank,
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
        totalDistributorPayments,
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
