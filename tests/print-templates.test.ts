import { STANDARD_LABEL_ID } from '../utils/print-templates';
import { labelBarcodeModuleWidth, buildLabelPrintJobs } from '../composables/printCommands';
import { receiptPaperSizes, labelPaperSizes, resizePrintPaper } from '../utils/print-paper';
import { originalLabelTemplate, elementIsVisible, elementIsStruck, labelHasDiscount, templateSchema } from '../utils/print-templates';
import { getReceiptFinishing, saveReceiptFinishing, receiptFinishBytes, receiptBottomMarginMm, RECEIPT_FINISHING_KEY } from '../utils/receipt-finishing';
import { templatePrintBytes } from '../utils/print-template-renderer.client';
import { buildBillReceiptBytes, buildReportReceiptBytes } from '../composables/printCommands';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeTemplate, defaultTemplate, emptyPrintSettings, fieldValue, monochromeBytes, printSettingsSchema } from '../utils/print-templates';
import { cachePrintSettings, loadPrintTemplate } from '../utils/load-print-template.client';
import { labelVariables, customLabelVariables, labelSampleData } from '../utils/label-variables';
import { loadLabelVariables } from '../utils/load-label-variables.client';
import { readLabelVariables } from '../server/utils/labelVariables';
import { Prisma } from '@prisma/client';
import { resizeLabelBox, type ResizeHandle } from '../utils/label-box';
import { effectScope, nextTick, ref } from 'vue';
import { useDesignerHistory } from '../utils/designer-history';
import { NO_TAX_RECEIPT_ID, noTaxReceiptTemplate } from '../utils/print-templates';
import { noTaxReceiptLayout, noTaxReceiptDocument } from '../utils/no-tax-receipt';
import { createReceiptShare, verifyReceiptShare } from '../server/utils/receiptShare';
import { receiptPdfBuffer } from '../server/utils/receiptPdf';
import { tableCellValue, receiptTableFields } from '../utils/receipt-table';
import { loadReceiptTable } from '../utils/load-receipt-table.client';
import { classicReceiptTemplate, CLASSIC_RECEIPT_ID } from '../utils/print-templates';
import { receiptSummary } from '../utils/receipt-summary';
import { tableColumnLines, tableColumnTotal } from '../utils/receipt-table';
import { receiptPhotoFixture } from './receipt-photo-fixture';

test('photo receipt reproduces tax groups, totals, savings and payment data', () => {
  const summary = receiptSummary(receiptPhotoFixture);
  assert.deepEqual(summary.tax.map(t => [t.rate, t.sgst.toFixed(2), t.cgst.toFixed(2), t.total.toFixed(2)]), [[5, '5.95', '5.95', '11.90'], [12, '15.54', '15.54', '31.07']]);
  assert.equal(summary.savings, 0);
  assert.equal(summary.discountText, '0.00');
  assert.equal(fieldValue(receiptPhotoFixture, 'receiptDate'), '07-10-2026 04:59');
  const uri = new URL(fieldValue(receiptPhotoFixture, 'receiptUpiPayment'));
  assert.equal(uri.searchParams.get('pa'), 'preview@upi');
  assert.equal(uri.searchParams.get('am'), '540.00');
  assert.equal(fieldValue({ ...receiptPhotoFixture, upiId: '' }, 'receiptUpiPayment'), '');
  assert.equal(fieldValue({ ...receiptPhotoFixture, paymentMethod: 'Cash' }, 'receiptUpiPayment'), '');
  assert.equal(new URL(fieldValue({ ...receiptPhotoFixture, paymentMethod: 'Split', splitPayments: [{ method: 'UPI', amount: 200 }] }, 'receiptUpiPayment')).searchParams.get('am'), '200.00');
  assert.deepEqual(receiptSummary({ ...receiptPhotoFixture, isTaxIncluded: false }).tax.map(t => t.total.toFixed(2)), ['12.50', '34.80']);
});

