import { designerPresentationFields, designerFonts, layerMargins } from './designer-presentation'
import { labelBarcode } from './label-barcode';
import { z } from 'zod';
import { labelVariables, nestedLabelValue } from './label-variables';
import { receiptSummary } from './receipt-summary';
import { documentTableStyleSchema } from './document-table';
import { barcodeFormats } from './print-codes';
import { applyDesignerRules, priceComparisonRule, type DesignerRule } from './designer-rules';
export const STANDARD_LABEL_ID = 'builtin:standard-product-label';
export const NO_TAX_RECEIPT_ID = 'builtin:no-tax-receipt';
export const CLASSIC_RECEIPT_ID = 'builtin:classic-tax-receipt';
export const tableColumnSchema = z.object({
  id: z.string().min(1).max(80), header: z.string().max(200), field: z.string().min(1).max(100).refine(key =>
    key === 'rowNumber' || /^tax\.(rate|sgst|cgst|total)$/.test(key) || /^entry\.(description|qty|mrp|value|discount|discountAmount|tax|tvalue|size|unit|barcode|hsn)$/.test(key) ||
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
export function defaultTaxTableColumns(): TableColumn[] {
  return [
    { id: 'rate', header: 'TAX', field: 'tax.rate', width: 13, align: 'left', suffix: '%', totalLabel: 'TOTAL' },
    { id: 'sgst', header: 'SGST', field: 'tax.sgst', width: 29, align: 'right', total: true },
    { id: 'cgst', header: 'CGST', field: 'tax.cgst', width: 29, align: 'right', total: true },
    { id: 'total', header: 'TOTAL', field: 'tax.total', width: 29, align: 'right', total: true },
  ];
}

export const elementSchema = z.object({
  ...designerPresentationFields,
  id: z.string().min(1).max(80),
  type: z.enum(['text', 'field', 'items', 'line', 'barcode', 'qrcode', 'logo', 'taxsummary', 'spacer', 'frame', 'shape']),
  parentId: z.string().min(1).max(80).optional(), name: z.string().max(80).optional(),
  locked: z.boolean().optional(), visible: z.boolean().optional(), groupId: z.string().max(80).optional(),
  rotation: z.number().min(-180).max(180).optional(), opacity: z.number().min(0).max(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), background: z.string().regex(/^(transparent|#[0-9a-fA-F]{6})$/).optional(),
  borderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), borderWidth: z.number().min(0).max(5).optional(), radius: z.number().min(0).max(100).optional(),
  shape: z.enum(['rectangle', 'ellipse']).optional(), fontFamily: z.enum(designerFonts).optional(),
  italic: z.boolean().optional(), underline: z.boolean().optional(), lineHeight: z.number().min(.5).max(4).optional(), letterSpacing: z.number().min(-50).max(200).optional(),
  imageFit: z.enum(['contain', 'cover']).optional(), flipX: z.boolean().optional(), flipY: z.boolean().optional(),
  text: z.string().max(2000).default(''),
  suffix: z.string().max(2000).optional(),
  heading: z.boolean().optional(), border: z.boolean().optional(),
  field: z.string().max(100).default(''),
  x: z.number().min(0).max(297), y: z.number().min(0).max(1400),
  width: z.number().min(2).max(297), height: z.number().min(2).max(297),
  placement: z.enum(['flow', 'absolute']).optional(),
  fontSize: z.number().min(6).max(32), bold: z.boolean(),
  align: z.enum(['left', 'center', 'right']),
  image: z.string().max(350000).regex(/^(data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+)?$/).default(''),
  columns: z.array(tableColumnSchema).min(1).max(12).optional(),
  taxColumns: z.array(tableColumnSchema).min(1).max(12).optional(),
  tableBorders: z.boolean().optional(),
  tablePadding: z.number().min(0).max(3).optional(),
  tableStyle: documentTableStyleSchema.optional(),
  tableItemGap: z.number().min(0).max(10).optional(),
  tableHeaderBold: z.boolean().optional(),
  tableRules: z.boolean().optional(),
  tableDashedRules: z.boolean().optional(),
  tableTotals: z.boolean().optional(),
  gapBefore: z.number().min(-300).max(300).optional(),
  gapAfter: z.number().min(0).max(30).optional(),
  inverse: z.boolean().optional(),
  doubleLine: z.boolean().optional(),
  barcodeFormat: z.enum(barcodeFormats).optional(),
  barcodeDisplayValue: z.boolean().optional(),
  whenField: z.string().max(100).optional(),
  visibility: z.enum(['always', 'discount', 'no-discount']).optional(),
  strikeThrough: z.enum(['never', 'always', 'discount']).optional(),
});
export const templateSchema = z.object({
  id: z.string().min(1).max(80), name: z.string().trim().min(1).max(80),
  kind: z.enum(['receipt', 'label']),
  width: z.number().min(25).max(216), height: z.number().min(15).max(297),
  paperSize: z.enum(['A4', 'A5', 'Letter']).optional(),
  dpi: z.enum(['203', '300']),
  fontFamily: z.enum(['sans', 'thermal']).optional(),
  elements: z.array(elementSchema).min(1).max(40),
}).superRefine((t, ctx) => {
  if (t.kind === 'label' && (t.width > 100 || t.height > 150 || t.paperSize)) ctx.addIssue({ code: 'custom', message: 'Labels must be at most 100 x 150 mm' });
  const paper = t.paperSize && ({ A4: [210, 297], A5: [148, 210], Letter: [216, 279] } as const)[t.paperSize];
  if (t.kind === 'receipt' && (paper ? t.width !== paper[0] || t.height !== paper[1] : t.width > 100)) ctx.addIssue({ code: 'custom', message: 'Choose a standard sheet size or a thermal width up to 100 mm' });
  if (new Set(t.elements.map(e => e.id)).size !== t.elements.length) ctx.addIssue({ code: 'custom', message: 'Element IDs must be unique' });
  for (const e of t.elements) {
    const autoText = ['text', 'field'].includes(e.type) && ['auto-width', 'auto-height'].includes(e.resizeMode || '');
    const checkedWidth = autoText && e.resizeMode === 'auto-width' ? 0 : e.width, checkedHeight = autoText ? 0 : e.height;
    const [mt, mr, mb, ml] = printElementMargins(e, t.kind === 'receipt' && !e.parentId && e.placement !== 'absolute');
    const left = e.x + ml, top = e.y + mt, right = left + checkedWidth + Math.max(0, mr), bottom = top + checkedHeight + Math.max(0, mb);
    if (e.parentId) {
      const parent = t.elements.find(p => p.id === e.parentId);
      if (!parent || parent.type !== 'frame') ctx.addIssue({ code: 'custom', message: 'Place nested layers inside a frame' });
      const seen = new Set([e.id]); let ancestor = parent, depth = 1;
      while (ancestor) {
        if (seen.has(ancestor.id) || ++depth > 8) { ctx.addIssue({ code: 'custom', message: 'Frames must form a tree with at most eight levels' }); break; }
        seen.add(ancestor.id); ancestor = t.elements.find(p => p.id === ancestor?.parentId);
      }
      if (parent && (left < 0 || top < 0 || right > parent.width + .01 || bottom > parent.height + .01)) ctx.addIssue({ code: 'custom', message: 'Place child layers and margins inside their frame' });
    }
    if (e.placement === 'absolute' && t.paperSize && (top < 0 || bottom > t.height)) ctx.addIssue({ code: 'custom', message: 'Place fixed layers inside the first sheet' });
    if (t.kind === 'label' && (e.width > 100 || e.height > 100)) ctx.addIssue({ code: 'custom', message: 'Label boxes must be at most 100 mm' });
    for (const columns of [e.columns, e.taxColumns]) if (columns && new Set(columns.map(c => c.id)).size !== columns.length) ctx.addIssue({ code: 'custom', message: 'Table column IDs must be unique' });
    if (!e.parentId && (left < 0 || right > t.width || (t.kind === 'label' && (top < 0 || bottom > t.height))))
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
export function printElementMargins(element: Pick<PrintElement, 'margin' | 'marginSides' | 'gapBefore' | 'gapAfter'>, flowing = false): [number, number, number, number] {
  return layerMargins(element, flowing ? [element.gapBefore ?? 0, 0, element.gapAfter ?? 1, 0] : [0, 0, 0, 0]);
}
/** Keep old receipt gaps readable until the layer uses the four-sided margin controls. */
export function setPrintFlowTop(element: PrintElement, value: number) {
  if (element.margin === undefined && !element.marginSides) { element.gapBefore = value; return; }
  const [, right, bottom, left] = printElementMargins(element, true);
  element.marginSides = { top: value, right, bottom, left }; delete element.margin; delete element.gapBefore; delete element.gapAfter;
}
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
export const receiptFields = ['companyName', 'companyAddress', 'gstin', 'invoiceNumber', 'date', 'paymentMethod', 'clientName', 'clientPhone', 'subtotal', 'grandTotal', 'tqty', 'tdiscount', 'thankYouNote', 'returnPolicy', 'refundPolicy', 'phone', 'upiId', 'upiPayment', 'availablePoints', 'redeemedPoints', 'couponValue', 'receiptDate', 'receiptDiscount', 'receiptSavings', 'receiptUpiPayment', 'receiptTaxGroups'];
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

/** Standard 50 x 38 mm label built exclusively from editable linked text, line and code tools. */
export function originalLabelTemplate(): PrintTemplate {
  const make = (type: PrintElement['type'], field: string, text: string, y: number, height: number, fontSize = 8, bold = false): PrintElement => ({ ...newElement(type, 50), field, text, y, height, fontSize, bold, align: 'left',
    ...(['field', 'text'].includes(type) ? { fontFamily: 'Arial', lineHeight: 1.15, color: '#000000', resizeMode: 'fixed' } as const : {}) });
  return { id: globalThis.crypto.randomUUID(), name: 'My label', kind: 'label', width: 50, height: 38, dpi: '203', fontFamily: 'sans', elements: [
    make('field', 'shopname', '', 1.5, 4.5, 10, true),
    { ...make('line', '', '', 5.5, 2), background: '#000000' },
    make('field', 'productName', '', 8, 4, 8.5),
    make('field', 'labelVariantSize', '', 12, 3.5, 7.5),
    { ...make('field', 'sprice', 'MRP Rs. ', 16, 3.5, 7.5), rules: [priceComparisonRule('strike')] },
    { ...make('field', 'dprice', 'Price Rs. ', 20, 4, 8.5, true), rules: [priceComparisonRule('show')] },
    make('field', 'code', '', 24, 3, 6.5),
    { ...make('barcode', 'barcode', '', 27.5, 6.5), barcodeFormat: 'CODE128', barcodeDisplayValue: false },
    { ...make('field', 'barcode', '', 34.5, 3, 7), name: 'Barcode value', align: 'center' },
  ] };
}

export function labelHasDiscount(data: any): boolean {
  const mrp = data?.sprice ?? data?.variant?.sprice;
  const discounted = Object.prototype.hasOwnProperty.call(data || {}, 'dprice') ? data.dprice : data?.variant?.dprice;
  if (mrp == null || mrp === '' || discounted == null || discounted === '') return false;
  return Number.isFinite(Number(mrp)) && Number.isFinite(Number(discounted)) && Number(discounted) >= 0 && Number(discounted) < Number(mrp);
}
export function elementIsVisible(element: PrintElement, data: any): boolean {
  return effectivePrintElement(element, data).visible !== false;
}
export function elementIsStruck(element: PrintElement, data: any): boolean {
  return !!effectivePrintElement(element, data).strike;
}
/** Old saved properties are exposed through the same rules UI without rewriting preferences on load. */
export function printElementRules(element: PrintElement): DesignerRule[] {
  const rules = [...(element.rules || [])];
  if (element.whenField) rules.unshift({id:'legacy-field',match:'all',action:'show',conditions:[{field:element.whenField,operator:'filled',source:'value',value:''}]});
  if (element.visibility && element.visibility !== 'always') rules.push(priceComparisonRule(element.visibility === 'discount' ? 'show' : 'hide', 'legacy-visibility'));
  if (element.strikeThrough === 'discount') rules.push(priceComparisonRule('strike','legacy-strike'));
  return rules;
}
export function printConditionValue(data: any, key: string): unknown {
  if (['receiptTaxGroups','receiptSavings','receiptDiscount','receiptDate','receiptUpiPayment','upiPayment','labelVariantSize'].includes(key)) return fieldValue(data,key);
  if (['sprice','dprice'].includes(key)) return Object.prototype.hasOwnProperty.call(data || {},key) ? data[key] : data?.variant?.[key];
  const raw = nestedLabelValue(data,key);
  return raw !== undefined && (raw === null || typeof raw !== 'object') ? raw : fieldValue(data,key);
}
export function effectivePrintElement(element: PrintElement, data: any): PrintElement {
  const result = applyDesignerRules({...element, rules:printElementRules(element), strike: element.strike ?? element.strikeThrough === 'always'}, key => printConditionValue(data,key));
  delete result.whenField; delete result.visibility; delete result.strikeThrough;
  return result;
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
  const margin = (top = 0, bottom = 0) => ({ top, right: 0, bottom, left: 0 });
  const make = (type: PrintElement['type'], options: Partial<PrintElement> = {}): PrintElement => ({ ...newElement(type, 72), height: 4, fontSize: 9, marginSides: margin(), ...(['text', 'field'].includes(type) ? { resizeMode: 'auto-height' as const } : {}), ...options });
  const rule = (options: Partial<PrintElement> = {}) => make('line', { height: 2, background: '#000000', ...options });
  const taxVisible = { whenField: 'receiptTaxGroups' };
  const elements = [
    make('field', { field: 'companyName', fontSize: 16, height: 7, align: 'center' }),
    make('field', { field: 'companyAddress', height: 5, align: 'center' }),
    make('field', { field: 'gstin', text: 'GSTIN: ', height: 5, align: 'center' }), rule(),
    make('field', { field: 'invoiceNumber', text: 'Invoice: #' }),
    make('field', { field: 'receiptDate', text: 'Date: ' }),
    make('field', { field: 'paymentMethod', text: 'Payment Method: ' }), rule(),
    make('items', { columns: twoLineTableColumns(), tableStyle: { cellPadding: 0, fontSize: 9, headerFontSize: 9, verticalAlign: 'top', borderWidth: .2 }, tableBorders: false, tableHeaderBold: false, tablePadding: 0, tableRules: true, tableItemGap: 3, tableTotals: true, height: 12 }),
    make('field', { field: 'receiptDiscount', text: 'DISC/ROUND OFF: ', height: 7, align: 'center', marginSides: margin(2, 2) }),
    make('field', { field: 'grandTotal', text: 'GRAND TOTAL: ', height: 7, fontSize: 18, align: 'center' }), rule(),
    make('field', { field: 'receiptSavings', text: 'SAVINGS: ', height: 7, fontSize: 17, align: 'center', color: '#ffffff', background: '#000000', padding: .5 }), rule(),
    make('text', { text: 'TAX SUMMARY', align: 'center', color: '#ffffff', background: '#000000', padding: .4, marginSides: margin(6, 1), ...taxVisible }),
    make('taxsummary', { taxColumns: defaultTaxTableColumns(), tableStyle: { cellPadding: .4, fontSize: 9, headerFontSize: 9, verticalAlign: 'top', borderWidth: .2 }, tableBorders: false, tableHeaderBold: false, tableRules: true, tableItemGap: 0, tableTotals: false, height: 2, ...taxVisible }),
    rule({ ...taxVisible, marginSides: margin(0, 8) }),
    make('text', { text: 'Scan to pay via UPI', height: 7, align: 'center', marginSides: margin(0, 1), whenField: 'receiptUpiPayment' }),
    make('qrcode', { field: 'receiptUpiPayment', width: 48, x: 12, height: 48, whenField: 'receiptUpiPayment' }),
    make('field', { field: 'thankYouNote', align: 'center', height: 6, marginSides: margin(6) }),
    make('field', { field: 'phone', text: 'Customer care: ', align: 'center', height: 6, marginSides: margin(12) }),
  ];
  elements.forEach((element, index) => { element.id = `classic-${index}`; });
  return { id: CLASSIC_RECEIPT_ID, name: 'Tax Receipt', kind: 'receipt', width: 72, height: 100, dpi: '203', fontFamily: 'thermal', elements };
}

export function taxlessReceiptTemplate(): PrintTemplate {
  const template = classicReceiptTemplate();
  template.id = globalThis.crypto.randomUUID();
  template.name = 'Taxless Receipt';
  template.elements = template.elements.filter(element => element.type !== 'taxsummary' && element.whenField !== 'receiptTaxGroups');
  const table = template.elements.find(element => element.type === 'items')!;
  table.columns = [
    { id: 'sl', header: 'SL', field: 'rowNumber', width: 7, align: 'left' },
    { id: 'description', header: 'DESCRIPTION', field: 'entry.description', width: 35, align: 'left', totalLabel: 'TOTAL' },
    { id: 'qty', header: 'QTY', field: 'entry.qty', width: 9, align: 'right', total: true },
    { id: 'mrp', header: 'MRP', field: 'entry.mrp', width: 16, align: 'right', total: true },
    { id: 'discount', header: 'DISC', field: 'entry.discountAmount', width: 15, align: 'right', total: true },
    { id: 'value', header: 'VALUE', field: 'entry.tvalue', width: 18, align: 'right', total: true },
  ];
  table.fontSize = 8; table.tableStyle = { ...table.tableStyle, fontSize: 8, headerFontSize: 8 };
  table.tableDashedRules = true;
  return template;
}

/** The same resolved content is used by the inspector, raster output and static-text snapshots. */
export function printElementValue(element: Pick<PrintElement, 'type' | 'field' | 'text' | 'suffix'>, data: any): string {
  if (!element.field || !['field', 'barcode', 'qrcode'].includes(element.type)) return element.text;
  const value = fieldValue(data, element.field);
  return value ? element.text + value + (element.suffix || '') : '';
}

export function fieldValue(data: any, field: string): string {
  if (field === 'barcode') return labelBarcode(data);
  if (field === 'item.barcode') return labelBarcode({ barcode: data?.item?.barcode, item: { barcode: data?.barcode } });
  if (field === 'labelVariantSize') return [data.name ?? data.variantName ?? data.variant?.name, data.size ?? data.item?.size].filter(value => value != null && value !== '').join(' - ');
  if (field === 'receiptDiscount') return receiptSummary(data).discountText;
  if (field === 'receiptTaxGroups') return receiptSummary(data).tax.length ? String(receiptSummary(data).tax.length) : '';
  if (field === 'receiptSavings') return String(Number(receiptSummary(data).savings.toFixed(2)));
  if (field === 'receiptDate') {
    const date = new Date(data.date);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).formatToParts(date);
    const get = (key: string) => parts.find(part => part.type === key)?.value || '';
    return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}`;
  }
  if (field === 'receiptUpiPayment') {
    if (data.billingMode === 'invoice') return Number(data.balanceDue ?? data.grandTotal)>0 ? fieldValue(data,'upiPayment') : '';
    const amount = String(data.paymentMethod).toLowerCase() === 'upi' ? data.grandTotal : String(data.paymentMethod).toLowerCase() === 'split' ? data.splitPayments?.find((p: any) => String(p.method).toLowerCase() === 'upi')?.amount : null;
    return amount != null ? fieldValue({ ...data, grandTotal: amount }, 'upiPayment') : '';
  }
  if (field === 'upiPayment') {
    const amount=data.billingMode==='invoice'?Number(data.balanceDue??data.grandTotal):Number(data.grandTotal||0);
    return data?.upiId && (data.billingMode!=='invoice'||amount>0) ? `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent(data.companyName || '')}&am=${amount.toFixed(2)}&cu=INR` : '';
  }
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
