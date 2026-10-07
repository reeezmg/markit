import { accountingReport, accountingMoneyActivity } from './report-accounting';
import { reportSections, type ReportDatabase } from './report-query';
import { billSalesSql, billCreditSql } from './report-bill-sales';

export type DailyReportContext = {
  companyId: string;
  startDate: Date;
  endDate: Date;
  useOriginalCleanupValues: boolean;
  includeCleanupPrecedence: boolean;
};

const paidExpensesSql = `
        SELECT
          SUM(total_amount) AS total_expense,

          SUM(CASE WHEN payment_mode = 'CASH' THEN total_amount ELSE 0 END) AS cash,
          SUM(CASE WHEN payment_mode = 'UPI' THEN total_amount ELSE 0 END) AS upi,
          SUM(CASE WHEN payment_mode = 'CARD' THEN total_amount ELSE 0 END) AS card,
          SUM(CASE WHEN payment_mode = 'BANK' THEN total_amount ELSE 0 END) AS bank,
          SUM(CASE WHEN payment_mode = 'CHEQUE' THEN total_amount ELSE 0 END) AS cheque

        FROM expenses
        WHERE company_id = $1
          AND UPPER(status) = 'PAID'
          AND expense_date BETWEEN $2 AND $3
        `;

const salaryPaymentsSql = `
        SELECT
          sp.id,
          sp.payment_date AS date, SUM(sp.amount) OVER () AS total_salary_expense,
          sp.amount,
          sp.type,
          sp.payment_mode AS "paymentMode",
          COALESCE(cu.name, 'Staff') AS "userName",
          COALESCE(cu.phone, '') AS "userPhone",
          sp.note
        FROM salary_payments sp
        LEFT JOIN company_users cu
          ON cu.company_id = sp.company_id
         AND cu.user_id = sp.user_id
        WHERE sp.company_id = $1
          AND sp.payment_date BETWEEN $2 AND $3
        ORDER BY sp.payment_date ASC, sp.id ASC
        `;

const purchasePaymentsSql = `
        SELECT
          SUM(CASE WHEN payment_type = 'CASH' THEN amount ELSE 0 END) AS cash,
          SUM(CASE WHEN payment_type = 'UPI' THEN amount ELSE 0 END) AS upi,
          SUM(CASE WHEN payment_type = 'CARD' THEN amount ELSE 0 END) AS card,
          SUM(CASE WHEN payment_type = 'BANK' THEN amount ELSE 0 END) AS bank,
          SUM(CASE WHEN payment_type = 'CHEQUE' THEN amount ELSE 0 END) AS cheque,
          SUM(amount) AS total_purchase
        FROM distributor_payments
        WHERE company_id = $1
          AND created_at BETWEEN $2 AND $3
        `;
