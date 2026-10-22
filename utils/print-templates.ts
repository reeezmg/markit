import { labelBarcode } from './label-barcode';
import { z } from 'zod';
import { labelVariables, nestedLabelValue } from './label-variables';
import { receiptSummary } from './receipt-summary';
export const STANDARD_LABEL_ID = 'builtin:standard-product-label';
export const NO_TAX_RECEIPT_ID = 'builtin:no-tax-receipt';
export const CLASSIC_RECEIPT_ID = 'builtin:classic-tax-receipt';
export const tableColumnSchema = z.object({
  id: z.string().min(1).max(80), header: z.string().max(200), field: z.string().min(1).max(100).refine(key =>
    key === 'rowNumber' || /^entry\.(description|qty|mrp|value|discount|discountAmount|tax|tvalue|size|unit|barcode|hsn)$/.test(key) ||
    labelVariables.some(v => v.key === key && /^(product|variant|item)\./.test(key)) ||
    /^(product|variant)\.customFields\.[a-zA-Z0-9_-]+$/.test(key), 'Choose a supported table variable'),
  width: z.number().min(1).max(100), align: z.enum(['left', 'center', 'right']),
  line: z.number().int().min(1).max(3).optional(),
  total: z.boolean().optional(),
  totalLabel: z.string().max(40).optional(),
  suffix: z.string().max(20).optional(),
});
export type TableColumn = z.infer<typeof tableColumnSchema>;
export function defaultTableColumns(): TableColumn[] {
  return [
    { id: 'description', header: 'Description', field: 'entry.description', width: 46, align: 'left' },
    { id: 'qty', header: 'Qty', field: 'entry.qty', width: 12, align: 'right' },
    { id: 'rate', header: 'Rate', field: 'entry.mrp', width: 20, align: 'right' },
    { id: 'amount', header: 'Amount', field: 'entry.tvalue', width: 22, align: 'right' },
  ];
}

