import { accountingReport, accountingMoneyActivity } from './report-accounting';
import { dailySourceSections, type DailyReportContext } from './report-daily';
import { reportSections, type ReportDatabase } from './report-query';

export const dailyReportBlocks = ['sales', 'expenses', 'money', 'balances', 'items', 'details'] as const;
export type DailyReportBlock = typeof dailyReportBlocks[number];

const methods = (row: any, prefix = '') => Object.fromEntries(
  ['Cash', 'UPI', 'Card', 'Bank', 'Cheque'].map(method => [method, Number(row[prefix + method.toLowerCase()] || 0)])
);
const expenseMethods = (row: any) => ({
  Cash: Number(row.cash || 0), UPI: Number(row.upi || 0), Card: Number(row.card || 0),
  BankTransfer: Number(row.bank || 0), Cheque: Number(row.cheque || 0),
});

/** Independently requested blocks; no date slicing or adding overlapping openings. */
export async function dailyReportBlock(db: ReportDatabase, context: DailyReportContext, block: DailyReportBlock) {
  const { companyId, startDate, endDate, includeCleanupPrecedence } = context;
  const args = [companyId, startDate.toISOString(), endDate.toISOString(), includeCleanupPrecedence];
  const sql = dailySourceSections(context);
  if (block === 'balances') {
    const report = await accountingReport(db, [companyId], startDate, endDate, { balancesOnly: true });
    const { cash, bank, receivable, total } = report.balances;
    // A partial response must not advertise uncalculated P&L/cash-flow values.
    const financial = { basis: report.basis, currency: report.currency, companies: report.companies,
      window: report.window, accounts: report.accounts, balances: { cash, bank, receivable, total } };
    return { financial, balances: {
      opening: { cash: financial.balances.cash.opening, bank: financial.balances.bank.opening,
        credit: financial.balances.receivable.opening, total: financial.balances.total.opening },
      cashBalance: financial.balances.cash.delta, bankBalance: financial.balances.bank.delta,
      creditBalance: financial.balances.receivable.delta, totalBalance: financial.balances.total.delta,
    } };
  }
  if (block === 'money') {
    const activity = await accountingMoneyActivity(db, [companyId], startDate, endDate);
    return { transfers: activity.transfers, transfersDisplay: activity.transfersDisplay,
      transactions: activity.transactions, transactionsDisplay: activity.transactionsDisplay,
      investments: activity.investments, investmentsDisplay: activity.investmentsDisplay };
  }
  if (block === 'sales') {
    // Only bind parameters used by this statement.
    const { rows: [sales] } = await db.query(sql[0], args);
    return { totalSales: Number(sales.total_sales || 0), totalCreditSales: Number(sales.credit || 0),
      totalCollections: Number(sales.total_collections || 0), creditCollections: Number(sales.credit_collections || 0),
      creditCollectionsByPaymentMethod: methods(sales, 'credit_collected_'),
      collectionsByPaymentMethod: methods(sales, 'collected_'),
      salesByPaymentMethod: { ...methods(sales), Credit: Number(sales.credit || 0) } };
  }
  if (block === 'expenses') {
    const [expense, salary, purchase] = await reportSections(db, [sql[3], `
      SELECT payment_mode, SUM(amount) AS amount FROM salary_payments
      WHERE company_id=$1 AND payment_date BETWEEN $2 AND $3 GROUP BY payment_mode`, sql[5]], args.slice(0, 3));
    const salaryExpense = salary.rows.reduce((sum, row) => sum + Number(row.amount), 0);
    return { totalExpenses: Number(expense.rows[0].total_expense || 0) + salaryExpense, salaryExpense,
      salaryByPaymentMethod: Object.fromEntries(salary.rows.map(row => [row.payment_mode, Number(row.amount)])),
      expensesByPaymentMethod: expenseMethods(expense.rows[0]),
      totalPurchaseExpense: Number(purchase.rows[0].total_purchase || 0),
      purchaseExpensesByPaymentMethod: expenseMethods(purchase.rows[0]) };
  }
  if (block === 'items') {
    const [brands, categories] = await reportSections(db, [sql[1], sql[6]], args);
    const items = (rows: any[]) => rows.map(row => ({ name: row.name, qty: Number(row.qty), sales: Number(row.total) }));
    return { categorySales: items(categories.rows), brandSales: items(brands.rows),
      revenueByCategory: categories.rows.map(row => ({ name: row.name, value: Number(row.total) })) };
  }
  // Kept out of the initial screen load; exports still use the complete loader.
  const [credit, salary] = await reportSections(db, [sql[2], sql[4]], args);
  return { creditBills: credit.rows.map(row => ({ invoiceNumber: row.invoiceNumber,
    accountName: row.accountName || 'Unknown', accountPhone: row.accountPhone || '', amount: Number(row.amount || 0) })),
    salaryPayments: salary.rows.map(row => ({ id: row.id, date: new Date(row.date), amount: Number(row.amount || 0),
      type: row.type || 'SALARY', paymentMode: row.paymentMode || 'CASH', userName: row.userName || 'Staff',
      userPhone: row.userPhone || '', note: row.note || '' })) };
}
