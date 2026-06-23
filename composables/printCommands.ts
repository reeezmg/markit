import moment from 'moment';
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

const COLUMN_WIDTHS = {
  sl: 4,
  description: 24,
  hsn: 10,
  tax: 10,
  qty: 4,
  mrp: 10,
  value: 10,
  disc: 10,
  tvalue: 10,
};

function centerText(text: string, width: number): string {
  const textStr = (text ?? ' ').toString();
  if (textStr.length >= width) return textStr;
  const totalPadding = width - textStr.length;
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return ' '.repeat(leftPadding) + textStr + ' '.repeat(rightPadding);
}

function wrapText(text: string, width: number): string[] {
  const str = (text ?? '').toString();
  if (str.length === 0) return [''];
  const lines: string[] = [];
  for (let i = 0; i < str.length; i += width) {
    lines.push(str.slice(i, i + width));
  }
  return lines;
}

function renderExpenseRow(
  encoder: any,
  cols: Array<{ text: string; width: number }>,
) {
  const wrapped = cols.map(c => wrapText(c.text, c.width));
  const lineCount = Math.max(...wrapped.map(w => w.length));
  for (let i = 0; i < lineCount; i++) {
    const line = wrapped.map((w, ci) => textStart(w[i] || '', cols[ci].width)).join('');
    encoder.text(line).newline(1);
  }
}

function textStart(text: unknown, width: number): string {
  const textStr = (text ?? ' ').toString();
  if (textStr.length >= width) return textStr;
  return textStr + ' '.repeat(width - textStr.length);
}

function wordWrap(text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word.slice(0, width);
    } else if (current.length + 1 + word.length <= width) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word.slice(0, width);
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function parseMoneyInput(value: unknown): number {
  if (typeof value === 'string') {
    const normalized = value.replace(/[^\d.+-]/g, '').trim();
    if (!normalized) return 0;
    const match = normalized.match(/[+-]?\d+(?:\.\d+)?/);
    const numeric = match ? Number(match[0]) : 0;
    return Number.isFinite(numeric) ? numeric : 0;
  }

  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatMoney(amount: unknown): string {
  const numeric = Number(amount ?? 0);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';
}

function formatSavingsMoney(amount: unknown): string {
  const numeric = Number(amount ?? 0);
  if (!Number.isFinite(numeric)) return '0';

  const formatted = numeric.toFixed(2);
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
}

function toFiniteNumber(value: unknown): number {
  return parseMoneyInput(value);
}

function toReceiptAmount(value: unknown): number {
  const numeric = parseMoneyInput(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric * 100) / 100);
}

function computeBillDiscountAmount(discount: unknown, discountBase: unknown): number {
  const rawDiscount = String(discount ?? '').trim();
  const baseValue = parseMoneyInput(discountBase);

  if (!rawDiscount) return 0;
  if (rawDiscount.startsWith('+')) return -Math.abs(parseMoneyInput(rawDiscount));

  const numericDiscount = parseMoneyInput(rawDiscount);
  if (numericDiscount < 0) return Math.abs(numericDiscount);
  return (baseValue * numericDiscount) / 100;
}

function formatBillDiscountDisplay(discount: unknown, calculatedDiscount: unknown): string {
  const rawDiscount = String(discount ?? '').trim();
  if (!rawDiscount) return formatMoney(0);

  if (rawDiscount.startsWith('+')) {
    return `+${formatSavingsMoney(Math.abs(parseMoneyInput(rawDiscount)))}`;
  }

  const numericDiscount = parseMoneyInput(rawDiscount);
  if (numericDiscount < 0) {
    return `-${formatSavingsMoney(Math.abs(numericDiscount))}`;
  }

  return formatMoney(calculatedDiscount);
}

function formatDiscountCell(discount: unknown): string {
  if (discount === null || discount === undefined || discount === '') return '0';
  const rawDiscount = String(discount);
  // Negative discounts (flat amounts) should not get a % symbol
  if (rawDiscount.includes('-') || Number(rawDiscount) < 0) return rawDiscount;
  return rawDiscount.endsWith('%') ? rawDiscount : `${rawDiscount}%`;
}