export async function dailyReport(db: ReportDatabase, context: DailyReportContext) {
  const { companyId, startDate, endDate, useOriginalCleanupValues, includeCleanupPrecedence } =
    context;
  const billTotalExpr = useOriginalCleanupValues
    ? 'COALESCE(NULLIF(b.original_grand_total, 0), b.grand_total)'
    : 'b.grand_total';
  const entryValueExpr = useOriginalCleanupValues
    ? 'COALESCE(NULLIF(e.original_value, 0), e.value)'
    : 'e.value';
  const [
    financial,
    moneyActivity,
    [
      salesRes,
      brandRes,
      creditBillsRes,
      expenseRes,
      salaryPaymentsRes,
      purchaseRes,
      categoryRes,
    ],
  ] = await Promise.all([
    accountingReport(db, [companyId], startDate, endDate),
    accountingMoneyActivity(db, [companyId], startDate, endDate),
    reportSections(
      db,
      [
        billSalesSql(billTotalExpr),
        `
        SELECT 
          COALESCE(br.name, 'Unbranded') AS name,
          ROUND(SUM(${entryValueExpr})::numeric,2) AS total,
          COALESCE(SUM(e.qty),0) AS qty

        FROM entries e

        JOIN bills b 
          ON e.bill_id = b.id

        LEFT JOIN variants v 
          ON e.variant_id = v.id

        LEFT JOIN products p 
          ON v.product_id = p.id

        LEFT JOIN brands br 
          ON p.brand_id = br.id

        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.payment_status IN ('PAID','PENDING')
          AND b.is_markit = false
          AND b.created_at BETWEEN $2 AND $3
          AND ($4 = true OR b.precedence IS NOT TRUE)

        GROUP BY br.name
        ORDER BY total DESC
        `,
        `
        SELECT
          b.invoice_number AS "invoiceNumber",
          ${billCreditSql('b',billTotalExpr)} AS amount,
          a.name AS "accountName",
          a.phone AS "accountPhone"
        FROM bills b
        LEFT JOIN accounts a ON a.id = b.account_id
        WHERE b.company_id = $1
          AND b.deleted = false
          AND ${billCreditSql('b',billTotalExpr)} > 0
          AND b.payment_status IN ('PAID','PENDING')
          AND b.is_markit = false
          AND b.created_at BETWEEN $2 AND $3
          AND ($4 = true OR b.precedence IS NOT TRUE)
        ORDER BY a.name ASC
        `,
        paidExpensesSql,
        salaryPaymentsSql,
        purchasePaymentsSql,
        `
        SELECT 
          COALESCE(c.name, 'Uncategorized') AS name,
          ROUND(SUM(${entryValueExpr})::numeric,2) AS total,
          COALESCE(SUM(e.qty),0) AS qty

        FROM entries e
        JOIN bills b ON e.bill_id = b.id
        LEFT JOIN categories c ON e.category_id = c.id

        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.payment_status IN ('PAID','PENDING')
          AND b.is_markit = false
          AND b.created_at BETWEEN $2 AND $3
          AND ($4 = true OR b.precedence IS NOT TRUE)

        GROUP BY c.name
        ORDER BY total DESC
        `,
      ],
      [companyId, startDate.toISOString(), endDate.toISOString(), includeCleanupPrecedence]
    ),
  ]);
  const cashOpening = financial.balances.cash.opening,
    bankOpening = financial.balances.bank.opening,
    creditOpening = financial.balances.receivable.opening;
  const cashBalance = financial.balances.cash.delta,
    bankBalance = financial.balances.bank.delta,
    creditBalance = financial.balances.receivable.delta;
  const sales = salesRes.rows[0];
  const exp = expenseRes.rows[0];
  const salaryExpense = Number(salaryPaymentsRes.rows[0]?.total_salary_expense || 0);
  const salaryPayments = salaryPaymentsRes.rows;
  const purchase = purchaseRes.rows[0];
  const categories = categoryRes.rows;
  const brands = brandRes.rows;

  const totalBalance = financial.balances.total.delta;

  return {
    financial,
    /* ---------- SALES ---------- */

    totalSales: Number(sales.total_sales || 0),

    totalCreditSales: Number(sales.credit || 0),
    totalCollections: Number(sales.total_collections || 0),
    creditCollections: Number(sales.credit_collections || 0),
    creditCollectionsByPaymentMethod: Object.fromEntries(['Cash','UPI','Card','Bank','Cheque'].map(m => [m, Number(sales['credit_collected_'+m.toLowerCase()] || 0)])),
    collectionsByPaymentMethod: Object.fromEntries(['Cash','UPI','Card','Bank','Cheque'].map(m => [m, Number(sales['collected_'+m.toLowerCase()] || 0)])),

    creditBills: creditBillsRes.rows.map((r) => ({
      invoiceNumber: r.invoiceNumber,
      accountName: r.accountName || 'Unknown',
      accountPhone: r.accountPhone || '',
      amount: Number(r.amount || 0),
    })),

    salesByPaymentMethod: {
      Cash: Number(sales.cash || 0),
      UPI: Number(sales.upi || 0),
      Card: Number(sales.card || 0),
      Credit: Number(sales.credit || 0),
      Bank: Number(sales.bank || 0),
      Cheque: Number(sales.cheque || 0),
    },

    /* ---------- EXPENSES ---------- */

    totalExpenses: Number(exp.total_expense || 0) + salaryExpense,
    salaryExpense,
    salaryPayments: salaryPayments.map((r) => ({
      id: r.id,
      date: new Date(r.date),
      amount: Number(r.amount || 0),
      type: r.type || 'SALARY',
      paymentMode: r.paymentMode || 'CASH',
      userName: r.userName || 'Staff',
      userPhone: r.userPhone || '',
      note: r.note || '',
    })),

    expensesByPaymentMethod: {
      Cash: Number(exp.cash || 0),
      Card: Number(exp.card || 0),
      BankTransfer: Number(exp.bank || 0),
      UPI: Number(exp.upi || 0),
      Cheque: Number(exp.cheque || 0),
    },

    /* ---------- PURCHASE ---------- */

    totalPurchaseExpense: Number(purchase.total_purchase || 0),

    purchaseExpensesByPaymentMethod: {
      Cash: Number(purchase.cash || 0),
      Card: Number(purchase.card || 0),
      BankTransfer: Number(purchase.bank || 0),
      UPI: Number(purchase.upi || 0),
      Cheque: Number(purchase.cheque || 0),
    },

    /* ---------- TRANSFERS ---------- */

    transfers: moneyActivity.transfers,

    transfersDisplay: moneyActivity.transfersDisplay,
    transactions: moneyActivity.transactions,
    investments: moneyActivity.investments,
    transactionsDisplay: moneyActivity.transactionsDisplay,
    investmentsDisplay: moneyActivity.investmentsDisplay,

    /* ---------- BALANCES ---------- */

    balances: {
      opening: {
        cash: cashOpening,
        bank: bankOpening,
        credit: creditOpening,
        total: financial.balances.total.opening,
      },
      cashBalance,
      bankBalance,
      creditBalance,
      totalBalance,
    },

    /* ---------- CATEGORY ---------- */

    revenueByCategory: categories.map((r) => ({
      name: r.name,
      value: Number(r.total),
    })),

    categorySales: categories.map((r) => ({
      name: r.name,
      qty: Number(r.qty),
      sales: Number(r.total),
    })),

    /* ---------- BRAND ---------- */

    brandSales: brands.map((r) => ({
      name: r.name,
      qty: Number(r.qty),
      sales: Number(r.total),
    })),
  };
}