test('photo receipt stores independent layout lines and totals in the second line', () => {
  const template = classicReceiptTemplate();
  const settings = { ...emptyPrintSettings(), receiptId: CLASSIC_RECEIPT_ID };
  assert.equal(printSettingsSchema.safeParse(settings).success, true);
  assert.equal(activeTemplate(settings, 'receipt')?.fontFamily, 'thermal');
  template.id = 'editable-copy';
  assert.equal(printSettingsSchema.safeParse({ ...emptyPrintSettings(), templates: [template] }).success, true);
  const columns = template.elements.find(e => e.type === 'items')!.columns!;
  const lines = tableColumnLines(columns);
  assert.deepEqual(lines.map(line => line.reduce((sum, c) => sum + c.width, 0)), [100, 100]);
  assert.deepEqual(lines.map(line => line.map(c => c.header)), [['SL', 'DESCRIPTION', 'HSN', 'TAX'], ['MRP', 'QTY', 'VALUE', 'DISC', 'T.VALUE']]);
  assert.deepEqual(lines[1].map(column => tableColumnTotal(receiptPhotoFixture.entries, column)), ['540.00', '2', '540.00', '0.00', '540.00']);
  const discount = columns.find(c => c.field === 'entry.discount')!;
  assert.equal(tableColumnTotal([{ mrp: 100, qty: 2, discount: '10%' }, { mrp: 100, qty: 2, discount: -5 }], discount), '30.00');
});

test('receipt tables persist column designs and preserve legacy items', () => {
  const receipt = defaultTemplate('receipt');
  const table = receipt.elements.find(e => e.type === 'items')!;
  table.columns![0].header = 'Product\nDescription';
  table.columns![0].field = 'product.brand.name';
  const settings = { ...emptyPrintSettings(), templates: [receipt] };
  const parsed = printSettingsSchema.parse(settings);
  assert.equal(parsed.templates[0].elements.find(e => e.type === 'items')!.columns![0].header, 'Product\nDescription');
  assert.deepEqual(receiptTableFields(receipt), ['product.brand.name']);
  table.columns![0].width = 0;
  assert.equal(printSettingsSchema.safeParse(settings).success, false);
  table.columns![0].width = 46;
  table.columns![0].field = 'product.__proto__.secret';
  assert.equal(printSettingsSchema.safeParse(settings).success, false);
  delete table.columns;
  assert.equal(printSettingsSchema.safeParse(settings).success, true);
});

test('receipt table cells preserve billed values and resolve related fields', () => {
  const entry = { qty: 0, mrp: 500, tvalue: 0, discount: '10%', product: { brand: { name: 'Brand A' }, customFields: { fabric: 'Cotton' } } };
  assert.equal(tableCellValue(entry, 'entry.qty', 2), '0');
  assert.equal(tableCellValue(entry, 'entry.tvalue', 2), '0.00');
  assert.equal(tableCellValue(entry, 'entry.discount', 2), '10%');
  assert.equal(tableCellValue(entry, 'rowNumber', 2), '3');
  assert.equal(tableCellValue(entry, 'product.brand.name', 0), 'Brand A');
  assert.equal(tableCellValue(entry, 'product.customFields.fabric', 0), 'Cotton');
  assert.equal(tableCellValue(entry, 'variant.name', 0), '');
});

test('shared receipt table values render offline without requesting private catalog data', async () => {
  const receipt = defaultTemplate('receipt');
  receipt.elements.find(e => e.type === 'items')!.columns![0].field = 'product.brand.name';
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  try {
    const result = await loadReceiptTable({ companyId: 'company-a', entries: [{ itemId: 'item-a', labelVariablesLoaded: true, receiptTableValues: { 'product.brand.name': 'Brand A' }, mrp: 500 }, { description: 'Manual service', mrp: 100 }] }, receipt);
    assert.equal(tableCellValue(result.entries[0], 'product.brand.name', 0), 'Brand A');
    assert.equal(result.entries[0].mrp, 500);
    assert.equal(tableCellValue(result.entries[1], 'product.brand.name', 1), '');
  } finally { if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor); else delete (globalThis as any).navigator; }
});

test('built-in receipt selection preserves original fallback and does not consume custom slots', () => {
  const settings = emptyPrintSettings();
  assert.equal(activeTemplate(settings, 'receipt'), null);
  settings.receiptId = NO_TAX_RECEIPT_ID;
  assert.equal(printSettingsSchema.safeParse(settings).success, true);
  assert.equal(activeTemplate(settings, 'receipt')?.name, 'No Tax Receipt');
  assert.equal(settings.templates.length, 0);
  settings.labelId = NO_TAX_RECEIPT_ID;
  assert.equal(printSettingsSchema.safeParse(settings).success, false);
});

