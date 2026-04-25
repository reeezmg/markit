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

function textStart(text: unknown, width: number): string {
  const textStr = (text ?? ' ').toString();
  if (textStr.length >= width) return textStr;
  return textStr + ' '.repeat(width - textStr.length);
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
    .size(1, 1)
    .text(`${companyAddress.name || ''}, ${companyAddress.street || ''}`)
    .text(`${companyAddress.locality || ''}, ${companyAddress.city || ''}`)
    .text(`${companyAddress.state || ''}- ${companyAddress.pincode || ''}`)
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
        textStart('QTY', COLUMN_WIDTHS.qty) +
        textStart('MRP', COLUMN_WIDTHS.mrp) +
        textStart('VALUE', COLUMN_WIDTHS.value) +
        textStart('DISC', COLUMN_WIDTHS.disc) +
        textStart('T.VALUE', COLUMN_WIDTHS.tvalue),
    )
    .rule({ style: 'single' });

  (bill.entries || []).forEach((item: any, index: number) => {
    encoder.text(
      textStart((index + 1).toString(), COLUMN_WIDTHS.sl) +
        textStart(item.description || '', COLUMN_WIDTHS.description) +
        textStart(item.hsn || '', COLUMN_WIDTHS.hsn) +
        textStart(item.tax || '', COLUMN_WIDTHS.tax),
    );
    encoder.text(
      '    ' +
        textStart(item.qty || 0, COLUMN_WIDTHS.qty) +
        textStart(formatMoney(item.mrp), COLUMN_WIDTHS.mrp) +
        textStart(formatMoney(item.value), COLUMN_WIDTHS.value) +
        textStart(formatDiscountCell(item.discount), COLUMN_WIDTHS.disc) +
        textStart(formatMoney(item.tvalue), COLUMN_WIDTHS.tvalue),
    );
  });

  encoder
    .rule({ style: 'single' })
    .bold(true)
    .text(
      '    ' +
        textStart(bill.tqty || 0, COLUMN_WIDTHS.qty) +
        '          ' +
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

  if (upiPayment) {
    const qrLink = `upi://pay?pa=${bill.upiId}&am=${upiPayment.amount}&cu=INR`;
    encoder
      .newline(1)
      .text('Scan to pay via UPI')
      .newline(2)
      .qrcode(qrLink, { model: 1, size: 8, errorlevel: 'h' })
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
