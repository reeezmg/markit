import { dailyExportReport } from '~/server/utils/report-daily';
import { reportWindow } from '~/server/utils/report-accounting';
import { getReadCompanyId } from '~/server/utils/organizationReadScope';
import { defineEventHandler, getQuery, createError, setHeader } from 'h3';
import { pool } from '~/server/db';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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
    expenses,
    salaryPayments,
    salaryGiven,
    purchase,
    transfers,
    transferCashNet,
    transferBankNet,
    transactions,
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
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const MARGIN = 14;
  let y = MARGIN;

  /* ---------- TITLE ---------- */

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Store Summary', MARGIN, y);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  y += 7;

  doc.text(
    `From: ${startDate.toLocaleDateString()}  To: ${endDate.toLocaleDateString()}`,
    MARGIN,
    y
  );

  y += 5;
  doc.text(`Generated: ${new Date().toLocaleString()}`, MARGIN, y);

  y += 10;

  doc.setFontSize(13);
  doc.text('Posted cash/bank movement', MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Type', 'Amount']],
    body: [
      ['Cash', rs(selectedPeriodCash)],
      ['Bank', rs(selectedPeriodBank)],
      ['Total', rs(selectedPeriodTotal)],
    ],
    theme: 'grid',
  });

  y = doc.lastAutoTable.finalY + 8;

  doc.text('Cash and bank position', MARGIN, y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Account', 'Opening', 'Net movement', 'Closing']],
    body: [...moneyAccounts.map(a => [a.name, rs(a.opening), rs(a.movement), rs(a.closing)]),
      ['Total', rs(moneyPosition.opening), rs(moneyPosition.delta), rs(moneyPosition.closing)]],
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 8;
  if (y > 245) { doc.addPage(); y = MARGIN; }
  doc.setFontSize(10);
  doc.text(`Customer dues (separate): ${rs(customerDues)}`, MARGIN, y);
  y += 10;
  doc.setFontSize(13);
  doc.text('Sales Breakdown', MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Type', 'Amount']],
    body: [
      ['Total Sales', rs(sales.total_sales)],
      ['Cash', rs(sales.cash)],
      ['UPI', rs(sales.upi)],
      ['Card', rs(sales.card)],
      ['Credit', rs(sales.credit)],
    ],
    theme: 'grid',
  });

  y = doc.lastAutoTable.finalY + 8;

  doc.text('Expense Breakdown', MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Type', 'Amount']],
    body: [
      ['Total Expense', rs(Number(expenses.total_expense || 0) + salaryGiven)],
      ['Salary Given', rs(salaryGiven)],
      ['Cash', rs(expenses.cash)],
      ['UPI', rs(expenses.upi)],
      ['Card', rs(expenses.card)],
      ['Bank', rs(expenses.bank)],
      ['Cheque', rs(expenses.cheque)],
    ],
    theme: 'grid',
  });

  y = doc.lastAutoTable.finalY + 8;

  doc.text('Distributor Purchase', MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Type', 'Amount']],
    body: [
      ['Total Purchase', rs(purchase.total_purchase)],
      ['Cash', rs(purchase.cash)],
      ['UPI', rs(purchase.upi)],
      ['Card', rs(purchase.card)],
      ['Bank', rs(purchase.bank)],
      ['Cheque', rs(purchase.cheque)],
    ],
    theme: 'grid',
  });

  y = doc.lastAutoTable.finalY + 8;

  doc.text('Salary Given', MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Staff', 'Mode', 'Amount', 'Note']],
    body: salaryPayments.length
      ? salaryPayments.map((s) => [
          new Date(s.date).toLocaleDateString(),
          s.userName || 'Staff',
          s.paymentMode || '-',
          rs(s.amount),
          s.note ?? '-',
        ])
      : [['-', '-', '-', '-', '-']],
    theme: 'grid',
  });

  y = doc.lastAutoTable.finalY + 8;

  doc.text('Account Transfers', MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Account', 'Debit', 'Credit', 'Net']],
    body: [
      ['Cash', rs(transfers.cash_debit), rs(transfers.cash_credit), rs(transferCashNet)],
      ['Bank', rs(transfers.bank_debit), rs(transfers.bank_credit), rs(transferBankNet)],
    ],
    theme: 'grid',
  });

  y = doc.lastAutoTable.finalY + 8;

  doc.text('Money Transactions', MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Account', 'Debit', 'Credit', 'Net']],
    body: [
      ['Cash', rs(transactions.cash_debit), rs(transactions.cash_credit), rs(transactionCashNet)],
      ['Bank', rs(transactions.bank_debit), rs(transactions.bank_credit), rs(transactionBankNet)],
    ],
    theme: 'grid',
  });

  y = doc.lastAutoTable.finalY + 8;

  doc.text('Bills', MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Invoice', 'Date', 'Subtotal', 'Discount', 'Total', 'Payment']],
    body: billsRes.rows.length
      ? billsRes.rows.map((b) => [
          b.invoice,
          new Date(b.date).toLocaleDateString(),
          rs(b.subtotal),
          rs(b.discount),
          rs(b.total),
          b.payment,
        ])
      : [['—', '—', '—', '—', '—', 'No data']],
    styles: { fontSize: 8 },
    theme: 'grid',
  });

  y = doc.lastAutoTable.finalY + 8;

  doc.text('Expense Details', MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Category', 'Mode', 'Note', 'Amount']],
    body: expenseRows.length
      ? expenseRows.map((e) => [
          new Date(e.date).toLocaleDateString(),
          e.category,
          e.mode,
          e.note ?? '-',
          rs(e.amount),
        ])
      : [['—', '—', '—', '—', 'No data']],
    styles: { fontSize: 8 },
    theme: 'grid',
  });

  y = doc.lastAutoTable.finalY + 8;

  doc.text('Expense by Category', MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Category', 'Amount']],
    body: Object.entries(expenseByCategory).map(([c, a]) => [c, rs(a)]),
    theme: 'grid',
  });

  const pdf = Buffer.from(doc.output('arraybuffer'));

  setHeader(event, 'Content-Type', 'application/pdf');
  setHeader(event, 'Content-Disposition', `attachment; filename="summary.pdf"`);

  return pdf;
});

function rs(v: number) {
  return `Rs ${Number(v || 0).toFixed(2)}`;
}