test('no-tax receipt hides item tax details, preserves charged total, and escapes HTML', () => {
  const data = { companyName: '<script>alert(1)</script>', date: '2026-10-07T10:00:00Z', entries: [{ description: 'Shirt', qty: 1, mrp: 500, tax: 18, hsn: '6109', discount: '10%', tvalue: 531 }], tqty: 1, tvalue: 500, ttvalue: 531, tdiscount: 50, discount: '+2', grandTotal: 533 };
  const layout = noTaxReceiptLayout(data);
  const text = layout.marks.map(mark => mark.text || '').join('\n');
  assert.match(text, /GRAND TOTAL: 533.00/);
  assert.match(text, /YOUR SAVING: 48.00/);
  assert.match(text, /10%/);
  assert.doesNotMatch(text, /HSN|6109|Tax:|CGST|SGST/);
  assert.ok(layout.marks.every(mark => mark.x >= 0 && mark.x + mark.width <= layout.width && mark.y + mark.height <= layout.height));
  const html = noTaxReceiptDocument(data);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<article/);
});

test('built-in no-tax receipt uses Tax Receipt styling with six item columns and no tax summary', () => {
  const noTax = noTaxReceiptTemplate(), tax = classicReceiptTemplate();
  assert.equal(noTax.id, NO_TAX_RECEIPT_ID);
  assert.equal(noTax.fontFamily, tax.fontFamily);
  assert.equal(noTax.width, tax.width);
  assert.equal(noTax.dpi, tax.dpi);
  const expected = tax.elements.filter((e, i, all) => e.type !== 'items' && e.type !== 'taxsummary' && !(e.type === 'spacer' && all[i + 1]?.type === 'taxsummary'));
  assert.deepEqual(noTax.elements.filter(e => e.type !== 'items'), expected);
  const table = noTax.elements.find(e => e.type === 'items')!;
  assert.deepEqual(table.columns!.map(c => c.header), ['SL', 'DESCRIPTION', 'QTY', 'MRP', 'DISC', 'VALUE']);
  assert.equal(table.columns!.find(c => c.id === 'value')!.field, 'entry.tvalue');
  assert.equal(table.columns!.find(c => c.id === 'discount')!.field, 'entry.discountAmount');
  assert.equal(table.tableTotals, true);
  assert.equal(table.tableDashedRules, true);
  assert.equal(noTax.elements.some(e => e.type === 'taxsummary'), false);
});

test('receipt share tokens bind bill and company, reject tampering and expire', () => {
  const previous = process.env.RECEIPT_SHARE_SECRET;
  process.env.RECEIPT_SHARE_SECRET = 'test-only-signing-key-with-more-than-32-characters';
  try {
    const token = createReceiptShare('bill-a', 'company-a', 1000);
    assert.equal(verifyReceiptShare(token, 1001).billId, 'bill-a');
    assert.equal(verifyReceiptShare(token, 1001).companyId, 'company-a');
    assert.throws(() => verifyReceiptShare(token, 1000 + 31 * 86400000));
    const [payload, signature] = token.split('.');
    const altered = Buffer.from(Buffer.from(payload, 'base64url').toString().replace('company-a', 'company-b')).toString('base64url');
    assert.throws(() => verifyReceiptShare(`${altered}.${signature}`, 1001));
    assert.throws(() => verifyReceiptShare('not-a-token', 1001));
    const key = 'receipts/company-a/bill-a/123abc.pdf';
    assert.equal(verifyReceiptShare(createReceiptShare('bill-a', 'company-a', 1000, key), 1001).documentKey, key);
    assert.throws(() => verifyReceiptShare(createReceiptShare('bill-a', 'company-a', 1000, 'receipts/company-b/bill-a/123abc.pdf'), 1001));
  } finally {
    if (previous === undefined) delete process.env.RECEIPT_SHARE_SECRET;
    else process.env.RECEIPT_SHARE_SECRET = previous;
  }
});

test('receipt PDF uploads reject images, oversized payloads and invalid PDF content', () => {
  const pdf = Buffer.from('%PDF-1.3\nreceipt fixture\n%%EOF\n');
  for (const prefix of ['data:application/pdf;base64,', 'data:application/pdf;filename=receipt.pdf;base64,']) {
    assert.deepEqual(receiptPdfBuffer(prefix + pdf.toString('base64')), pdf);
  }
  for (const value of [undefined, '', 'data:image/png;base64,YWJj', 'data:application/pdf;base64,YWJj', 'a'.repeat(8 * 1024 * 1024 + 1)]) {
    assert.throws(() => receiptPdfBuffer(value));
  }
});

