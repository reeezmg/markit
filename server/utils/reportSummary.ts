import { billCreditSql } from './report-bill-sales';
type ReportRows = { rows: any[] };
import { reportSections } from './report-query';
import { outwardTaxReport } from './report-gst-source';
import { accountingReport, accountingMoneyActivity, reportNumber } from './report-accounting';
import { createError } from 'h3';
import { pool } from '~/server/db';

export type SummaryWindow = {
  from: string;
  to: string;
};

export type SummaryResponse = {
  financial: Awaited<ReturnType<typeof accountingReport>>;
  window: SummaryWindow;
  sales: {
    total: number;
    discount: number;
    tax: number;
    byPaymentMethod: {
      Cash: number;
      UPI: number;
      Card: number;
      Credit: number;
      Split: {
        Cash: number;
        UPI: number;
        Card: number;
        Credit: number;
      };
    };
    topCategories: Array<{
      name: string;
      qty: number;
      sales: number;
      share: number;
    }>;
  };
  pendingCreditBills: Array<{
    billId: string;
    invoiceNumber: number | null;
    createdAt: string;
    clientName: string | null;
    clientPhone: string | null;
    grandTotal: number;
  }>;
  expenses: {
    total: number;
    byPaymentMode: {
      CASH: number;
      UPI: number;
      CARD: number;
      BANK: number;
      CHEQUE: number;
    };
    byCategory: Array<{
      name: string;
      total: number;
      share: number;
    }>;
  };
  profit: {
    totalSales: number;
    totalCOGS: number;
    netProfitBeforeExpense: number;
    totalExpenses: number;
    netProfit: number;
    marginPct: number;
  };
  investments: {
    in: number;
    out: number;
    net: number;
  };
  distributors: {
    weOwe: Array<{
      distributorId: string;
      name: string;
      due: number;
    }>;
    owedToUs: Array<{
      distributorId: string;
      name: string;
      due: number;
    }>;
    totalWeOwe: number;
    totalOwedToUs: number;
  };
  stock: {
    atMrp: number;
    atCost: number;
    skuCount: number;
    totalUnits: number;
  };
  balances: {
    cash: {
      opening: number;
      closing: number;
      delta: number;
    };
    bank: {
      opening: number;
      closing: number;
      delta: number;
    };
    total: {
      opening: number;
      closing: number;
      delta: number;
    };
  };
  moneyTransactions: {
    in: {
      total: number;
      byParty: Record<string, number>;
    };
    out: {
      total: number;
      byParty: Record<string, number>;
    };
    net: number;
  };
  timeSeries: Array<{
    date: string;
    sales: number;
    expenses: number;
    profit: number;
  }>;
  forecast: Array<{
    date: string;
    projectedProfit: number;
  }>;
  cashFlow: {
    inflows: {
      sales: number;
      moneyReceived: number;
      investmentsIn: number;
      total: number;
    };
    outflows: {
      expenses: number;
      distributorPayments: number;
      moneyGiven: number;
      investmentsOut: number;
      total: number;
    };
    netChange: number;
  };
};

type GatherSummaryInput = {
  companyId: string;
  from?: string | Date | null;
  to?: string | Date | null;
  cleanup?: boolean;
};

type SummaryContext = {
  companyId: string;
  from: Date;
  to: Date;
  cleanup: boolean;
};

type DailyPoint = {
  date: string;
  sales: number;
  expenses: number;
  cogs: number;
};

const PARTY_TYPES = ['CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OWNER', 'OTHER'] as const;

export function normalizeSummaryWindow(from?: string | Date | null, to?: string | Date | null) {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);

  const normalizedFrom = from ? new Date(from) : defaultFrom;
  const normalizedTo = to ? new Date(to) : now;

  if (Number.isNaN(normalizedFrom.getTime()) || Number.isNaN(normalizedTo.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid date range' });
  }

  if (normalizedFrom > normalizedTo) {
    throw createError({ statusCode: 400, statusMessage: '`from` must be before `to`' });
  }

  return {
    from: normalizedFrom,
    to: normalizedTo,
  };
}