export const elementSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(['text', 'field', 'items', 'line', 'barcode', 'qrcode', 'logo', 'taxsummary', 'spacer']),
  text: z.string().max(2000).default(''),
  field: z.string().max(100).default(''),
  x: z.number().min(0).max(100), y: z.number().min(0).max(300),
  width: z.number().min(2).max(100), height: z.number().min(2).max(100),
  fontSize: z.number().min(6).max(32), bold: z.boolean(),
  align: z.enum(['left', 'center', 'right']),
  image: z.string().max(350000).regex(/^(data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+)?$/).default(''),
  columns: z.array(tableColumnSchema).min(1).max(12).optional(),
  tableBorders: z.boolean().optional(),
  tablePadding: z.number().min(0).max(3).optional(),
  tableItemGap: z.number().min(0).max(10).optional(),
  tableHeaderBold: z.boolean().optional(),
  tableRules: z.boolean().optional(),
  tableDashedRules: z.boolean().optional(),
  tableTotals: z.boolean().optional(),
  gapBefore: z.number().min(0).max(300).optional(),
  gapAfter: z.number().min(0).max(30).optional(),
  inverse: z.boolean().optional(),
  doubleLine: z.boolean().optional(),
  whenField: z.string().max(100).optional(),
  visibility: z.enum(['always', 'discount', 'no-discount']).optional(),
  strikeThrough: z.enum(['never', 'always', 'discount']).optional(),
});
export const templateSchema = z.object({
  id: z.string().min(1).max(80), name: z.string().trim().min(1).max(80),
  kind: z.enum(['receipt', 'label']),
  width: z.number().min(25).max(100), height: z.number().min(15).max(150),
  dpi: z.enum(['203', '300']),
  fontFamily: z.enum(['sans', 'thermal']).optional(),
  elements: z.array(elementSchema).min(1).max(40),
}).superRefine((t, ctx) => {
  if (new Set(t.elements.map(e => e.id)).size !== t.elements.length) ctx.addIssue({ code: 'custom', message: 'Element IDs must be unique' });
  for (const e of t.elements) {
    if (e.columns && new Set(e.columns.map(c => c.id)).size !== e.columns.length) ctx.addIssue({ code: 'custom', message: 'Table column IDs must be unique' });
    if (e.x + e.width > t.width || (t.kind === 'label' && e.y + e.height > t.height))
      ctx.addIssue({ code: 'custom', message: 'Elements must fit inside the paper dimensions' });
    if (t.kind === 'label' && ['items', 'taxsummary', 'spacer'].includes(e.type)) ctx.addIssue({ code: 'custom', message: 'Tables and spacers are only available on receipts' });
  }
});
export const printSettingsSchema = z.object({
  version: z.literal(1), templates: z.array(templateSchema).max(12),
  receiptId: z.string().nullable(), labelId: z.string().nullable(),
}).superRefine((s, ctx) => {
  if (s.templates.some(t => t.id.startsWith('builtin:'))) ctx.addIssue({ code: 'custom', message: 'Built-in template IDs are reserved' });
  if (new Set(s.templates.map(t => t.id)).size !== s.templates.length) ctx.addIssue({ code: 'custom', message: 'Template IDs must be unique' });
  for (const kind of ['receipt', 'label'] as const) {
    const id = s[`${kind}Id`];
    if (id && !(kind === 'receipt' && [NO_TAX_RECEIPT_ID, CLASSIC_RECEIPT_ID].includes(id)) && !(kind === 'label' && id === STANDARD_LABEL_ID) && !s.templates.some(t => t.id === id && t.kind === kind)) ctx.addIssue({ code: 'custom', message: `Select an existing ${kind} template` });
  }
});
export type PrintElement = z.infer<typeof elementSchema>;
export type PrintTemplate = z.infer<typeof templateSchema>;
export type PrintSettings = z.infer<typeof printSettingsSchema>;
export const emptyPrintSettings = (): PrintSettings => ({ version: 1, templates: [], receiptId: null, labelId: null });
export function activeTemplate(settings: PrintSettings, kind: 'receipt' | 'label') {
  if (kind === 'label' && settings.labelId === STANDARD_LABEL_ID) return standardLabelTemplate();
  if (kind === 'receipt' && settings.receiptId === NO_TAX_RECEIPT_ID) return noTaxReceiptTemplate();
  if (kind === 'receipt' && settings.receiptId === CLASSIC_RECEIPT_ID) return classicReceiptTemplate();
  return settings.templates.find(t => t.id === settings[`${kind}Id`] && t.kind === kind) || null;
}
export function noTaxReceiptTemplate(): PrintTemplate {
  return { ...taxlessReceiptTemplate(), id: NO_TAX_RECEIPT_ID, name: 'No Tax Receipt' };
}
export const receiptFields = ['companyName', 'companyAddress', 'gstin', 'invoiceNumber', 'date', 'paymentMethod', 'clientName', 'clientPhone', 'subtotal', 'grandTotal', 'tqty', 'tdiscount', 'thankYouNote', 'returnPolicy', 'refundPolicy', 'phone', 'upiId', 'upiPayment', 'availablePoints', 'redeemedPoints', 'couponValue', 'receiptDate', 'receiptDiscount', 'receiptSavings', 'receiptUpiPayment'];
export const labelFields = ['shopname', 'productName', 'brand', 'name', 'size', 'code', 'sprice', 'dprice', 'barcode', 'labelVariantSize'];
export function newElement(type: PrintElement['type'], width: number): PrintElement {
  return { id: globalThis.crypto.randomUUID(), type, text: type === 'text' ? 'Your text' : '', field: '', x: 2, y: 2, width: type === 'qrcode' ? 20 : width - 4, height: type === 'barcode' ? 14 : type === 'qrcode' ? 20 : type === 'items' ? 20 : 8, fontSize: 10, bold: false, align: 'left', image: '', ...(type === 'items' ? { columns: defaultTableColumns(), tableBorders: true, tablePadding: 0.5 } : {}) };
}
export function defaultTemplate(kind: 'receipt' | 'label'): PrintTemplate {
  if (kind === 'receipt') return { ...classicReceiptTemplate(), id: globalThis.crypto.randomUUID() };
  return originalLabelTemplate();
}

export function standardLabelTemplate(): PrintTemplate {
  return { ...originalLabelTemplate(), id: STANDARD_LABEL_ID, name: 'Standard Label' };
}

/** Editable counterpart of the original 50 x 38 mm TSPL label. */
export function originalLabelTemplate(): PrintTemplate {
  const make = (type: PrintElement['type'], field: string, text: string, y: number, height: number, fontSize = 8, bold = false): PrintElement => ({ ...newElement(type, 50), field, text, y, height, fontSize, bold, align: 'left' });
  return { id: globalThis.crypto.randomUUID(), name: 'My label', kind: 'label', width: 50, height: 38, dpi: '203', fontFamily: 'thermal', elements: [
    make('field', 'shopname', '', 1, 5, 11, true),
    make('line', '', '', 5, 2),
    make('field', 'productName', '', 7, 3.5),
    make('field', 'labelVariantSize', '', 11, 3.5),
    { ...make('field', 'sprice', 'MRP Rs.', 15, 3.5), strikeThrough: 'discount' },
    { ...make('field', 'dprice', 'Discount Rs.', 19, 3.5), visibility: 'discount' },
    make('field', 'code', '', 23, 3, 7),
    make('barcode', 'barcode', '', 26, 10),
  ] };
}