test('designer history batches gestures, restores edits, clears redo branches and resets', async () => {
  const scope = effectScope();
  const draft = ref({ text: 'Original', x: 0, width: 20, elements: ['a', 'b'] });
  const history = scope.run(() => useDesignerHistory(draft))!;
  draft.value.text = 'Edited';
  await nextTick();
  history.begin();
  for (let x = 1; x <= 10; x++) {
    draft.value.x = x; draft.value.width = 20 + x;
    await nextTick();
  }
  history.end();
  history.undo();
  assert.deepEqual(draft.value, { text: 'Edited', x: 0, width: 20, elements: ['a', 'b'] });
  history.undo();
  assert.equal(draft.value.text, 'Original');
  history.redo(); history.redo();
  assert.equal(draft.value.x, 10);
  draft.value.elements.splice(0, 1);
  history.undo(); // Pending watcher must be committed before undo.
  assert.deepEqual(draft.value.elements, ['a', 'b']);
  draft.value.text = 'New branch';
  await nextTick();
  assert.equal(history.canRedo.value, false);
  history.reset();
  await nextTick();
  assert.equal(history.canUndo.value, false);
  assert.equal(history.canRedo.value, false);
  scope.stop();
});

test('label resize keeps the opposite edges anchored for all eight handles', () => {
  const box = { x: 10, y: 10, width: 20, height: 10 }, paper = { width: 50, height: 38 };
  for (const handle of ['n','ne','e','se','s','sw','w','nw'] as ResizeHandle[]) {
    const resized = resizeLabelBox(box, handle, 3, 2, paper);
    assert.equal(resized.x, handle.includes('w') ? 13 : 10);
    assert.equal(resized.y, handle.includes('n') ? 12 : 10);
    assert.equal(resized.width, handle.includes('w') ? 17 : handle.includes('e') ? 23 : 20);
    assert.equal(resized.height, handle.includes('n') ? 8 : handle.includes('s') ? 12 : 10);
  }
});

test('label resize clamps to paper, enforces minimum size and supports fractional moves', () => {
  const box = { x: 10, y: 10, width: 20, height: 10 }, paper = { width: 50, height: 38 };
  assert.deepEqual(resizeLabelBox(box, 'se', 100, 100, paper), { x: 10, y: 10, width: 40, height: 28 });
  assert.deepEqual(resizeLabelBox(box, 'nw', -100, -100, paper), { x: 0, y: 0, width: 30, height: 20 });
  assert.deepEqual(resizeLabelBox(box, 'nw', 100, 100, paper), { x: 28, y: 18, width: 2, height: 2 });
  assert.deepEqual(resizeLabelBox(box, 'se', -100, -100, paper), { x: 10, y: 10, width: 2, height: 2 });
  assert.equal(resizeLabelBox(box, 's', 0, 0.14, paper).height, 10.1);
  assert.equal(resizeLabelBox(box, 's', 0, 200, { width: 50, height: 150 }).height, 100);
});

test('every label variable matches a real schema field and relation', () => {
  const roots: Record<string, string> = { company: 'Company', product: 'Product', variant: 'Variant', item: 'Item', distributor: 'Distributor', distributorCompany: 'DistributorCompany', purchaseorder: 'PurchaseOrder' };
  const models = Prisma.dmmf.datamodel.models;
  for (const variable of labelVariables) {
    const [root, ...parts] = variable.key.split('.');
    let model = models.find(m => m.name === roots[root]);
    for (const [i, part] of parts.entries()) {
      const field = model?.fields.find(f => f.name === part);
      assert.ok(field, `Missing schema field: ${variable.key}`);
      if (i < parts.length - 1) model = models.find(m => m.name === field.type);
      else assert.notEqual(field.kind, 'object', `Variable must be printable: ${variable.key}`);
    }
  }
});

