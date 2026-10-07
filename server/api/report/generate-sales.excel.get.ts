import { dailyExportReport } from '~/server/utils/report-daily';
import { reportWindow } from '~/server/utils/report-accounting';
import { getReadCompanyId } from '~/server/utils/organizationReadScope';
import { defineEventHandler, getQuery, createError, setHeader } from 'h3';
import { pool } from '~/server/db';
import ExcelJS from 'exceljs';

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event);
  const companyId = await getReadCompanyId(event);
  const cleanup = session.data.cleanup ?? false;

  if (!companyId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const query = getQuery(event);
  const showCleanedValues = String(query.showCleanedValues) === 'true';
  const useOriginalCleanupValues = cleanup && !showCleanedValues;
  const includeCleanupPrecedence = cleanup && !showCleanedValues;

  const { from: startDate, to: endDate } = reportWindow(query);

  const {
    sales,
    totalCollections,
    creditCollections,
    collectionsByPaymentMethod,
    expenses,
    salaryPayments,
    salaryGiven,
    purchase,
    transfers,
    transferCashNet,
    transferBankNet,
    transactions,
    investments,
    transactionCashNet,
    transactionBankNet,
    selectedPeriodCash,
    selectedPeriodBank,
    selectedPeriodTotal,
    moneyPosition,
    moneyAccounts,
    customerDues,
    billsRes,
    expenseRows,
    expenseByCategory,
  } = await dailyExportReport(pool, {
    companyId,
    startDate,
    endDate,
    useOriginalCleanupValues,
    includeCleanupPrecedence,
  });
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'Financial System';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Summary');

  summarySheet.addRow(['Store Financial Summary']);
  summarySheet.addRow([
    `From: ${startDate.toLocaleDateString()}  To: ${endDate.toLocaleDateString()}`,
  ]);
  summarySheet.addRow([]);

  /* ---------- SELECTED PERIOD BALANCE ---------- */

  summarySheet.addRow(['Type', 'Posted cash/bank movement']);

  summarySheet.addRow(['Cash', selectedPeriodCash]);

  summarySheet.addRow(['Bank', selectedPeriodBank]);

  summarySheet.addRow(['Total', selectedPeriodTotal]);

  summarySheet.addRow([]);
  summarySheet.addRow(['Opening cash + banks', moneyPosition.opening]);
  summarySheet.addRow(['Closing cash + banks', moneyPosition.closing]);
  summarySheet.addRow(['Customer dues (separate)', customerDues]);
  const positionSheet = workbook.addWorksheet('Cash and bank position');
  positionSheet.addRow(['Account', 'Opening', 'Debits', 'Credits', 'Net movement', 'Closing']);
  for (const account of moneyAccounts) positionSheet.addRow([account.name, account.opening, account.debit, account.credit, account.movement, account.closing]);

  const salesSheet = workbook.addWorksheet('Sales');

  salesSheet.addRow(['Type', 'Amount']);

  salesSheet.addRow(['Total Sales', sales.total_sales]);
  salesSheet.addRow(['Cash', sales.cash]);
  salesSheet.addRow(['UPI', sales.upi]);
  salesSheet.addRow(['Card', sales.card]);
  salesSheet.addRow(['Bank', sales.bank]);
  salesSheet.addRow(['Cheque', sales.cheque]);
  salesSheet.addRow(['Credit', sales.credit]);
  const collectionsSheet = workbook.addWorksheet('Collections');
  collectionsSheet.addRow(['Total collections', totalCollections]);
  collectionsSheet.addRow(['Credit repayments (net of reversals)', creditCollections]);
  for (const [method,amount] of Object.entries(collectionsByPaymentMethod)) collectionsSheet.addRow([method,amount]);

  const expenseSheet = workbook.addWorksheet('Expenses');

  expenseSheet.addRow(['Type', 'Amount']);

  expenseSheet.addRow(['Total Expense', Number(expenses.total_expense || 0) + salaryGiven]);
  expenseSheet.addRow(['Salary Given', salaryGiven]);
  expenseSheet.addRow(['Cash', expenses.cash]);
  expenseSheet.addRow(['UPI', expenses.upi]);
  expenseSheet.addRow(['Card', expenses.card]);
  expenseSheet.addRow(['Bank', expenses.bank]);
  expenseSheet.addRow(['Cheque', expenses.cheque]);

  const purchaseSheet = workbook.addWorksheet('Purchases');

  purchaseSheet.addRow(['Type', 'Amount']);

  purchaseSheet.addRow(['Total Purchase', purchase.total_purchase]);
  purchaseSheet.addRow(['Cash', purchase.cash]);
  purchaseSheet.addRow(['UPI', purchase.upi]);
  purchaseSheet.addRow(['Card', purchase.card]);
  purchaseSheet.addRow(['Bank', purchase.bank]);
  purchaseSheet.addRow(['Cheque', purchase.cheque]);

  const salarySheet = workbook.addWorksheet('Salary Given');

  salarySheet.addRow(['Date', 'Staff', 'Mode', 'Amount', 'Note']);

  salaryPayments.forEach((s) => {
    salarySheet.addRow([
      new Date(s.date).toLocaleDateString(),
      s.userName || 'Staff',
      s.paymentMode || '-',
      s.amount,
      s.note ?? '-',
    ]);
  });

  const transferSheet = workbook.addWorksheet('Transfers');

  transferSheet.addRow(['Account', 'Debit', 'Credit', 'Net']);

  transferSheet.addRow(['Cash', transfers.cash_debit, transfers.cash_credit, transferCashNet]);

  transferSheet.addRow(['Bank', transfers.bank_debit, transfers.bank_credit, transferBankNet]);

  const txnSheet = workbook.addWorksheet('Transactions');

  txnSheet.addRow(['Account', 'Debit', 'Credit', 'Net']);

  txnSheet.addRow(['Cash', transactions.cash_debit, transactions.cash_credit, transactionCashNet]);

  txnSheet.addRow(['Bank', transactions.bank_debit, transactions.bank_credit, transactionBankNet]);

  const investmentSheet = workbook.addWorksheet('Investments');
  investmentSheet.addRow(['Account', 'Money in', 'Money out', 'Net']);
  for (const key of ['cash', 'bank'] as const) {
    const row = investments[key];
    investmentSheet.addRow([key === 'cash' ? 'Cash' : 'Bank', row.debit, row.credit, row.net]);
  }

  const billsSheet = workbook.addWorksheet('Bills');

  billsSheet.addRow(['Invoice', 'Date', 'Subtotal', 'Discount', 'Total', 'Payment']);

  billsRes.rows.forEach((b) => {
    billsSheet.addRow([
      b.invoice,
      new Date(b.date).toLocaleDateString(),
      b.subtotal,
      b.discount,
      b.total,
      b.payment,
    ]);
  });

  const expenseDetailSheet = workbook.addWorksheet('Expense Details');

  expenseDetailSheet.addRow(['Date', 'Category', 'Mode', 'Note', 'Amount']);

  expenseRows.forEach((e) => {
    expenseDetailSheet.addRow([
      new Date(e.date).toLocaleDateString(),
      e.category,
      e.mode,
      e.note ?? '-',
      e.amount,
    ]);
  });

  const expCatSheet = workbook.addWorksheet('Expense by Category');

  expCatSheet.addRow(['Category', 'Amount']);

  Object.entries(expenseByCategory).forEach(([category, amount]) => {
    expCatSheet.addRow([category, amount]);
  });

  workbook.worksheets.forEach((sheet) => {
    sheet.columns.forEach((column) => {
      column.width = 18;
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();

  setHeader(
    event,
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  setHeader(event, 'Content-Disposition', 'attachment; filename="summary.xlsx"');

  return Buffer.from(buffer);
});