export async function gatherSummary(input: GatherSummaryInput): Promise<SummaryResponse> {
  const window = normalizeSummaryWindow(input.from, input.to);
  const context: SummaryContext = {
    companyId: input.companyId,
    from: window.from,
    to: window.to,
    cleanup: input.cleanup ?? false,
  };

  const [
    [
      salesCategories,
      salesTotals,
      pendingBills,
      expenseCategories,
      expenseTotals,
      investmentRows,
      distributorRows,
      stockRows,
    ],
    { moneyTransactions },
    financial,
    outward,
  ] = await Promise.all([
    reportSections(
      pool,
      [
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
        `WITH bill_rows AS MATERIALIZED (
 SELECT b.id,b.grand_total,b.payment_method,b.split_payments
 FROM bills b WHERE b.company_id=$1 AND NOT b.deleted AND NOT b.is_markit
 AND b.payment_status IN ('PAID','PENDING') AND b.created_at BETWEEN $2 AND $3
 AND ($4 OR b.precedence IS NOT TRUE)
), split_rows AS (
 SELECT elem->>'method' AS method,COALESCE((elem->>'amount')::numeric,0) AS amount
 FROM bill_rows b CROSS JOIN LATERAL jsonb_array_elements(
 CASE WHEN jsonb_typeof(b.split_payments::jsonb)='array' THEN b.split_payments::jsonb ELSE '[]'::jsonb END) elem
 WHERE b.payment_method='Split'
), split_totals AS (
 SELECT COALESCE(SUM(amount) FILTER (WHERE method='Cash'),0) AS split_cash,
 COALESCE(SUM(amount) FILTER (WHERE method='UPI'),0) AS split_upi,
 COALESCE(SUM(amount) FILTER (WHERE method='Card'),0) AS split_card,
 COALESCE(SUM(amount) FILTER (WHERE method='Credit'),0) AS split_credit FROM split_rows
) SELECT COALESCE(SUM(b.grand_total),0) AS total_sales,
 (SELECT COALESCE(SUM(e.discount),0) FROM entries e JOIN bill_rows billed ON billed.id=e.bill_id) AS total_discount,
 COALESCE(SUM(b.grand_total) FILTER (WHERE b.payment_method='Cash'),0) AS cash_direct,
 COALESCE(SUM(b.grand_total) FILTER (WHERE b.payment_method='UPI'),0) AS upi_direct,
 COALESCE(SUM(b.grand_total) FILTER (WHERE b.payment_method='Card'),0) AS card_direct,
 COALESCE(SUM(b.grand_total) FILTER (WHERE b.payment_method='Credit'),0) AS credit_direct,
 (SELECT split_cash FROM split_totals) AS split_cash,(SELECT split_upi FROM split_totals) AS split_upi,
 (SELECT split_card FROM split_totals) AS split_card,(SELECT split_credit FROM split_totals) AS split_credit
 FROM bill_rows b`,
        `
    SELECT
      b.id AS bill_id,
      b.invoice_number,
      b.created_at,
      cl.name AS client_name,
      cl.phone AS client_phone,
      GREATEST(${billCreditSql()}-COALESCE((SELECT sum(p.amount) FROM payments p WHERE p.company_id=b.company_id AND p.bill_id=b.id AND p.status='POS_CREDIT_RECEIPT' AND p.deleted=false),0),0) AS grand_total
    FROM bills b
    LEFT JOIN clients cl ON cl.id = b.client_id
    WHERE b.company_id = $1
      AND b.deleted = false
      AND b.is_markit = false
      AND ${billCreditSql()} > 0
      AND b.payment_status = 'PENDING'
      AND b.created_at BETWEEN $2 AND $3
      AND ($4 = true OR b.precedence IS NOT TRUE)
    ORDER BY b.created_at DESC
    `,
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
        `
    SELECT direction, COALESCE(SUM(amount), 0) AS total
    FROM investments
    WHERE company_id = $1
      AND status = 'COMPLETED'
      AND created_at BETWEEN $2 AND $3
    GROUP BY direction
    `,
        `SELECT l.distributor_id,d.name,
   sum(CASE l.side WHEN 'CREDIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END) AS due
   FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
   JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id
   LEFT JOIN distributors d ON d.id=l.distributor_id
   WHERE j.company_id=$1 AND j.journal_date<=$3 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL
   AND a.account_type='ACCOUNTS_PAYABLE' AND l.distributor_id IS NOT NULL GROUP BY l.distributor_id,d.name ORDER BY d.name`,
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
      ],
      [context.companyId, context.from.toISOString(), context.to.toISOString(), context.cleanup]
    ),
    accountingMoneyActivity(pool, [context.companyId], context.from, context.to),
    accountingReport(pool, [context.companyId], context.from, context.to),
    outwardTaxReport(pool, context.companyId, context.from, context.to, context.cleanup),
  ]);
  const sales = summarizeSales(salesTotals, salesCategories),
    pendingCreditBills = summarizePendingCreditBills(pendingBills),
    expenses = summarizeExpenses(expenseTotals, expenseCategories),
    investments = summarizeInvestments(investmentRows),
    distributors = summarizeDistributorDues(distributorRows),
    stock = summarizeStock(stockRows);
  const profit = financial.pnl;
  const balances = financial.balances;
  // Include inactive days so trend/forecast samples represent calendar days.
  const activity = new Map<string, (typeof financial.timeSeries)[number]>(
    financial.timeSeries.map((point: any) => [point.date, point])
  );
  const timeSeries: typeof financial.timeSeries = [];
  for (
    let day = Date.parse(context.from.toISOString().slice(0, 10));
    day <= Date.parse(context.to.toISOString().slice(0, 10));
    day += 86400000
  ) {
    const date = new Date(day).toISOString().slice(0, 10);
    timeSeries.push(activity.get(date) || { date, sales: 0, expenses: 0, profit: 0 });
  }
  const forecast = buildForecast(timeSeries);
  sales.tax = outward.kpi.totalTax;

  const cashFlow: SummaryResponse['cashFlow'] = {
    inflows: {
      sales: 0,
      moneyReceived: financial.cashFlow.received,
      investmentsIn: 0,
      total: financial.cashFlow.received,
    },
    outflows: {
      expenses: 0,
      distributorPayments: 0,
      moneyGiven: financial.cashFlow.paid,
      investmentsOut: 0,
      total: financial.cashFlow.paid,
    },
    netChange: financial.cashFlow.net,
  };

  return {
    financial,
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
  };
}