export async function dailyExportReport(db: ReportDatabase, context: DailyReportContext) {
  const daily = await dailyReport(db,context);
  const {companyId,startDate,endDate,useOriginalCleanupValues,includeCleanupPrecedence} = context;
  const billTotalExpr = useOriginalCleanupValues ? 'COALESCE(NULLIF(b.original_grand_total,0),b.grand_total)' : 'b.grand_total';
  const billSubtotalExpr = useOriginalCleanupValues ? 'COALESCE(NULLIF(b.original_subtotal,0),b.subtotal)' : 'b.subtotal';
  const [billsRes,expenseRowsRes] = await reportSections(db,[`
    SELECT b.invoice_number AS invoice,b.created_at AS date,${billSubtotalExpr} AS subtotal,
      ${billSubtotalExpr}-${billTotalExpr} AS discount,${billTotalExpr} AS total,b.payment_method AS payment
    FROM bills b WHERE b.company_id=$1 AND b.deleted=false AND b.payment_status IN ('PAID','PENDING') AND b.is_markit=false
      AND b.created_at BETWEEN $2 AND $3 AND ($4=true OR b.precedence IS NOT TRUE) ORDER BY b.created_at DESC`,`
    SELECT e.expense_date AS date,ec.name AS category,e.payment_mode AS mode,e.note,e.total_amount AS amount
    FROM expenses e JOIN expense_categories ec ON ec.id=e.expense_category_id
    WHERE e.company_id=$1 AND e.expense_date BETWEEN $2 AND $3 ORDER BY e.expense_date DESC`
  ],[companyId,startDate.toISOString(),endDate.toISOString(),includeCleanupPrecedence]);
  const sales = {total_sales:daily.totalSales,credit:daily.totalCreditSales,
    cash:daily.salesByPaymentMethod.Cash,upi:daily.salesByPaymentMethod.UPI,card:daily.salesByPaymentMethod.Card,
    bank:daily.salesByPaymentMethod.Bank,cheque:daily.salesByPaymentMethod.Cheque};
  const expenseRows = expenseRowsRes.rows.map(r => ({...r,amount:Number(r.amount)}));
  const expenseByCategory: Record<string,number> = {};
  for (const row of expenseRows) expenseByCategory[row.category] = (expenseByCategory[row.category] || 0)+row.amount;
  const oldMovement = (rows:any) => ({cash_debit:rows.cash.debit,cash_credit:rows.cash.credit,bank_debit:rows.bank.debit,bank_credit:rows.bank.credit});
  const exp=daily.expensesByPaymentMethod, purchase=daily.purchaseExpensesByPaymentMethod;
  return {sales,
    totalCollections:daily.totalCollections,creditCollections:daily.creditCollections,collectionsByPaymentMethod:daily.collectionsByPaymentMethod,
    expenses:{total_expense:daily.totalExpenses-daily.salaryExpense,cash:exp.Cash,upi:exp.UPI,card:exp.Card,bank:exp.BankTransfer,cheque:exp.Cheque},
    salaryPayments:daily.salaryPayments,salaryGiven:daily.salaryExpense,
    purchase:{total_purchase:daily.totalPurchaseExpense,cash:purchase.Cash,upi:purchase.UPI,card:purchase.Card,bank:purchase.BankTransfer,cheque:purchase.Cheque},
    transfers:oldMovement(daily.transfers),transferCashNet:daily.transfers.cash.net,transferBankNet:daily.transfers.bank.net,
    transactions:oldMovement(daily.transactions),transactionCashNet:daily.transactions.cash.net,transactionBankNet:daily.transactions.bank.net,
    selectedPeriodCash:daily.balances.cashBalance,selectedPeriodBank:daily.balances.bankBalance,selectedPeriodTotal:daily.balances.totalBalance,
    moneyPosition:daily.financial.balances.total,moneyAccounts:daily.financial.accounts.filter(a=>a.type==='CASH'||a.type==='BANK'),
    investments:daily.investments,
    customerDues:daily.financial.balances.receivable.closing,billsRes,expenseRows,expenseByCategory};
}