function escapeLabelText(value: unknown): string {
  return String(value ?? '').replace(/"/g, "'");
}

function formatCouponDiscount(coupon: any): string {
  if (!coupon) return '';
  if (coupon.type === 'PERCENTAGE') {
    const max = coupon.maxDiscountAmount ? ` max ${formatSavingsMoney(coupon.maxDiscountAmount)}` : '';
    return `${formatSavingsMoney(coupon.discountValue)}% off${max}`;
  }
  if (coupon.type === 'FLAT') {
    return `${formatSavingsMoney(coupon.discountValue)} off`;
  }
  return 'Gift coupon';
}

function appendGeneratedCoupons(encoder: any, bill: any) {
  const coupons = Array.isArray(bill.generatedCoupons) ? bill.generatedCoupons : [];
  if (!coupons.length) return;

  encoder
    .align('center')
    .bold(true)
    .text('COUPON EARNED')
    .bold(false)
    .newline(1)
    .rule({ style: 'single' });

  coupons.forEach((coupon: any, index: number) => {
    const couponNumber = coupon.code || coupon.couponNumber || coupon.id || '';

    encoder
      .align('center')
      .bold(true)
      .size(2, 2)
      .text(couponNumber)
      .size(1, 1)
      .bold(false)
      .newline(1)
      .text(centerText(coupon.code || '', 48))
      .newline(1)
      .text(centerText(formatCouponDiscount(coupon), 48))
      .newline(1);

    if (coupon.minOrderValue) {
      encoder.text(`Min order: ${formatMoney(coupon.minOrderValue)}`).newline(1);
    }
    if (coupon.endDate) {
      encoder.text(`Valid till: ${moment(coupon.endDate).format('DD-MM-YYYY')}`).newline(1);
    }

    const barcodeValue = String(couponNumber || '').replace(/[^\x20-\x7E]/g, '');
    encoder
      .newline(1)
      .align('center')
      .barcode(barcodeValue, 'code128', { height: 60, width: 1, text: true })
      .align('left')
      .newline(2);

    if (index < coupons.length - 1) {
      encoder.rule({ style: 'single' }).newline(1);
    }
  });

  encoder.rule({ style: 'single' }).newline(1);
}

export function buildBillReceiptBytes(bill: any): Uint8Array {
  const encoder = new ReceiptPrinterEncoder({
    newlineBeforeCut: 8,
    columns: 48,
  });

  const companyAddress = bill.companyAddress || {};
  // Main discount is applied after per-line discounts in useBillingDraft.grandTotal.
  // Use ttvalue (sum of final entry values) instead of subtotal/MRP total.
  const lineSavings = toFiniteNumber(bill.tdiscount);
  const billDiscountBase = bill.ttvalue ?? bill.subtotal;
  const calculatedDiscount = computeBillDiscountAmount(bill.discount, billDiscountBase);
  const billDiscountText = formatBillDiscountDisplay(bill.discount, calculatedDiscount);
  const couponDiscount = toReceiptAmount(bill.couponValue);
  const redeemedPoints = toReceiptAmount(bill.redeemedPoints);
  const availablePoints = toReceiptAmount(bill.availablePoints);
  const totalSavings = toReceiptAmount(
    lineSavings + toFiniteNumber(calculatedDiscount) + couponDiscount + redeemedPoints,
  );
  const savingsText = `SAVINGS: ${formatSavingsMoney(totalSavings)}`;
  const upiPayment = bill.paymentMethod?.toLowerCase() === 'upi'
    ? { amount: bill.grandTotal }
    : bill.paymentMethod?.toLowerCase() === 'split'
      ? bill.splitPayments?.find((p: any) => p.method?.toLowerCase() === 'upi')
      : null;

  encoder
    .initialize()
    .bold(true)
    .align('center')
    .text('')
    .align('center')
    .size(2, 2)
    .text(bill.companyName || '')
    .newline(1)
    .bold(false)
    .size(1, 1);

  const addressLine = [
    companyAddress.street,
    companyAddress.locality,
    companyAddress.city,
    companyAddress.state,
    companyAddress.pincode,
  ]
    .map((v: any) => (v ?? '').toString().trim())
    .filter(Boolean)
    .join(', ');

  if (addressLine) {
    encoder.text(addressLine).newline(1);
  }

  encoder
    .newline(1)
    .text(`GSTIN:${bill.gstin || ''}`)
    .newline(1)
    .rule({ style: 'single' })
    .align('left')
    .text(`Invoice: #${bill.invoiceNumber || ''}`)
    .newline(1)
    .text(`Date  : ${moment(bill.date).format('DD-MM-YYYY hh:mm')}`)
    .newline(1)
    .text(`Payment Method: ${bill.paymentMethod || ''}`)
    .newline(1)
    .rule({ style: 'single' });

  if (bill.clientName) {
    encoder.text(`Customer Name: ${bill.clientName}`).newline(1);
  }
  if (bill.clientPhone) {
    encoder.text(`Customer Phone No: ${bill.clientPhone}`).newline(1);
  }
  if (availablePoints > 0) {
    encoder.text(`Total Points Available: ${formatSavingsMoney(availablePoints)}`).newline(1);
  }
  if (bill.clientName || bill.clientPhone || availablePoints > 0) encoder.rule({ style: 'single' });

  encoder.text(
    textStart('SL', COLUMN_WIDTHS.sl) +
      textStart('DESCRIPTION', COLUMN_WIDTHS.description) +
      textStart('HSN', COLUMN_WIDTHS.hsn) +
      textStart('TAX', COLUMN_WIDTHS.tax),
  );

  encoder
    .text(
      '    ' +
        textStart('MRP', COLUMN_WIDTHS.mrp) +
        textStart('QTY', COLUMN_WIDTHS.qty) +
        textStart('VALUE', COLUMN_WIDTHS.value) +
        textStart('DISC', COLUMN_WIDTHS.disc) +
        textStart('T.VALUE', COLUMN_WIDTHS.tvalue),
    )
    .rule({ style: 'single' });

  (bill.entries || []).forEach((item: any, index: number) => {
    const descLines = wordWrap(item.description || '', COLUMN_WIDTHS.description);
    // First line: SL + first desc chunk + HSN + TAX
    encoder.text(
      textStart((index + 1).toString(), COLUMN_WIDTHS.sl) +
        textStart(descLines[0], COLUMN_WIDTHS.description) +
        textStart(item.hsn || '', COLUMN_WIDTHS.hsn) +
        textStart(`${item.tax || 0}%`, COLUMN_WIDTHS.tax),
    );
    // Extra description lines on their own rows
    for (let j = 1; j < descLines.length; j++) {
      encoder.text(
        ' '.repeat(COLUMN_WIDTHS.sl) + descLines[j],
      );
    }
    // Second row: QTY + MRP + VALUE + DISC + T.VALUE
    encoder.text(
      '    ' +
        textStart(formatMoney(item.mrp), COLUMN_WIDTHS.mrp) +
        textStart(item.qty || 0, COLUMN_WIDTHS.qty) +
        textStart(formatMoney(item.value), COLUMN_WIDTHS.value) +
        textStart(formatDiscountCell(item.discount), COLUMN_WIDTHS.disc) +
        textStart(formatMoney(item.tvalue), COLUMN_WIDTHS.tvalue),
    );
    encoder.newline(2);
  });

  encoder
    .rule({ style: 'single' })
    .bold(true)
    .text(
      '    ' +
        ' '.repeat(COLUMN_WIDTHS.mrp) +
        textStart(bill.tqty || 0, COLUMN_WIDTHS.qty) +
        textStart(formatMoney(bill.tvalue), COLUMN_WIDTHS.value) +
        textStart(formatMoney(bill.tdiscount), COLUMN_WIDTHS.disc) +
        textStart(formatMoney(bill.ttvalue), COLUMN_WIDTHS.tvalue),
    )
    .bold(false)
    .rule({ style: 'single' });

  encoder
    .align('center')
    .text(centerText('DISC/ROUND OFF(+/-)', 38) + textStart(billDiscountText, 10))
    .newline(2);

    
  if (redeemedPoints > 0 || couponDiscount > 0) {
    encoder.align('center');
        encoder.newline(1);
    if (redeemedPoints > 0) {
      encoder.text(`Points Redeemed: ${formatSavingsMoney(redeemedPoints)}`).newline(1);
    }
    if (couponDiscount > 0) {
      encoder.text(`Coupon Discount: ${formatMoney(couponDiscount)}`).newline(1);
    }
    encoder.newline(1);
  }

  encoder
    .bold(true)
    .align('center')
    .size(2, 2)
    .text(` GRAND TOTAL: ${formatMoney(bill.grandTotal)}`)
    .bold(false)
    .size(1, 1)
    .newline(1);


  encoder
    .rule({ style: 'single' })
    .size(2, 2)
    .bold(true)
    .invert(true)
    .align('center')
    .text(centerText(savingsText, 48))
    .bold(false)
    .invert(false)
    .size(1, 1)
    .newline(1)
    .rule({ style: 'single' })
    .newline(1);

  // ── Tax summary table (boxed, below savings) ─────────────────────────────
  const taxGroups: Record<number, number> = {};
  (bill.entries || []).forEach((item: any) => {
    const rate = Number(item.tax || 0);
    if (!rate) return;
    taxGroups[rate] = (taxGroups[rate] || 0) + Number(item.tvalue || 0);
  });
  const taxRates = Object.keys(taxGroups).map(Number).sort((a, b) => a - b);
  if (taxRates.length > 0) {
    const C = { tax: 6, sgst: 14, cgst: 14, total: 14 };
    encoder
      .rule({ style: 'double' })
      .bold(true)
      .invert(true)
      .align('center')
      .text('TAX SUMMARY')
      .invert(false)
      .bold(false)
      .newline(1)
      .align('left')
      .text(
        textStart('TAX', C.tax) +
        textStart('SGST', C.sgst) +
        textStart('CGST', C.cgst) +
        textStart('TOTAL', C.total),
      )
      .rule({ style: 'single' });

    taxRates.forEach((rate) => {
      const lineVal = taxGroups[rate];
      const taxAmt = bill.isTaxIncluded
        ? lineVal - lineVal / (1 + rate / 100)
        : lineVal * (rate / 100);
      const half = taxAmt / 2;
      encoder.text(
        textStart(`${rate}%`, C.tax) +
        textStart(formatMoney(half), C.sgst) +
        textStart(formatMoney(half), C.cgst) +
        textStart(formatMoney(taxAmt), C.total),
      );
    });
    encoder.rule({ style: 'double' }).newline(1);
  }

  if (upiPayment && bill.upiId) {
    const payeeName = encodeURIComponent(bill.companyName || 'Merchant');
    const amount = Number(upiPayment.amount || 0).toFixed(2);
    const qrLink = `upi://pay?pa=${encodeURIComponent(bill.upiId)}&pn=${payeeName}&am=${amount}&cu=INR`;
    encoder
      .align('center')
      .newline(1)
      .text('Scan to pay via UPI')
      .newline(2)
      .qrcode(qrLink, { model: 2, size: 8, errorlevel: 'm' })
      .align('left')
      .newline(1);
  }

  encoder
    .align('center')
    .text(bill.thankYouNote || '')
    .newline(1)
    .text(bill.returnPolicy || '')
    .text(bill.refundPolicy || '')
    .newline(2)
    .text(`Customer care: +91 ${bill.phone || ''}`)
    .newline(2);

  // End the main bill first so earned coupons print on a separate slip.
  encoder
    .newline(4)
    .cut();

  appendGeneratedCoupons(encoder, bill);

  if (Array.isArray(bill.generatedCoupons) && bill.generatedCoupons.length) {
    encoder
      .newline(8)
      .cut();
  }

  return encoder.encode();
}

// ─── Column widths for report (48-char paper) ────────────────────────────────
const REPORT_COL = { label: 28, value: 20 };
const REPORT_EXP = { cat: 12, user: 12, note: 14, amt: 10 };

function fmtAmt(val: number): string {
  return `Rs.${Number(val || 0).toFixed(2)}`;
}

function reportRow(label: string, value: number, encoder: any) {
  encoder
    .text(textStart(label, REPORT_COL.label) + textStart(fmtAmt(value), REPORT_COL.value))
    .newline(1);
}

function sectionHeader(title: string, encoder: any) {
  encoder
    .align('center')
    .bold(true)
    .text(title)
    .newline(1)
    .bold(false)
    .align('left')
    .rule({ style: 'single' });
}

export function buildReportReceiptBytes(r: any): Uint8Array {
  const encoder = new ReceiptPrinterEncoder({ newlineBeforeCut: 8, columns: 48 });
  encoder.initialize();

  // ── Header ────────────────────────────────────────────────────────────────
  encoder
    .align('center').bold(true).size(2, 2).text(r.companyName || '').newline(1)
    .bold(false).size(1, 1).rule({ style: 'single' })
    .align('left').text(`Date: ${r.dateRange}`).newline(1)
    .rule({ style: 'single' });

  // ── Opening & Closing Balance ─────────────────────────────────────────────
  const opening = r.balances?.opening || {};
  const hasOpening = (opening.cash || 0) + (opening.bank || 0) > 0;
  const hasClosing = (r.balances?.cashBalance || 0) + (r.balances?.bankBalance || 0) > 0;
  if (hasOpening || hasClosing) {
    sectionHeader('BALANCE', encoder);
    if (hasOpening) {
      reportRow('Opening Cash', opening.cash || 0, encoder);
      reportRow('Opening Bank', opening.bank || 0, encoder);
    }
    if (hasClosing) {
      reportRow('Closing Cash', r.balances?.cashBalance || 0, encoder);
      reportRow('Closing Bank', r.balances?.bankBalance || 0, encoder);
      reportRow('Total Balance', r.balances?.totalBalance || 0, encoder);
    }
    encoder.rule({ style: 'single' });
  }

  // ── Sales Breakdown ───────────────────────────────────────────────────────
  const sales = r.salesByPaymentMethod || {};
  const salesTotal = r.totalSales || 0;
  if (salesTotal > 0) {
    sectionHeader('SALES BREAKDOWN', encoder);
    reportRow('Total Sales', salesTotal, encoder);
    if (sales.Cash) reportRow('  Cash', sales.Cash, encoder);
    if (sales.UPI) reportRow('  UPI', sales.UPI, encoder);
    if (sales.Card) reportRow('  Card', sales.Card, encoder);
    if (sales.Credit) reportRow('  Credit', sales.Credit, encoder);
    encoder.rule({ style: 'single' });
  }

  // ── Credit Bills ─────────────────────────────────────────────────────────
  const creditBills: any[] = r.creditBills || [];
  if (creditBills.length > 0) {
    sectionHeader('CREDIT BILLS', encoder);
    encoder
      .text(textStart('ACCOUNT', 22) + textStart('INV', 12) + textStart('AMT', 14))
      .newline(1)
      .rule({ style: 'single' });
    creditBills.forEach((b: any) => {
      encoder
        .text(textStart(b.accountName || '', 22) + textStart(b.invoiceNumber || '', 12) + textStart(fmtAmt(b.amount || 0), 14))
        .newline(1);
    });
    encoder.rule({ style: 'single' });
  }

  // ── Expense Breakdown ─────────────────────────────────────────────────────
  const exp = r.expensesByPaymentMethod || {};
  const expTotal = r.totalExpenses || 0;
  if (expTotal > 0) {
    sectionHeader('EXPENSE BREAKDOWN', encoder);
    reportRow('Total Expenses', expTotal, encoder);
    if (exp.Cash) reportRow('  Cash', exp.Cash, encoder);
    if (exp.UPI) reportRow('  UPI', exp.UPI, encoder);
    if (exp.Card) reportRow('  Card', exp.Card, encoder);
    if (exp.BankTransfer) reportRow('  Bank', exp.BankTransfer, encoder);
    if (exp.Cheque) reportRow('  Cheque', exp.Cheque, encoder);
    encoder.rule({ style: 'single' });
  }

  // ── Distributor Purchase ──────────────────────────────────────────────────
  const pur = r.purchaseExpensesByPaymentMethod || {};
  const purTotal = r.totalPurchaseExpense || 0;
  if (purTotal > 0) {
    sectionHeader('DISTRIBUTOR PURCHASE', encoder);
    reportRow('Total Purchase', purTotal, encoder);
    if (pur.Cash) reportRow('  Cash', pur.Cash, encoder);
    if (pur.UPI) reportRow('  UPI', pur.UPI, encoder);
    if (pur.Card) reportRow('  Card', pur.Card, encoder);
    if (pur.BankTransfer) reportRow('  Bank', pur.BankTransfer, encoder);
    if (pur.Cheque) reportRow('  Cheque', pur.Cheque, encoder);
    encoder.rule({ style: 'single' });
  }

  // ── Account Transfers ─────────────────────────────────────────────────────
  const salaryRows: any[] = r.salaryPayments || [];
  if (salaryRows.length > 0) {
    sectionHeader('SALARY GIVEN', encoder);
    encoder
      .text(textStart('STAFF', 20) + textStart('MODE', 10) + textStart('AMT', 14))
      .newline(1);
    salaryRows.forEach((s: any) => {
      encoder
        .text(textStart(s.userName || 'Staff', 20) + textStart(s.paymentMode || '-', 10) + textStart(fmtAmt(s.amount || 0), 14))
        .newline(1);
    });
    encoder.rule({ style: 'single' });
  }

  const transferRows: any[] = r.transfersDisplay || [];
  const hasTransfers = transferRows.some(t => (t.debit || 0) + (t.credit || 0) > 0);
  if (hasTransfers) {
    sectionHeader('ACCOUNT TRANSFERS', encoder);
    encoder
      .text(textStart('ACCOUNT', 20) + textStart('DEBIT', 14) + textStart('CREDIT', 14))
      .newline(1);
    transferRows.forEach((t: any) => {
      if ((t.debit || 0) + (t.credit || 0) === 0) return;
      encoder
        .text(textStart(t.name || '', 20) + textStart(fmtAmt(t.debit || 0), 14) + textStart(fmtAmt(t.credit || 0), 14))
        .newline(1);
    });
    encoder.rule({ style: 'single' });
  }

  // ── Money Transactions ────────────────────────────────────────────────────
  const tx = r.transactions || {};
  const cashTx = tx.cash || {};
  const bankTx = tx.bank || {};
  const hasTx = (cashTx.debit || 0) + (cashTx.credit || 0) + (bankTx.debit || 0) + (bankTx.credit || 0) > 0;
  if (hasTx) {
    sectionHeader('MONEY TRANSACTIONS', encoder);
    encoder
      .text(textStart('', 14) + textStart('DEBIT', 12) + textStart('CREDIT', 12) + textStart('NET', 10))
      .newline(1);
    if ((cashTx.debit || 0) + (cashTx.credit || 0) > 0) {
      encoder
        .text(textStart('Cash', 14) + textStart(fmtAmt(cashTx.debit || 0), 12) + textStart(fmtAmt(cashTx.credit || 0), 12) + textStart(fmtAmt(cashTx.net || 0), 10))
        .newline(1);
    }
    if ((bankTx.debit || 0) + (bankTx.credit || 0) > 0) {
      encoder
        .text(textStart('Bank', 14) + textStart(fmtAmt(bankTx.debit || 0), 12) + textStart(fmtAmt(bankTx.credit || 0), 12) + textStart(fmtAmt(bankTx.net || 0), 10))
        .newline(1);
    }
    encoder.rule({ style: 'single' });
  }

  // ── Expense Details ───────────────────────────────────────────────────────
  const expenses: any[] = r.expenses || [];
  if (expenses.length > 0) {
    sectionHeader('EXPENSE DETAILS', encoder);
    encoder
      .text(
        textStart('CATEGORY', REPORT_EXP.cat) +
        textStart('USER', REPORT_EXP.user) +
        textStart('NOTE', REPORT_EXP.note) +
        textStart('AMT', REPORT_EXP.amt)
      )
      .newline(1)
      .rule({ style: 'single' });
    expenses.forEach((item: any) => {
      renderExpenseRow(encoder, [
        { text: item.expensecategory?.name || '', width: REPORT_EXP.cat },
        { text: item.userName || '', width: REPORT_EXP.user },
        { text: item.note || '', width: REPORT_EXP.note },
        { text: fmtAmt(item.totalAmount || 0), width: REPORT_EXP.amt },
      ]);
      encoder.newline(1);
    });
    encoder.rule({ style: 'single' });
  }

  encoder.newline(4).cut();
  return encoder.encode();
}

export function buildLabelPrintJobs(items: any[], printerLabelSize: string): Uint8Array[] {
  const labelSize = printerLabelSize?.toLowerCase().replace(/\s/g, '') || '50x25mm';
  const encoder = new TextEncoder();

  return (items || []).map((item) => {
    const {
      shopname = '',
      barcode = '',
      code = '',
      productName = '',
      name = '',
      sprice,
      dprice,
      size = '',
      brand = '',
    } = item;

    let tsplCommands = '';

    if (labelSize === '50x38mm') {
      tsplCommands = `
SIZE 50 mm,38 mm
GAP 1 mm,1 mm
DIRECTION 0
CLS

TEXT 30,18,"3",0,1,1,"${escapeLabelText(shopname)}"
BAR 30,48,410,2

TEXT 30,58,"2",0,1,1,"${escapeLabelText(productName)}"
TEXT 30,83,"2",0,1,1,"${escapeLabelText(name)}${size ? ` - ${escapeLabelText(size)}` : ''}"
TEXT 30,110,"2",0,1,1,"MRP Rs.${formatMoney(sprice)}"

${dprice != null ? `BAR 30,116,230,4` : ''}
${dprice != null ? `TEXT 30,136,"2",0,1,1,"Discount Rs.${formatMoney(dprice)}"` : ''}

TEXT 10,168,"1",0,1,1,"${escapeLabelText(code)}-${escapeLabelText(brand)}"
BARCODE 10,185,"128",80,0,0,3,3,"${escapeLabelText(barcode)}"
TEXT 10,270,"1",0,1,1,"${escapeLabelText(barcode)}"

PRINT 1,1
`;
    } else {
      tsplCommands = `
SIZE 50 mm,25 mm
GAP 3 mm,0 mm
DIRECTION 0
CLS

TEXT 10,5,"2",0,1,1,"${escapeLabelText(shopname)}"
BAR 0,25,380,2

TEXT 10,30,"1",0,1,1,"${escapeLabelText(productName)}"
TEXT 10,50,"1",0,1,1,"${escapeLabelText(name)}${size ? ` - ${escapeLabelText(size)}` : ''}"
TEXT 10,70,"1",0,1,1,"MRP Rs.${formatMoney(sprice)}"

${dprice != null ? `BAR 10,76,200,3` : ''}
${dprice != null ? `TEXT 10,90,"1",0,1,1,"Discount Rs.${formatMoney(dprice)}"` : ''}

TEXT 10,110,"1",0,1,1,"${escapeLabelText(code)}-${escapeLabelText(brand)}"
BARCODE 10,120,"128",60,0,0,2,2,"${escapeLabelText(barcode)}"
TEXT 10,185,"1",0,1,1,"${escapeLabelText(barcode)}"

PRINT 1,1
`;
    }

    return encoder.encode(`${tsplCommands}\r\n`);
  });
}
