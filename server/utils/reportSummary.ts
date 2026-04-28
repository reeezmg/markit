import { createError } from 'h3'
import { pool } from '~/server/db'

export type SummaryWindow = {
  from: string
  to: string
}

export type SummaryResponse = {
  window: SummaryWindow
  sales: {
    total: number
    discount: number
    tax: number
    byPaymentMethod: {
      Cash: number
      UPI: number
      Card: number
      Credit: number
      Split: {
        Cash: number
        UPI: number
        Card: number
        Credit: number
      }
    }
    topCategories: Array<{
      name: string
      qty: number
      sales: number
      share: number
    }>
  }
  pendingCreditBills: Array<{
    billId: string
    invoiceNumber: number | null
    createdAt: string
    clientName: string | null
    clientPhone: string | null
    grandTotal: number
  }>
  expenses: {
    total: number
    byPaymentMode: {
      CASH: number
      UPI: number
      CARD: number
      BANK: number
      CHEQUE: number
    }
    byCategory: Array<{
      name: string
      total: number
      share: number
    }>
  }
  profit: {
    totalSales: number
    totalCOGS: number
    netProfitBeforeExpense: number
    totalExpenses: number
    netProfit: number
    marginPct: number
  }
  investments: {
    in: number
    out: number
    net: number
  }
  distributors: {
    weOwe: Array<{
      distributorId: string
      name: string
      due: number
    }>
    owedToUs: Array<{
      distributorId: string
      name: string
      due: number
    }>
    totalWeOwe: number
    totalOwedToUs: number
  }
  stock: {
    atMrp: number
    atCost: number
    skuCount: number
    totalUnits: number
  }
  balances: {
    cash: {
      opening: number
      closing: number
      delta: number
    }
    bank: {
      opening: number
      closing: number
      delta: number
    }
    total: {
      opening: number
      closing: number
      delta: number
    }
  }
  moneyTransactions: {
    in: {
      total: number
      byParty: Record<string, number>
    }
    out: {
      total: number
      byParty: Record<string, number>
    }
    net: number
  }
  timeSeries: Array<{
    date: string
    sales: number
    expenses: number
    profit: number
  }>
  forecast: Array<{
    date: string
    projectedProfit: number
  }>
  cashFlow: {
    inflows: {
      sales: number
      moneyReceived: number
      investmentsIn: number
      total: number
    }
    outflows: {
      expenses: number
      distributorPayments: number
      moneyGiven: number
      investmentsOut: number
      total: number
    }
    netChange: number
  }
}

type GatherSummaryInput = {
  companyId: string
  from?: string | Date | null
  to?: string | Date | null
  cleanup?: boolean
}

type SummaryContext = {
  companyId: string
  from: Date
  to: Date
  cleanup: boolean
}

type DailyPoint = {
  date: string
  sales: number
  expenses: number
  cogs: number
}

const PARTY_TYPES = ['CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OWNER', 'OTHER'] as const

export function normalizeSummaryWindow(from?: string | Date | null, to?: string | Date | null) {
  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)

  const normalizedFrom = from ? new Date(from) : defaultFrom
  const normalizedTo = to ? new Date(to) : now

  if (Number.isNaN(normalizedFrom.getTime()) || Number.isNaN(normalizedTo.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid date range' })
  }

  if (normalizedFrom > normalizedTo) {
    throw createError({ statusCode: 400, statusMessage: '`from` must be before `to`' })
  }

  return {
    from: normalizedFrom,
    to: normalizedTo,
  }
}

export async function gatherSummary(input: GatherSummaryInput): Promise<SummaryResponse> {
  const window = normalizeSummaryWindow(input.from, input.to)
  const context: SummaryContext = {
    companyId: input.companyId,
    from: window.from,
    to: window.to,
    cleanup: input.cleanup ?? false,
  }

  const [
    sales,
    pendingCreditBills,
    expenses,
    profit,
    investments,
    distributors,
    stock,
    balances,
    moneyTransactions,
    timeSeries,
    distributorPaymentTotal,
  ] = await Promise.all([
    fetchSales(context),
    fetchPendingCreditBills(context),
    fetchExpenses(context),
    fetchProfit(context),
    fetchInvestments(context),
    fetchDistributorDues(context),
    fetchStock(context),
    fetchBalances(context),
    fetchMoneyTransactions(context),
    fetchTimeSeries(context),
    fetchDistributorPaymentTotal(context),
  ])

  const forecast = buildForecast(timeSeries)

  const inflowsTotal = sales.total + moneyTransactions.in.total + investments.in
  const outflowsTotal =
    expenses.total + distributorPaymentTotal + moneyTransactions.out.total + investments.out

  const cashFlow: SummaryResponse['cashFlow'] = {
    inflows: {
      sales: sales.total,
      moneyReceived: moneyTransactions.in.total,
      investmentsIn: investments.in,
      total: inflowsTotal,
    },
    outflows: {
      expenses: expenses.total,
      distributorPayments: distributorPaymentTotal,
      moneyGiven: moneyTransactions.out.total,
      investmentsOut: investments.out,
      total: outflowsTotal,
    },
    netChange: balances.total.delta,
  }

  return {
    window: {
      from: context.from.toISOString(),
      to: context.to.toISOString(),
    },
    sales,
    pendingCreditBills,
    expenses,
    profit,
    investments,
    distributors,
    stock,
    balances,
    moneyTransactions,
    timeSeries,
    forecast,
    cashFlow,
  }
}