test('related variables format values, preserve zero and safely handle absent relations', () => {
  const data = { company: { name: 'Branch A', address: { city: 'Kochi' } }, variant: { sprice: 0, sizeLabel: 'Shade' }, item: { size: 'Blue' }, distributor: null, product: { customFields: { fabric: 'Cotton' } } };
  assert.equal(fieldValue(data, 'company.address.city'), 'Kochi');
  assert.equal(fieldValue(data, 'variant.sprice'), '0.00');
  assert.equal(fieldValue(data, 'variant.sizeLabel'), 'Shade');
  assert.equal(fieldValue(data, 'item.size'), 'Blue');
  assert.equal(fieldValue(data, 'product.customFields.fabric'), 'Cotton');
  assert.equal(fieldValue(data, 'distributor.name'), '');
  assert.equal(fieldValue(data, 'company.__proto__.constructor'), '');
  const custom = customLabelVariables([{ scope: 'VARIANT', key: 'fabric', label: 'Fabric' }]);
  assert.equal(custom[0].key, 'variant.customFields.fabric');
  assert.equal(fieldValue(labelSampleData({}, custom), custom[0].key), 'Sample');
});

test('server label lookup scopes item, variant and product and excludes foreign linked records', async () => {
  let query: any;
  const db: any = { company: { findUnique: async (args: any) => { assert.deepEqual(args.where, { id: 'a' }); assert.equal(args.select.name, true); assert.equal(args.select.accountNo, undefined); return { name: 'Store A' }; } }, item: { findMany: async (args: any) => {
    query = args;
    return [{ id: 'item-a', barcode: '123', variant: { sizeLabel: 'Shade', brand: { name: 'Other brand', companyId: 'b' }, product: { name: 'Product A', category: { name: 'Category A', companyId: 'a' }, collection: { name: 'Other collection', companyId: 'b' }, purchaseorder: { companyId: 'b', distributorCompany: { companyId: 'b', distributor: { name: 'Other supplier' } } } } } }];
  } } };
  const [row] = await readLabelVariables(db, 'a', ['item-a'], []);
  assert.deepEqual(query.where, { companyId: 'a', variant: { companyId: 'a', product: { companyId: 'a' } }, OR: [{ id: { in: ['item-a'] } }, { barcode: { in: [] } }] });
  assert.equal(row.variables.product.category.name, 'Category A');
  assert.equal(row.variables.product.collection, null);
  assert.equal(row.variables.variant.brand, null);
  assert.equal(row.variables.distributor, null);
  assert.equal(row.variables.purchaseorder, null);
});

test('label enrichment keeps company identity, deduplicates copies, and rejects ambiguous barcodes', async () => {
  const names = ['navigator', '$fetch', 'useNuxtApp'];
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const template = defaultTemplate('label'); template.elements[0].field = 'company.name';
  const requests: any[] = [];
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    (globalThis as any).useNuxtApp = () => ({ $auth: { session: { value: { companyId: 'session-company' } } } });
    (globalThis as any).$fetch = async (_url: string, options: any) => { requests.push(options); return [{ itemId: 'item-a', barcode: '123', variables: { company: { name: options.headers['x-company-id'] }, variant: { sizeLabel: 'Shade' } } }]; };
    const labels = await loadLabelVariables([{ itemId: 'item-a', companyId: 'branch-a' }, { itemId: 'item-a', companyId: 'branch-a' }], template);
    assert.equal(requests.length, 1); assert.deepEqual(requests[0].body.itemIds, ['item-a']);
    assert.equal(labels.length, 2); assert.equal(labels[0].company.name, 'branch-a');
    await loadLabelVariables(labels, template); assert.equal(requests.length, 1);
    const recovered = await loadLabelVariables([{ itemId: 'item-a', companyId: 'branch-a', barcode: '' }], defaultTemplate('label'));
    assert.equal(recovered[0].barcode, '123');
    assert.equal(fieldValue(recovered[0], 'barcode'), '123');
    (globalThis as any).$fetch = async () => [{ itemId: 'first', barcode: '123' }, { itemId: 'second', barcode: '123' }];
    await assert.rejects(() => loadLabelVariables([{ barcode: '123' }], template), /unique product/);
    (globalThis as any).$fetch = async () => [];
    await assert.rejects(() => loadLabelVariables([{ itemId: 'missing' }], template), /unique product/);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
    await assert.rejects(() => loadLabelVariables([{ itemId: 'item-a' }], template), /Connect to the internet/);
    assert.deepEqual(await loadLabelVariables([{ barcode: '123' }], defaultTemplate('label')), [{ barcode: '123' }]);
  } finally { names.forEach((name, i) => { if (descriptors[i]) Object.defineProperty(globalThis, name, descriptors[i]!); else delete (globalThis as any)[name]; }); }
});