function summarizeSales(
  totalsRes: ReportRows,
  categoriesRes: ReportRows
): SummaryResponse['sales'] {
  const totals = totalsRes.rows[0] || {};
  const topCategoryTotal = categoriesRes.rows.reduce(
    (sum: number, row: any) => sum + Number(row.sales || 0),
    0
  );

  return {
    total: toNumber(totals.total_sales),
    discount: toNumber(totals.total_discount),
    tax: 0,
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
  };
}

function summarizePendingCreditBills(result: ReportRows): SummaryResponse['pendingCreditBills'] {
  return result.rows.map((row: any) => ({
    billId: row.bill_id,
    invoiceNumber: row.invoice_number == null ? null : Number(row.invoice_number),
    createdAt: new Date(row.created_at).toISOString(),
    clientName: row.client_name ?? null,
    clientPhone: row.client_phone ?? null,
    grandTotal: toNumber(row.grand_total),
  }));
}

function summarizeExpenses(
  totalsRes: ReportRows,
  categoryRes: ReportRows
): SummaryResponse['expenses'] {
  const totals = totalsRes.rows[0] || {};
  const totalExpenses = toNumber(totals.total);

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
  };
}

function summarizeInvestments(result: ReportRows): SummaryResponse['investments'] {
  let investmentIn = 0;
  let investmentOut = 0;

  for (const row of result.rows) {
    if (row.direction === 'IN') investmentIn += toNumber(row.total);
    if (row.direction === 'OUT') investmentOut += toNumber(row.total);
  }

  return {
    in: investmentIn,
    out: investmentOut,
    net: investmentIn - investmentOut,
  };
}

function summarizeDistributorDues(result: ReportRows): SummaryResponse['distributors'] {
  const weOwe: SummaryResponse['distributors']['weOwe'] = [];
  const owedToUs: SummaryResponse['distributors']['owedToUs'] = [];

  for (const row of result.rows) {
    const due = toNumber(row.due);
    if (Math.abs(due) < 0.005) continue;

    if (due > 0) {
      weOwe.push({
        distributorId: row.distributor_id,
        name: row.name || 'Distributor',
        due,
      });
    } else {
      owedToUs.push({
        distributorId: row.distributor_id,
        name: row.name || 'Distributor',
        due: Math.abs(due),
      });
    }
  }

  return {
    weOwe,
    owedToUs,
    totalWeOwe: weOwe.reduce((sum, row) => sum + row.due, 0),
    totalOwedToUs: owedToUs.reduce((sum, row) => sum + row.due, 0),
  };
}

function summarizeStock(result: ReportRows): SummaryResponse['stock'] {
  const row = result.rows[0] || {};

  return {
    atMrp: toNumber(row.at_mrp),
    atCost: toNumber(row.at_cost),
    skuCount: Number(row.sku_count || 0),
    totalUnits: toNumber(row.total_units),
  };
}

function buildForecast(points: Array<{ date: string; profit: number }>) {
  if (!points.length) return [];

  const lastPointDate = new Date(points[points.length - 1].date);
  const stepDays =
    points.length > 1
      ? Math.max(
          1,
          Math.round(
            (new Date(points[points.length - 1].date).getTime() -
              new Date(points[points.length - 2].date).getTime()) /
              86400000
          )
        )
      : 1;
  const forecastPoints = Math.max(1, Math.ceil(30 / stepDays));
  const y = points.map((point) => point.profit);
  const x = points.map((_, index) => index);

  const xMean = x.reduce((sum, value) => sum + value, 0) / x.length;
  const yMean = y.reduce((sum, value) => sum + value, 0) / y.length;

  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < x.length; index += 1) {
    numerator += (x[index] - xMean) * (y[index] - yMean);
    denominator += (x[index] - xMean) ** 2;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;

  return Array.from({ length: forecastPoints }, (_, index) => {
    const forecastIndex = x.length + index;
    const projectedProfit = intercept + slope * forecastIndex;
    return {
      date: formatDay(addDays(lastPointDate, (index + 1) * stepDays)),
      projectedProfit,
    };
  });
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeekLabel(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return formatDay(copy);
}

function formatDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function toNumber(value: unknown) {
  return Number(value || 0);
}