export function labelHasDiscount(data: any): boolean {
  const mrp = data?.sprice ?? data?.variant?.sprice;
  const discounted = Object.prototype.hasOwnProperty.call(data || {}, 'dprice') ? data.dprice : data?.variant?.dprice;
  if (mrp == null || mrp === '' || discounted == null || discounted === '') return false;
  return Number.isFinite(Number(mrp)) && Number.isFinite(Number(discounted)) && Number(discounted) >= 0 && Number(discounted) < Number(mrp);
}
export function elementIsVisible(element: PrintElement, data: any): boolean {
  if (element.whenField && !fieldValue(data, element.whenField)) return false;
  return element.visibility === 'discount' ? labelHasDiscount(data) : element.visibility === 'no-discount' ? !labelHasDiscount(data) : true;
}
export function elementIsStruck(element: PrintElement, data: any): boolean {
  return element.strikeThrough === 'always' || element.strikeThrough === 'discount' && labelHasDiscount(data);
}

export function twoLineTableColumns(): TableColumn[] {
  return [
    { id: 'sl', header: 'SL', field: 'rowNumber', width: 8, align: 'left', line: 1 },
    { id: 'description', header: 'DESCRIPTION', field: 'entry.description', width: 54, align: 'left', line: 1 },
    { id: 'hsn', header: 'HSN', field: 'entry.hsn', width: 25, align: 'left', line: 1 },
    { id: 'tax', header: 'TAX', field: 'entry.tax', width: 13, align: 'left', line: 1, suffix: '%' },
    { id: 'mrp', header: 'MRP', field: 'entry.mrp', width: 20, align: 'left', line: 2, total: true },
    { id: 'qty', header: 'QTY', field: 'entry.qty', width: 8, align: 'left', line: 2, total: true },
    { id: 'value', header: 'VALUE', field: 'entry.value', width: 22, align: 'left', line: 2, total: true },
    { id: 'discount', header: 'DISC', field: 'entry.discount', width: 20, align: 'left', line: 2, total: true, suffix: '%' },
    { id: 'tvalue', header: 'T.VALUE', field: 'entry.tvalue', width: 30, align: 'left', line: 2, total: true },
  ];
}
export function classicReceiptTemplate(): PrintTemplate {
  const make = (type: PrintElement['type'], options: Partial<PrintElement> = {}): PrintElement => ({ ...newElement(type, 72), height: 3, fontSize: 9, gapAfter: 0, ...options });
  const rule = (doubleLine = false) => make('line', { height: 2, doubleLine });
  const space = (height: number) => make('spacer', { height });
  const elements = [
    make('field', { field: 'companyName', fontSize: 16, height: 6, align: 'center' }),
    make('field', { field: 'companyAddress', height: 5, align: 'center' }),
    make('field', { field: 'gstin', text: 'GSTIN:', height: 5, align: 'center' }), rule(),
    make('field', { field: 'invoiceNumber', text: 'Invoice: #' }),
    make('field', { field: 'receiptDate', text: 'Date  : ' }),
    make('field', { field: 'paymentMethod', text: 'Payment Method: ' }), rule(),
    make('items', { columns: twoLineTableColumns(), tableBorders: false, tableHeaderBold: false, tablePadding: 0, tableRules: true, tableItemGap: 3, tableTotals: true, height: 12 }),
    make('field', { field: 'receiptDiscount', text: 'DISC/ROUND OFF(+/-)          ', height: 7, align: 'center' }),
    make('field', { field: 'grandTotal', text: 'GRAND TOTAL: ', height: 7, fontSize: 18, align: 'center' }), rule(),
    make('field', { field: 'receiptSavings', text: 'SAVINGS: ', height: 7, fontSize: 17, align: 'center', inverse: true }), rule(), space(6),
    make('taxsummary', { height: 15 }), space(8),
    make('text', { text: 'Scan to pay via UPI', height: 7, align: 'center', whenField: 'receiptUpiPayment' }),
    make('qrcode', { field: 'receiptUpiPayment', width: 48, x: 12, height: 48, whenField: 'receiptUpiPayment' }),
    space(6), make('field', { field: 'thankYouNote', align: 'center', height: 6 }),
    space(12), make('field', { field: 'phone', text: 'Customer care: ', align: 'center', height: 6 }),
  ];
  elements.forEach((element, index) => { element.id = `classic-${index}`; });
  return { id: CLASSIC_RECEIPT_ID, name: 'Tax Receipt', kind: 'receipt', width: 72, height: 100, dpi: '203', fontFamily: 'thermal', elements };
}