async function fetchDistributorPaymentTotal(context: SummaryContext): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM distributor_payments
     WHERE company_id = $1
       AND created_at BETWEEN $2 AND $3`,
    [context.companyId, context.from, context.to]
  )
  return toNumber(result.rows[0]?.total)
}

async function fetchSales(context: SummaryContext): Promise<SummaryResponse['sales']> {
  const [totalsRes, categoriesRes] = await Promise.all([
    pool.query(
      `
      WITH split_rows AS (
        SELECT
          (elem->>'method') AS method,
          COALESCE((elem->>'amount')::numeric, 0) AS amount
        FROM bills b
        JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(b.split_payments::jsonb) = 'array'
            THEN b.split_payments::jsonb
            ELSE '[]'::jsonb
          END
        ) elem ON b.payment_method = 'Split'
        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.is_markit = false
          AND b.payment_status IN ('PAID', 'PENDING')
          AND b.created_at BETWEEN $2 AND $3
          AND ($4 = true OR b.precedence IS NOT TRUE)
      )
      SELECT
        (
          SELECT COALESCE(SUM(b.grand_total), 0)
          FROM bills b
          WHERE b.company_id = $1
            AND b.deleted = false
            AND b.is_markit = false
            AND b.payment_status IN ('PAID', 'PENDING')
            AND b.created_at BETWEEN $2 AND $3
            AND ($4 = true OR b.precedence IS NOT TRUE)
        ) AS total_sales,
        (
          SELECT COALESCE(SUM(e.discount), 0)
          FROM entries e
          JOIN bills b ON b.id = e.bill_id
          WHERE b.company_id = $1
            AND b.deleted = false
            AND b.is_markit = false
            AND b.payment_status IN ('PAID', 'PENDING')
            AND b.created_at BETWEEN $2 AND $3
            AND ($4 = true OR b.precedence IS NOT TRUE)
        ) AS total_discount,
        (
          SELECT COALESCE(SUM((COALESCE(e.tax, 0) * COALESCE(e.value, 0)) / 100.0), 0)
          FROM entries e
          JOIN bills b ON b.id = e.bill_id
          WHERE b.company_id = $1
            AND b.deleted = false
            AND b.is_markit = false
            AND b.payment_status IN ('PAID', 'PENDING')
            AND b.created_at BETWEEN $2 AND $3
            AND ($4 = true OR b.precedence IS NOT TRUE)
        ) AS total_tax,
        (
          SELECT COALESCE(SUM(grand_total), 0)
          FROM bills b
          WHERE b.company_id = $1
            AND b.deleted = false
            AND b.is_markit = false
            AND b.payment_status IN ('PAID', 'PENDING')
            AND b.payment_method = 'Cash'
            AND b.created_at BETWEEN $2 AND $3
            AND ($4 = true OR b.precedence IS NOT TRUE)
        ) AS cash_direct,
        (
          SELECT COALESCE(SUM(grand_total), 0)
          FROM bills b
          WHERE b.company_id = $1
            AND b.deleted = false
            AND b.is_markit = false
            AND b.payment_status IN ('PAID', 'PENDING')
            AND b.payment_method = 'UPI'
            AND b.created_at BETWEEN $2 AND $3
            AND ($4 = true OR b.precedence IS NOT TRUE)
        ) AS upi_direct,
        (
          SELECT COALESCE(SUM(grand_total), 0)
          FROM bills b
          WHERE b.company_id = $1
            AND b.deleted = false
            AND b.is_markit = false
            AND b.payment_status IN ('PAID', 'PENDING')
            AND b.payment_method = 'Card'
            AND b.created_at BETWEEN $2 AND $3
            AND ($4 = true OR b.precedence IS NOT TRUE)
        ) AS card_direct,
        (
          SELECT COALESCE(SUM(grand_total), 0)
          FROM bills b
          WHERE b.company_id = $1
            AND b.deleted = false
            AND b.is_markit = false
            AND b.payment_status IN ('PAID', 'PENDING')
            AND b.payment_method = 'Credit'
            AND b.created_at BETWEEN $2 AND $3
            AND ($4 = true OR b.precedence IS NOT TRUE)
        ) AS credit_direct,
        COALESCE(SUM(CASE WHEN split_rows.method = 'Cash' THEN split_rows.amount ELSE 0 END), 0) AS split_cash,
        COALESCE(SUM(CASE WHEN split_rows.method = 'UPI' THEN split_rows.amount ELSE 0 END), 0) AS split_upi,
        COALESCE(SUM(CASE WHEN split_rows.method = 'Card' THEN split_rows.amount ELSE 0 END), 0) AS split_card,
        COALESCE(SUM(CASE WHEN split_rows.method = 'Credit' THEN split_rows.amount ELSE 0 END), 0) AS split_credit
      FROM split_rows
      `,
      [context.companyId, context.from, context.to, context.cleanup]
    ),
    pool.query(
      `
      SELECT
        COALESCE(c.name, 'Uncategorized') AS name,
        COALESCE(SUM(e.qty), 0) AS qty,
        COALESCE(SUM(e.value), 0) AS sales
      FROM entries e
      JOIN bills b ON b.id = e.bill_id
      LEFT JOIN categories c ON c.id = e.category_id
      WHERE b.company_id = $1
        AND b.deleted = false
        AND b.is_markit = false
        AND b.payment_status IN ('PAID', 'PENDING')
        AND b.created_at BETWEEN $2 AND $3
        AND ($4 = true OR b.precedence IS NOT TRUE)
      GROUP BY c.name
      ORDER BY sales DESC
      LIMIT 5
      `,
      [context.companyId, context.from, context.to, context.cleanup]
    ),
  ])

  const totals = totalsRes.rows[0] || {}
  const topCategoryTotal = categoriesRes.rows.reduce((sum: number, row: any) => sum + Number(row.sales || 0), 0)

  return {
    total: toNumber(totals.total_sales),
    discount: toNumber(totals.total_discount),
    tax: toNumber(totals.total_tax),
    byPaymentMethod: {
      Cash: toNumber(totals.cash_direct) + toNumber(totals.split_cash),
      UPI: toNumber(totals.upi_direct) + toNumber(totals.split_upi),
      Card: toNumber(totals.card_direct) + toNumber(totals.split_card),
      Credit: toNumber(totals.credit_direct) + toNumber(totals.split_credit),
      Split: {
        Cash: toNumber(totals.split_cash),
        UPI: toNumber(totals.split_upi),
        Card: toNumber(totals.split_card),
        Credit: toNumber(totals.split_credit),
      },
    },
    topCategories: categoriesRes.rows.map((row: any) => ({
      name: row.name || 'Uncategorized',
      qty: toNumber(row.qty),
      sales: toNumber(row.sales),
      share: topCategoryTotal > 0 ? (toNumber(row.sales) / topCategoryTotal) * 100 : 0,
    })),
  }
}

async function fetchPendingCreditBills(context: SummaryContext): Promise<SummaryResponse['pendingCreditBills']> {
  const result = await pool.query(
    `
    SELECT
      b.id AS bill_id,
      b.invoice_number,
      b.created_at,
      cl.name AS client_name,
      cl.phone AS client_phone,
      b.grand_total
    FROM bills b
    LEFT JOIN clients cl ON cl.id = b.client_id
    WHERE b.company_id = $1
      AND b.deleted = false
      AND b.is_markit = false
      AND b.payment_method = 'Credit'
      AND b.payment_status = 'PENDING'
      AND b.created_at BETWEEN $2 AND $3
      AND ($4 = true OR b.precedence IS NOT TRUE)
    ORDER BY b.created_at DESC
    `,
    [context.companyId, context.from, context.to, context.cleanup]
  )

  return result.rows.map((row: any) => ({
    billId: row.bill_id,
    invoiceNumber: row.invoice_number == null ? null : Number(row.invoice_number),
    createdAt: new Date(row.created_at).toISOString(),
    clientName: row.client_name ?? null,
    clientPhone: row.client_phone ?? null,
    grandTotal: toNumber(row.grand_total),
  }))
}

async function fetchExpenses(context: SummaryContext): Promise<SummaryResponse['expenses']> {
  const [totalsRes, categoryRes] = await Promise.all([
    pool.query(
      `
      SELECT
        COALESCE(SUM(e.total_amount), 0) AS total,
        COALESCE(SUM(CASE WHEN e.payment_mode = 'CASH' THEN e.total_amount ELSE 0 END), 0) AS cash_total,
        COALESCE(SUM(CASE WHEN e.payment_mode = 'UPI' THEN e.total_amount ELSE 0 END), 0) AS upi_total,
        COALESCE(SUM(CASE WHEN e.payment_mode = 'CARD' THEN e.total_amount ELSE 0 END), 0) AS card_total,
        COALESCE(SUM(CASE WHEN e.payment_mode = 'BANK' THEN e.total_amount ELSE 0 END), 0) AS bank_total,
        COALESCE(SUM(CASE WHEN e.payment_mode = 'CHEQUE' THEN e.total_amount ELSE 0 END), 0) AS cheque_total
      FROM expenses e
      WHERE e.company_id = $1
        AND UPPER(e.status) = 'PAID'
        AND e.expense_date BETWEEN $2 AND $3
      `,
      [context.companyId, context.from, context.to]
    ),
    pool.query(
      `
      SELECT
        COALESCE(ec.name, 'Uncategorized') AS name,
        COALESCE(SUM(e.total_amount), 0) AS total
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
      WHERE e.company_id = $1
        AND UPPER(e.status) = 'PAID'
        AND e.expense_date BETWEEN $2 AND $3
      GROUP BY ec.name
      ORDER BY total DESC
      `,
      [context.companyId, context.from, context.to]
    ),
  ])

  const totals = totalsRes.rows[0] || {}
  const totalExpenses = toNumber(totals.total)

  return {
    total: totalExpenses,
    byPaymentMode: {
      CASH: toNumber(totals.cash_total),
      UPI: toNumber(totals.upi_total),
      CARD: toNumber(totals.card_total),
      BANK: toNumber(totals.bank_total),
      CHEQUE: toNumber(totals.cheque_total),
    },
    byCategory: categoryRes.rows.map((row: any) => ({
      name: row.name || 'Uncategorized',
      total: toNumber(row.total),
      share: totalExpenses > 0 ? (toNumber(row.total) / totalExpenses) * 100 : 0,
    })),
  }
}

async function fetchProfit(context: SummaryContext): Promise<SummaryResponse['profit']> {
  const [salesRes, cogsRes, expensesRes] = await Promise.all([
    pool.query(
      `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN b.payment_method NOT IN ('Split', 'Credit')
            THEN b.grand_total
            ELSE 0
          END
        ), 0)
        +
        COALESCE(SUM(
          CASE
            WHEN sp.method <> 'Credit'
            THEN sp.amount
            ELSE 0
          END
        ), 0) AS total_sales
      FROM bills b
      LEFT JOIN LATERAL (
        SELECT
          (elem->>'method') AS method,
          COALESCE((elem->>'amount')::numeric, 0) AS amount
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
        AND b.is_markit = false
        AND b.payment_status = 'PAID'
        AND b.created_at BETWEEN $2 AND $3
        AND ($4 = true OR b.precedence IS NOT TRUE)
      `,
      [context.companyId, context.from, context.to, context.cleanup]
    ),
    pool.query(
      `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN e.return = true THEN -ABS(COALESCE(v.p_price, e.rate * (1 - (COALESCE(c.margin, 100) / 100.0))) * e.qty)
            ELSE COALESCE(v.p_price, e.rate * (1 - (COALESCE(c.margin, 100) / 100.0))) * e.qty
          END
        ), 0) AS total_cogs
      FROM entries e
      JOIN bills b ON b.id = e.bill_id
      LEFT JOIN variants v ON v.id = e.variant_id
      LEFT JOIN categories c ON c.id = e.category_id
      WHERE b.company_id = $1
        AND b.deleted = false
        AND b.is_markit = false
        AND b.payment_status = 'PAID'
        AND b.created_at BETWEEN $2 AND $3
        AND ($4 = true OR b.precedence IS NOT TRUE)
      `,
      [context.companyId, context.from, context.to, context.cleanup]
    ),
    pool.query(
      `
      SELECT COALESCE(SUM(e.total_amount), 0) AS total_expenses
      FROM expenses e
      JOIN expense_categories ec ON ec.id = e.expense_category_id
      WHERE e.company_id = $1
        AND UPPER(e.status) = 'PAID'
        AND ec.name <> 'Purchase'
        AND e.expense_date BETWEEN $2 AND $3
      `,
      [context.companyId, context.from, context.to]
    ),
  ])

  const sales = toNumber(salesRes.rows[0]?.total_sales)
  const cogs = toNumber(cogsRes.rows[0]?.total_cogs)
  const totalExpenses = toNumber(expensesRes.rows[0]?.total_expenses)
  const gross = sales - cogs
  const net = gross - totalExpenses

  return {
    totalSales: sales,
    totalCOGS: cogs,
    netProfitBeforeExpense: gross,
    totalExpenses,
    netProfit: net,
    marginPct: sales > 0 ? (net / sales) * 100 : 0,
  }
}

async function fetchInvestments(context: SummaryContext): Promise<SummaryResponse['investments']> {
  const result = await pool.query(
    `
    SELECT direction, COALESCE(SUM(amount), 0) AS total
    FROM investments
    WHERE company_id = $1
      AND status = 'COMPLETED'
      AND created_at BETWEEN $2 AND $3
    GROUP BY direction
    `,
    [context.companyId, context.from, context.to]
  )

  let investmentIn = 0
  let investmentOut = 0

  for (const row of result.rows) {
    if (row.direction === 'IN') investmentIn += toNumber(row.total)
    if (row.direction === 'OUT') investmentOut += toNumber(row.total)
  }

  return {
    in: investmentIn,
    out: investmentOut,
    net: investmentIn - investmentOut,
  }
}

async function fetchDistributorDues(context: SummaryContext): Promise<SummaryResponse['distributors']> {
  const result = await pool.query(
    `
    SELECT
      dc.distributor_id,
      d.name,
      COALESCE(dc.opening_due, 0) +
      COALESCE(credits.total_credits, 0) -
      COALESCE(payments.total_payments, 0) AS due
    FROM distributor_companies dc
    JOIN distributors d ON d.id = dc.distributor_id
    LEFT JOIN LATERAL (
      SELECT SUM(amount) AS total_credits
      FROM distributor_credits
      WHERE company_id = dc.company_id
        AND distributor_id = dc.distributor_id
    ) credits ON true
    LEFT JOIN LATERAL (
      SELECT SUM(amount) AS total_payments
      FROM distributor_payments
      WHERE company_id = dc.company_id
        AND distributor_id = dc.distributor_id
    ) payments ON true
    WHERE dc.company_id = $1
    ORDER BY d.name ASC
    `,
    [context.companyId]
  )

  const weOwe: SummaryResponse['distributors']['weOwe'] = []
  const owedToUs: SummaryResponse['distributors']['owedToUs'] = []

  for (const row of result.rows) {
    const due = toNumber(row.due)
    if (Math.abs(due) < 0.005) continue

    if (due > 0) {
      weOwe.push({
        distributorId: row.distributor_id,
        name: row.name || 'Distributor',
        due,
      })
    } else {
      owedToUs.push({
        distributorId: row.distributor_id,
        name: row.name || 'Distributor',
        due: Math.abs(due),
      })
    }
  }

  return {
    weOwe,
    owedToUs,
    totalWeOwe: weOwe.reduce((sum, row) => sum + row.due, 0),
    totalOwedToUs: owedToUs.reduce((sum, row) => sum + row.due, 0),
  }
}

async function fetchStock(context: SummaryContext): Promise<SummaryResponse['stock']> {
  const result = await pool.query(
    `
    SELECT
      COALESCE(SUM(i.qty * COALESCE(v.s_price, 0)), 0) AS at_mrp,
      COALESCE(SUM(i.qty * COALESCE(v.p_price, 0)), 0) AS at_cost,
      COUNT(DISTINCT v.id) AS sku_count,
      COALESCE(SUM(i.qty), 0) AS total_units
    FROM items i
    JOIN variants v ON v.id = i.variant_id
    WHERE i.company_id = $1
    `,
    [context.companyId]
  )

  const row = result.rows[0] || {}

  return {
    atMrp: toNumber(row.at_mrp),
    atCost: toNumber(row.at_cost),
    skuCount: Number(row.sku_count || 0),
    totalUnits: toNumber(row.total_units),
  }
}

async function fetchBalances(context: SummaryContext): Promise<SummaryResponse['balances']> {
  const [companyRes, beforeRes, periodRes] = await Promise.all([
    pool.query(
      `
      SELECT cash, bank, opening_cash_date, opening_bank_date
      FROM companies
      WHERE id = $1
      `,
      [context.companyId]
    ),
    pool.query(
      `
      WITH cash_sales AS (
        SELECT
          COALESCE(SUM(
            CASE WHEN b.payment_method = 'Cash' THEN b.grand_total ELSE 0 END
          ), 0)
          +
          COALESCE(SUM(
            CASE WHEN sp.method = 'Cash' THEN sp.amount ELSE 0 END
          ), 0) AS total
        FROM bills b
        LEFT JOIN LATERAL (
          SELECT
            (elem->>'method') AS method,
            COALESCE((elem->>'amount')::numeric, 0) AS amount
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
          AND b.payment_status IN ('PAID', 'PENDING')
          AND b.is_markit = false
          AND b.created_at < $2
          AND ($3 = true OR b.precedence IS NOT TRUE)
      ),
      bank_sales AS (
        SELECT
          COALESCE(SUM(
            CASE WHEN b.payment_method IN ('UPI', 'Card') THEN b.grand_total ELSE 0 END
          ), 0)
          +
          COALESCE(SUM(
            CASE WHEN sp.method IN ('UPI', 'Card') THEN sp.amount ELSE 0 END
          ), 0) AS total
        FROM bills b
        LEFT JOIN LATERAL (
          SELECT
            (elem->>'method') AS method,
            COALESCE((elem->>'amount')::numeric, 0) AS amount
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
          AND b.payment_status IN ('PAID', 'PENDING')
          AND b.is_markit = false
          AND b.created_at < $2
          AND ($3 = true OR b.precedence IS NOT TRUE)
      ),
      cash_expenses AS (
        SELECT COALESCE(SUM(total_amount), 0) AS total
        FROM expenses
        WHERE company_id = $1
          AND payment_mode = 'CASH'
          AND UPPER(status) = 'PAID'
          AND expense_date < $2
      ),
      bank_expenses AS (
        SELECT COALESCE(SUM(total_amount), 0) AS total
        FROM expenses
        WHERE company_id = $1
          AND payment_mode IN ('UPI', 'CARD', 'BANK', 'CHEQUE')
          AND UPPER(status) = 'PAID'
          AND expense_date < $2
      ),
      cash_distributor AS (
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM distributor_payments
        WHERE company_id = $1
          AND payment_type = 'CASH'
          AND created_at < $2
      ),
      bank_distributor AS (
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM distributor_payments
        WHERE company_id = $1
          AND payment_type IN ('UPI', 'CARD', 'BANK', 'CHEQUE')
          AND created_at < $2
      ),
      cash_money AS (
        SELECT COALESCE(SUM(
          CASE WHEN direction = 'RECEIVED' THEN amount ELSE -amount END
        ), 0) AS total
        FROM money_transactions
        WHERE company_id = $1
          AND payment_mode = 'CASH'
          AND status = 'PAID'
          AND created_at < $2
      ),
      bank_money AS (
        SELECT COALESCE(SUM(
          CASE WHEN direction = 'RECEIVED' THEN amount ELSE -amount END
        ), 0) AS total
        FROM money_transactions
        WHERE company_id = $1
          AND payment_mode != 'CASH'
          AND status = 'PAID'
          AND (account_id IS NULL OR account_id = '')
          AND created_at < $2
      ),
      cash_transfer AS (
        SELECT
          COALESCE(SUM(CASE WHEN to_type = 'CASH' THEN amount ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN from_type = 'CASH' THEN amount ELSE 0 END), 0) AS total
        FROM account_transfers
        WHERE company_id = $1
          AND created_at < $2
      ),
      bank_transfer AS (
        SELECT
          COALESCE(SUM(
            CASE WHEN to_type != 'CASH' AND (to_account_id IS NULL OR to_account_id = '') THEN amount ELSE 0 END
          ), 0) -
          COALESCE(SUM(
            CASE WHEN from_type != 'CASH' AND (from_account_id IS NULL OR from_account_id = '') THEN amount ELSE 0 END
          ), 0) AS total
        FROM account_transfers
        WHERE company_id = $1
          AND created_at < $2
      )
      SELECT
        (SELECT total FROM cash_sales) AS cash_sales_before,
        (SELECT total FROM bank_sales) AS bank_sales_before,
        (SELECT total FROM cash_expenses) AS cash_expenses_before,
        (SELECT total FROM bank_expenses) AS bank_expenses_before,
        (SELECT total FROM cash_distributor) AS cash_distributor_before,
        (SELECT total FROM bank_distributor) AS bank_distributor_before,
        (SELECT total FROM cash_money) AS cash_money_before,
        (SELECT total FROM bank_money) AS bank_money_before,
        (SELECT total FROM cash_transfer) AS cash_transfer_before,
        (SELECT total FROM bank_transfer) AS bank_transfer_before
      `,
      [context.companyId, context.from, context.cleanup]
    ),
    pool.query(
      `
      WITH split_rows AS (
        SELECT
          (elem->>'method') AS method,
          COALESCE((elem->>'amount')::numeric, 0) AS amount
        FROM bills b
        JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(b.split_payments::jsonb) = 'array'
            THEN b.split_payments::jsonb
            ELSE '[]'::jsonb
          END
        ) elem ON b.payment_method = 'Split'
        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.payment_status IN ('PAID', 'PENDING')
          AND b.is_markit = false
          AND b.created_at BETWEEN $2 AND $3
          AND ($4 = true OR b.precedence IS NOT TRUE)
      ),
      sales AS (
        SELECT
          (
            SELECT COALESCE(SUM(grand_total), 0)
            FROM bills b
            WHERE b.company_id = $1
              AND b.deleted = false
              AND b.payment_status IN ('PAID', 'PENDING')
              AND b.is_markit = false
              AND b.payment_method = 'Cash'
              AND b.created_at BETWEEN $2 AND $3
              AND ($4 = true OR b.precedence IS NOT TRUE)
          ) + COALESCE(SUM(CASE WHEN split_rows.method = 'Cash' THEN split_rows.amount ELSE 0 END), 0) AS cash_sales,
          (
            SELECT COALESCE(SUM(grand_total), 0)
            FROM bills b
            WHERE b.company_id = $1
              AND b.deleted = false
              AND b.payment_status IN ('PAID', 'PENDING')
              AND b.is_markit = false
              AND b.payment_method IN ('UPI', 'Card')
              AND b.created_at BETWEEN $2 AND $3
              AND ($4 = true OR b.precedence IS NOT TRUE)
          ) + COALESCE(SUM(CASE WHEN split_rows.method IN ('UPI', 'Card') THEN split_rows.amount ELSE 0 END), 0) AS bank_sales
        FROM split_rows
      ),
      expenses AS (
        SELECT
          COALESCE(SUM(CASE WHEN payment_mode = 'CASH' THEN total_amount ELSE 0 END), 0) AS cash_expenses,
          COALESCE(SUM(CASE WHEN payment_mode IN ('UPI', 'CARD', 'BANK', 'CHEQUE') THEN total_amount ELSE 0 END), 0) AS bank_expenses
        FROM expenses
        WHERE company_id = $1
          AND UPPER(status) = 'PAID'
          AND expense_date BETWEEN $2 AND $3
      ),
      distributor AS (
        SELECT
          COALESCE(SUM(CASE WHEN payment_type = 'CASH' THEN amount ELSE 0 END), 0) AS cash_distributor,
          COALESCE(SUM(CASE WHEN payment_type IN ('UPI', 'CARD', 'BANK', 'CHEQUE') THEN amount ELSE 0 END), 0) AS bank_distributor
        FROM distributor_payments
        WHERE company_id = $1
          AND created_at BETWEEN $2 AND $3
      ),
      money AS (
        SELECT
          COALESCE(SUM(
            CASE
              WHEN payment_mode = 'CASH' AND direction = 'RECEIVED' THEN amount
              WHEN payment_mode = 'CASH' AND direction = 'GIVEN' THEN -amount
              ELSE 0
            END
          ), 0) AS cash_money,
          COALESCE(SUM(
            CASE
              WHEN payment_mode != 'CASH' AND (account_id IS NULL OR account_id = '') AND direction = 'RECEIVED' THEN amount
              WHEN payment_mode != 'CASH' AND (account_id IS NULL OR account_id = '') AND direction = 'GIVEN' THEN -amount
              ELSE 0
            END
          ), 0) AS bank_money
        FROM money_transactions
        WHERE company_id = $1
          AND status = 'PAID'
          AND created_at BETWEEN $2 AND $3
      ),
      transfers AS (
        SELECT
          COALESCE(SUM(CASE WHEN to_type = 'CASH' THEN amount ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN from_type = 'CASH' THEN amount ELSE 0 END), 0) AS cash_transfer,
          COALESCE(SUM(CASE WHEN to_type != 'CASH' AND (to_account_id IS NULL OR to_account_id = '') THEN amount ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN from_type != 'CASH' AND (from_account_id IS NULL OR from_account_id = '') THEN amount ELSE 0 END), 0) AS bank_transfer
        FROM account_transfers
        WHERE company_id = $1
          AND created_at BETWEEN $2 AND $3
      )
      SELECT
        (SELECT cash_sales FROM sales) AS cash_sales,
        (SELECT bank_sales FROM sales) AS bank_sales,
        (SELECT cash_expenses FROM expenses) AS cash_expenses,
        (SELECT bank_expenses FROM expenses) AS bank_expenses,
        (SELECT cash_distributor FROM distributor) AS cash_distributor,
        (SELECT bank_distributor FROM distributor) AS bank_distributor,
        (SELECT cash_money FROM money) AS cash_money,
        (SELECT bank_money FROM money) AS bank_money,
        (SELECT cash_transfer FROM transfers) AS cash_transfer,
        (SELECT bank_transfer FROM transfers) AS bank_transfer
      `,
      [context.companyId, context.from, context.to, context.cleanup]
    ),
  ])

  const company = companyRes.rows[0] || {}
  const before = beforeRes.rows[0] || {}
  const period = periodRes.rows[0] || {}

  let cashOpening = 0
  let bankOpening = 0

  // Opening at start: only include the company opening if its date is on
  // or before the window's start. If it falls inside the window, the
  // opening event hasn't happened yet at `context.from`, so the opening
  // KPI must remain 0 — the injection below adds it to the closing.
  if (
    company.cash != null &&
    company.opening_cash_date &&
    new Date(company.opening_cash_date) <= context.from
  ) {
    cashOpening = toNumber(company.cash)
  }

  if (
    company.bank != null &&
    company.opening_bank_date &&
    new Date(company.opening_bank_date) <= context.from
  ) {
    bankOpening = toNumber(company.bank)
  }

  // Mid-window opening injection: if the opening date is strictly inside
  // (from, to], add it only to the closing — keeps opening = 0 at start
  // while making closing = opening + period + injection.
  let cashOpeningInjection = 0
  let bankOpeningInjection = 0

  if (
    company.cash != null &&
    company.opening_cash_date &&
    new Date(company.opening_cash_date) > context.from &&
    new Date(company.opening_cash_date) <= context.to
  ) {
    cashOpeningInjection = toNumber(company.cash)
  }

  if (
    company.bank != null &&
    company.opening_bank_date &&
    new Date(company.opening_bank_date) > context.from &&
    new Date(company.opening_bank_date) <= context.to
  ) {
    bankOpeningInjection = toNumber(company.bank)
  }

  cashOpening +=
    toNumber(before.cash_sales_before) -
    toNumber(before.cash_expenses_before) -
    toNumber(before.cash_distributor_before) +
    toNumber(before.cash_money_before) +
    toNumber(before.cash_transfer_before)

  bankOpening +=
    toNumber(before.bank_sales_before) -
    toNumber(before.bank_expenses_before) -
    toNumber(before.bank_distributor_before) +
    toNumber(before.bank_money_before) +
    toNumber(before.bank_transfer_before)

  const cashClosing =
    cashOpening +
    cashOpeningInjection +
    toNumber(period.cash_sales) -
    toNumber(period.cash_expenses) -
    toNumber(period.cash_distributor) +
    toNumber(period.cash_money) +
    toNumber(period.cash_transfer)

  const bankClosing =
    bankOpening +
    bankOpeningInjection +
    toNumber(period.bank_sales) -
    toNumber(period.bank_expenses) -
    toNumber(period.bank_distributor) +
    toNumber(period.bank_money) +
    toNumber(period.bank_transfer)

  return {
    cash: {
      opening: cashOpening,
      closing: cashClosing,
      delta: cashClosing - cashOpening,
    },
    bank: {
      opening: bankOpening,
      closing: bankClosing,
      delta: bankClosing - bankOpening,
    },
    total: {
      opening: cashOpening + bankOpening,
      closing: cashClosing + bankClosing,
      delta: (cashClosing + bankClosing) - (cashOpening + bankOpening),
    },
  }
}

async function fetchMoneyTransactions(context: SummaryContext): Promise<SummaryResponse['moneyTransactions']> {
  const result = await pool.query(
    `
    SELECT direction, party_type, COALESCE(SUM(amount), 0) AS total
    FROM money_transactions
    WHERE company_id = $1
      AND status = 'PAID'
      AND created_at BETWEEN $2 AND $3
    GROUP BY direction, party_type
    `,
    [context.companyId, context.from, context.to]
  )

  const byPartyIn = Object.fromEntries(PARTY_TYPES.map((party) => [party, 0])) as Record<string, number>
  const byPartyOut = Object.fromEntries(PARTY_TYPES.map((party) => [party, 0])) as Record<string, number>

  for (const row of result.rows) {
    const party = String(row.party_type || 'OTHER')
    const amount = toNumber(row.total)

    if (!(party in byPartyIn)) {
      byPartyIn[party] = 0
      byPartyOut[party] = 0
    }

    if (row.direction === 'RECEIVED') byPartyIn[party] += amount
    if (row.direction === 'GIVEN') byPartyOut[party] += amount
  }

  const totalIn = Object.values(byPartyIn).reduce((sum, value) => sum + value, 0)
  const totalOut = Object.values(byPartyOut).reduce((sum, value) => sum + value, 0)

  return {
    in: {
      total: totalIn,
      byParty: byPartyIn,
    },
    out: {
      total: totalOut,
      byParty: byPartyOut,
    },
    net: totalIn - totalOut,
  }
}

async function fetchTimeSeries(context: SummaryContext): Promise<SummaryResponse['timeSeries']> {
  const [salesRes, expensesRes, cogsRes] = await Promise.all([
    pool.query(
      `
      SELECT
        DATE_TRUNC('day', b.created_at)::date AS day,
        COALESCE(SUM(b.grand_total), 0) AS sales
      FROM bills b
      WHERE b.company_id = $1
        AND b.deleted = false
        AND b.is_markit = false
        AND b.payment_status IN ('PAID', 'PENDING')
        AND b.created_at BETWEEN $2 AND $3
        AND ($4 = true OR b.precedence IS NOT TRUE)
      GROUP BY day
      ORDER BY day ASC
      `,
      [context.companyId, context.from, context.to, context.cleanup]
    ),
    pool.query(
      `
      SELECT
        DATE_TRUNC('day', expense_date)::date AS day,
        COALESCE(SUM(total_amount), 0) AS expenses
      FROM expenses
      WHERE company_id = $1
        AND UPPER(status) = 'PAID'
        AND expense_date BETWEEN $2 AND $3
      GROUP BY day
      ORDER BY day ASC
      `,
      [context.companyId, context.from, context.to]
    ),
    pool.query(
      `
      SELECT
        DATE_TRUNC('day', b.created_at)::date AS day,
        COALESCE(SUM(
          CASE
            WHEN e.return = true THEN -ABS(COALESCE(v.p_price, e.rate * (1 - (COALESCE(c.margin, 100) / 100.0))) * e.qty)
            ELSE COALESCE(v.p_price, e.rate * (1 - (COALESCE(c.margin, 100) / 100.0))) * e.qty
          END
        ), 0) AS cogs
      FROM entries e
      JOIN bills b ON b.id = e.bill_id
      LEFT JOIN variants v ON v.id = e.variant_id
      LEFT JOIN categories c ON c.id = e.category_id
      WHERE b.company_id = $1
        AND b.deleted = false
        AND b.is_markit = false
        AND b.payment_status = 'PAID'
        AND b.created_at BETWEEN $2 AND $3
        AND ($4 = true OR b.precedence IS NOT TRUE)
      GROUP BY day
      ORDER BY day ASC
      `,
      [context.companyId, context.from, context.to, context.cleanup]
    ),
  ])

  const dateMap = new Map<string, DailyPoint>()
  const daysInWindow = Math.max(1, Math.ceil((context.to.getTime() - context.from.getTime()) / 86400000) + 1)

  for (let cursor = startOfDay(context.from); cursor <= context.to; cursor = addDays(cursor, 1)) {
    const key = formatDay(cursor)
    dateMap.set(key, {
      date: key,
      sales: 0,
      expenses: 0,
      cogs: 0,
    })
  }

  for (const row of salesRes.rows) {
    const key = formatDay(new Date(row.day))
    const current = dateMap.get(key)
    if (current) current.sales = toNumber(row.sales)
  }

  for (const row of expensesRes.rows) {
    const key = formatDay(new Date(row.day))
    const current = dateMap.get(key)
    if (current) current.expenses = toNumber(row.expenses)
  }

  for (const row of cogsRes.rows) {
    const key = formatDay(new Date(row.day))
    const current = dateMap.get(key)
    if (current) current.cogs = toNumber(row.cogs)
  }

  const points = Array.from(dateMap.values()).map((row) => ({
    date: row.date,
    sales: row.sales,
    expenses: row.expenses,
    profit: row.sales - row.cogs - row.expenses,
  }))

  return daysInWindow > 90 ? bucketWeekly(points) : points
}

function bucketWeekly(points: Array<{ date: string; sales: number; expenses: number; profit: number }>) {
  const buckets = new Map<string, { date: string; sales: number; expenses: number; profit: number }>()

  for (const point of points) {
    const key = startOfWeekLabel(new Date(point.date))
    if (!buckets.has(key)) {
      buckets.set(key, { date: key, sales: 0, expenses: 0, profit: 0 })
    }

    const bucket = buckets.get(key)!
    bucket.sales += point.sales
    bucket.expenses += point.expenses
    bucket.profit += point.profit
  }

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function buildForecast(points: Array<{ date: string; profit: number }>) {
  if (!points.length) return []

  const lastPointDate = new Date(points[points.length - 1].date)
  const stepDays = points.length > 1
    ? Math.max(
        1,
        Math.round(
          (new Date(points[points.length - 1].date).getTime() - new Date(points[points.length - 2].date).getTime()) / 86400000
        )
      )
    : 1
  const forecastPoints = Math.max(1, Math.ceil(30 / stepDays))
  const y = points.map((point) => point.profit)
  const x = points.map((_, index) => index)

  const xMean = x.reduce((sum, value) => sum + value, 0) / x.length
  const yMean = y.reduce((sum, value) => sum + value, 0) / y.length

  let numerator = 0
  let denominator = 0

  for (let index = 0; index < x.length; index += 1) {
    numerator += (x[index] - xMean) * (y[index] - yMean)
    denominator += (x[index] - xMean) ** 2
  }

  const slope = denominator === 0 ? 0 : numerator / denominator
  const intercept = yMean - slope * xMean

  return Array.from({ length: forecastPoints }, (_, index) => {
    const forecastIndex = x.length + index
    const projectedProfit = intercept + slope * forecastIndex
    return {
      date: formatDay(addDays(lastPointDate, (index + 1) * stepDays)),
      projectedProfit,
    }
  })
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfWeekLabel(date: Date) {
  const copy = new Date(date)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  return formatDay(copy)
}

function formatDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toNumber(value: unknown) {
  return Number(value || 0)
}