test('company defaults resolve only to a template of the matching kind', () => {
  const receipt = defaultTemplate('receipt'), label = defaultTemplate('label');
  const settings = { ...emptyPrintSettings(), templates: [receipt, label], receiptId: receipt.id, labelId: label.id };
  assert.equal(printSettingsSchema.safeParse(settings).success, true);
  assert.equal(activeTemplate(settings, 'receipt'), receipt);
  assert.equal(printSettingsSchema.safeParse({ ...settings, receiptId: label.id }).success, false);
  assert.equal(printSettingsSchema.safeParse({ ...settings, labelId: 'missing' }).success, false);
  assert.equal(activeTemplate(emptyPrintSettings(), 'receipt'), null);
});

test('rejects out-of-paper elements, item lists on labels, duplicate IDs, and executable logos', () => {
  const label = defaultTemplate('label');
  const valid = { ...emptyPrintSettings(), templates: [label] };
  const invalid = (modify: (t: typeof label) => void) => { const copy = structuredClone(valid); modify(copy.templates[0]); assert.equal(printSettingsSchema.safeParse(copy).success, false); };
  invalid(t => { t.elements[0].x = 49; });
  invalid(t => { t.elements[0].y = 37; });
  invalid(t => { t.elements[0].type = 'items'; });
  invalid(t => { t.elements[0].image = 'https://example.com/logo.svg'; });
  invalid(t => { t.elements.push(t.elements[0]); });
  invalid(t => { t.dpi = '600' as any; });
});

test('raster bytes use correct bit polarity, row stride, and white padding for each printer language', () => {
  const rgba = new Uint8ClampedArray(9 * 2 * 4).fill(255);
  for (const pixel of [0, 7, 8, 10]) { rgba[pixel * 4] = rgba[pixel * 4 + 1] = rgba[pixel * 4 + 2] = 0; }
  assert.deepEqual([...monochromeBytes(rgba, 9, 2)], [129, 128, 64, 0]);
  assert.deepEqual([...monochromeBytes(rgba, 9, 2, true)], [126, 127, 191, 255]);
});

test('field values preserve zero and format company addresses and product custom fields', () => {
  assert.equal(fieldValue({ grandTotal: 0 }, 'grandTotal'), '0.00');
  assert.equal(fieldValue({ companyAddress: { street: 'Main Road', city: 'Kochi' } }, 'companyAddress'), 'Main Road, Kochi');
  assert.equal(fieldValue({ customFields: { fabric: 'Cotton' } }, 'customFields.fabric'), 'Cotton');
  assert.equal(fieldValue({}, 'missing'), '');
});

test('print defaults use persistent company caches and saved settings replace them', async () => {
  const names = ['navigator', 'localStorage', '$fetch', 'useNuxtApp'];
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const cache = new Map<string, string>();
  const online = { onLine: true };
  let requested = '';
  const template = defaultTemplate('label');
  const settings = { ...emptyPrintSettings(), templates: [template], labelId: template.id };
  try {
    for (const [key, value] of Object.entries({
      navigator: online,
      localStorage: { getItem: (key: string) => cache.get(key) || null, setItem: (key: string, value: string) => cache.set(key, value), removeItem: (key: string) => cache.delete(key) },
      useNuxtApp: () => ({ $auth: { session: { value: { companyId: 'company-A' } } } }),
      $fetch: async (_url: string, options: any) => { requested = options.query.companyId; return settings; },
    })) Object.defineProperty(globalThis, key, { value, configurable: true });
    cache.set('markit-print-designs:company-B', JSON.stringify({ ...settings, labelId: null }));
    assert.equal((await loadPrintTemplate('label', 'company-B'))?.id, template.id);
    assert.equal(requested, 'company-B');
    assert.equal(cache.has('markit-print-designs:company-B'), false);
    assert.equal(cache.has('markit-print-designs:v2:company-A'), false);
    requested = '';
    assert.equal((await loadPrintTemplate('label', 'company-B'))?.id, template.id);
    assert.equal(requested, '', 'Cached printing must not request the database');
    const updated = { ...template, id: 'updated-label' };
    cachePrintSettings('company-B', { ...settings, templates: [updated], labelId: updated.id });
    assert.equal((await loadPrintTemplate('label', 'company-B'))?.id, updated.id);
    assert.equal(requested, '');
    cache.set('markit-print-designs:v2:company-B', '{corrupted');
    assert.equal((await loadPrintTemplate('label', 'company-B'))?.id, template.id);
    assert.equal(requested, 'company-B');
    online.onLine = false;
    assert.equal((await loadPrintTemplate('label', 'company-B'))?.id, template.id);
    await assert.rejects(loadPrintTemplate('label'), /Connect to the internet/);
    cache.set('markit-print-designs:v2:company-A', '{corrupted');
    await assert.rejects(loadPrintTemplate('label'), /Connect to the internet/);
  } finally {
    names.forEach((name, i) => { if (descriptors[i]) Object.defineProperty(globalThis, name, descriptors[i]!); else delete (globalThis as any)[name]; });
  }
});