export function taxlessReceiptTemplate(): PrintTemplate {
  const template = classicReceiptTemplate();
  template.id = globalThis.crypto.randomUUID();
  template.name = 'Taxless Receipt';
  template.elements = template.elements.filter((element, index, all) => element.type !== 'taxsummary' && !(element.type === 'spacer' && all[index + 1]?.type === 'taxsummary'));
  const table = template.elements.find(element => element.type === 'items')!;
  table.columns = [
    { id: 'sl', header: 'SL', field: 'rowNumber', width: 7, align: 'left' },
    { id: 'description', header: 'DESCRIPTION', field: 'entry.description', width: 35, align: 'left', totalLabel: 'TOTAL' },
    { id: 'qty', header: 'QTY', field: 'entry.qty', width: 9, align: 'right', total: true },
    { id: 'mrp', header: 'MRP', field: 'entry.mrp', width: 16, align: 'right', total: true },
    { id: 'discount', header: 'DISC', field: 'entry.discountAmount', width: 15, align: 'right', total: true },
    { id: 'value', header: 'VALUE', field: 'entry.tvalue', width: 18, align: 'right', total: true },
  ];
  table.fontSize = 8;
  table.tableDashedRules = true;
  return template;
}

export function fieldValue(data: any, field: string): string {
  if (field === 'barcode') return labelBarcode(data);
  if (field === 'item.barcode') return labelBarcode({ barcode: data?.item?.barcode, item: { barcode: data?.barcode } });
  if (field === 'labelVariantSize') return [data.name ?? data.variantName ?? data.variant?.name, data.size ?? data.item?.size].filter(value => value != null && value !== '').join(' - ');
  if (field === 'receiptDiscount') return receiptSummary(data).discountText;
  if (field === 'receiptSavings') return String(Number(receiptSummary(data).savings.toFixed(2)));
  if (field === 'receiptDate') {
    const date = new Date(data.date);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).formatToParts(date);
    const get = (key: string) => parts.find(part => part.type === key)?.value || '';
    return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}`;
  }
  if (field === 'receiptUpiPayment') {
    const amount = String(data.paymentMethod).toLowerCase() === 'upi' ? data.grandTotal : String(data.paymentMethod).toLowerCase() === 'split' ? data.splitPayments?.find((p: any) => String(p.method).toLowerCase() === 'upi')?.amount : null;
    return amount != null ? fieldValue({ ...data, grandTotal: amount }, 'upiPayment') : '';
  }
  if (field === 'upiPayment') return data?.upiId ? `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent(data.companyName || '')}&am=${Number(data.grandTotal || 0).toFixed(2)}&cu=INR` : '';
  const value = nestedLabelValue(data, field);
  if (value == null) return '';
  if (field === 'companyAddress') return typeof value === 'string' ? value : ['name', 'street', 'locality', 'city', 'state', 'pincode'].map(k => value[k]).filter(Boolean).join(', ');
  const format = labelVariables.find(v => v.key === field)?.format;
  if (format === 'date') { const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-IN'); }
  if (format === 'money') return Number(value).toFixed(2);
  if (field === 'date') { const d = new Date(value as string); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('en-IN'); }
  if (['subtotal', 'grandTotal', 'tdiscount', 'sprice', 'dprice', 'couponValue'].includes(field)) return Number(value).toFixed(2);
  if (typeof value === 'object') return '';
  return String(value);
}

// Pure packing used by both ESC/POS receipt raster and TSPL label bitmap output.
export function monochromeBytes(rgba: Uint8ClampedArray, width: number, height: number, inverted = false) {
  const stride = Math.ceil(width / 8);
  const bytes = new Uint8Array(stride * height);
  if (inverted) bytes.fill(255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const dark = rgba[i + 3] > 127 && (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3 < 128;
    if (dark) { const mask = 128 >> (x % 8); if (inverted) bytes[y * stride + (x >> 3)] &= ~mask; else bytes[y * stride + (x >> 3)] |= mask; }
  }
  return bytes;
}