test('fixed receipts, coupon slips and reports feed paper before every cut', () => {
  const bill = { companyName: 'Test', entries: [], generatedCoupons: [{ code: 'TEST123', type: 'FLAT', discountValue: 10 }] };
  for (const bytes of [buildBillReceiptBytes(bill), buildReportReceiptBytes({})]) {
    const data = Array.from(bytes);
    let previousCut = 0, cuts = 0;
    for (let i = 0; i < data.length - 2; i++) {
      if (data[i] !== 29 || data[i + 1] !== 86) continue;
      const preceding = data.slice(previousCut, i).join(',');
      assert.ok(preceding.includes('27,50,27,100,7'), 'Missing default-spacing seven-line feed before cut');
      previousCut = i + 3; cuts++;
    }
    assert.ok(cuts >= 1, 'Receipt is missing a cut command');
  }
});

test('template receipt jobs end with spacing reset, seven-line feed and cut', () => {
  const rendered = { width: 72, height: 1, bounds: [], canvas: { width: 8, height: 1, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(32).fill(255) }) }) } } as any;
  const bytes = templatePrintBytes(rendered, noTaxReceiptTemplate());
  assert.deepEqual(Array.from(bytes.slice(-8)), [27, 50, 27, 100, 7, 29, 86, 0]);
  const label = templatePrintBytes(rendered, defaultTemplate('label'));
  assert.ok(new TextDecoder().decode(label).endsWith('PRINT 1,1\r\n'));
});

test('receipt finishing persists device settings and disables both feed and cut when requested', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  try {
    assert.deepEqual(getReceiptFinishing(), { bottomLines: 7, autoCut: true });
    saveReceiptFinishing({ bottomLines: 2, autoCut: false });
    assert.deepEqual(getReceiptFinishing(), { bottomLines: 2, autoCut: false });
    assert.deepEqual(receiptFinishBytes(), [27, 50, 27, 100, 2]);
    assert.equal(receiptBottomMarginMm(), 2 * 25.4 / 6);
    saveReceiptFinishing({ bottomLines: 0, autoCut: false });
    assert.deepEqual(receiptFinishBytes(), []);
    for (const bytes of [buildBillReceiptBytes({ entries: [], generatedCoupons: [{ code: 'TEST', type: 'FLAT', discountValue: 10 }] }), buildReportReceiptBytes({})]) {
      assert.equal(Array.from(bytes).some((value, i) => value === 29 && bytes[i + 1] === 86), false, 'Cut disabled but encoder still emits cut');
    }
    saveReceiptFinishing({ bottomLines: 0, autoCut: true });
    assert.deepEqual(receiptFinishBytes(), [29, 86, 0]);
    assert.throws(() => saveReceiptFinishing({ bottomLines: -1, autoCut: true }));
    assert.throws(() => saveReceiptFinishing({ bottomLines: 1.5, autoCut: true }));
    values.set(RECEIPT_FINISHING_KEY, '{bad json');
    assert.deepEqual(getReceiptFinishing(), { bottomLines: 7, autoCut: true });
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as any).localStorage;
  }
});

test('original label starter includes variant, size, code and editable discount rules', () => {
  const template = templateSchema.parse(originalLabelTemplate());
  assert.deepEqual(template.elements.filter(e => e.type === 'field').map(e => e.field), ['shopname','productName','labelVariantSize','sprice','dprice','code']);
  assert.equal(template.elements.every(e => e.align === 'left'), true);
  assert.equal(fieldValue({ name: 'Sample', size: 'M' }, 'labelVariantSize'), 'Sample - M');
  assert.equal(fieldValue({ variantName: 'Blue', size: '' }, 'labelVariantSize'), 'Blue');
  const mrp = template.elements.find(e=>e.field==='sprice')!, discount = template.elements.find(e=>e.field==='dprice')!;
  for (const price of [null, undefined, '', 1440, 1500, -1, NaN]) {
    const data = { sprice: 1440, dprice: price };
    assert.equal(labelHasDiscount(data), false);
    assert.equal(elementIsVisible(discount, data), false);
    assert.equal(elementIsStruck(mrp, data), false);
  }
  for (const price of [0, 1299]) {
    const data = { sprice:1440, dprice:price };
    assert.equal(elementIsVisible(discount,data),true);
    assert.equal(elementIsStruck(mrp,data),true);
    assert.equal(elementIsStruck({...mrp,strikeThrough:'never'},data),false);
    assert.equal(elementIsVisible({...discount,visibility:'no-discount'},data),false);
  }
  assert.equal(elementIsVisible({...discount,visibility:'no-discount'},{sprice:1440,dprice:null}),true);
  assert.equal(elementIsStruck({...mrp,strikeThrough:'always'},{}),true);
  assert.equal(labelHasDiscount({variant:{sprice:1440,dprice:1299}}),true);
});


test('CPCL encodes the exact preview pixels with black bits, correct dimensions and no TSPL commands', () => {
  const template = originalLabelTemplate();
  const rgba = new Uint8ClampedArray([0,0,0,255, 255,255,255,255, 0,0,0,255, 255,255,255,255, 255,255,255,255, 255,255,255,255, 255,255,255,255, 255,255,255,255, 0,0,0,255]);
  const canvas = { width: 9, height: 1, getContext: () => ({ getImageData: () => ({ data: rgba }) }) } as any;
  const bytes = templatePrintBytes({ canvas, bounds: [], width: 50, height: 38 }, template, 'cpcl');
  const prefix = new TextEncoder().encode('! 0 203 203 1 1\r\nPAGE-WIDTH 9\r\nCG 2 1 0 0 ');
  assert.deepEqual(bytes.slice(0, prefix.length), prefix);
  assert.deepEqual(Array.from(bytes.slice(prefix.length, prefix.length + 2)), [160, 128]);
  assert.equal(new TextDecoder().decode(bytes.slice(prefix.length + 2)), '\r\nFORM\r\nPRINT\r\n');
});

test('standard paper presets resize existing elements within bounds without losing fields', () => {
  for (const preset of labelPaperSizes) {
    const original = originalLabelTemplate();
    const resized = resizePrintPaper(original, preset.width, preset.height);
    assert.equal(templateSchema.safeParse(resized).success, true, preset.label);
    assert.deepEqual(resized.elements.map(e => e.field), original.elements.map(e => e.field));
    assert.equal(original.width, 50);
  }
  for (const preset of receiptPaperSizes) assert.equal(templateSchema.safeParse(resizePrintPaper(noTaxReceiptTemplate(), preset.width)).success, true);
  assert.throws(() => resizePrintPaper(originalLabelTemplate(), 0));
});

test('product barcode aliases resolve flat and enriched payloads, and empty legacy jobs cannot print', () => {
  assert.equal(fieldValue({ item: { barcode: '0012345' } }, 'barcode'), '0012345');
  assert.equal(fieldValue({ barcode: '0012345' }, 'item.barcode'), '0012345');
  assert.throws(() => buildLabelPrintJobs([{ productName: 'Missing barcode' }], '50x38mm'), /no barcode/);
  assert.equal(labelBarcodeModuleWidth('123456789012345', 3), 2);
  const job = new TextDecoder().decode(buildLabelPrintJobs([{barcode:'123456789012345'}], '50x38mm')[0]);
  assert.ok(job.includes('BARCODE 30,185,"128",80,0,0,2,2,"123456789012345"'));
});

test('standard label is a selectable image template outside custom slots', () => {
  const settings = { ...emptyPrintSettings(), labelId: STANDARD_LABEL_ID };
  assert.equal(printSettingsSchema.safeParse(settings).success, true);
  const template = activeTemplate(settings, 'label')!;
  assert.equal(template.id, STANDARD_LABEL_ID);
  assert.equal(template.kind, 'label'); assert.equal(template.width, 50); assert.equal(template.height, 38);
  assert.ok(template.elements.some(e => e.type === 'barcode'));
  assert.equal(settings.templates.length, 0);
  assert.equal(printSettingsSchema.safeParse({ ...settings, receiptId: STANDARD_LABEL_ID }).success, false);
  assert.equal(printSettingsSchema.safeParse({ ...settings, templates: [template] }).success, false);
});
