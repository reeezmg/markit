import { defaultQuoteDesign, normalizeQuoteDesign } from '../utils/quote-design';
import { absoluteLetterSpacing, verticalTextOffset, paintColor, compositeFills, transformLayerVector, layerCornerRadii, layerPadding, layerBoxStyle } from '../utils/designer-presentation';
import { STANDARD_LABEL_ID } from '../utils/print-templates';
import { labelBarcodeModuleWidth, buildLabelPrintJobs } from '../composables/printCommands';
import { receiptPaperSizes, labelPaperSizes, resizePrintPaper } from '../utils/print-paper';
import { originalLabelTemplate, printElementValue, elementIsVisible, elementIsStruck, labelHasDiscount, templateSchema, printElementMargins, setPrintFlowTop } from '../utils/print-templates';
import { getReceiptFinishing, saveReceiptFinishing, receiptFinishBytes, receiptBottomMarginMm, RECEIPT_FINISHING_KEY } from '../utils/receipt-finishing';
import { templatePrintBytes } from '../utils/print-template-renderer.client';
import { buildBillReceiptBytes, buildReportReceiptBytes } from '../composables/printCommands';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeTemplate, defaultTemplate, newElement, emptyPrintSettings, fieldValue, monochromeBytes, printSettingsSchema } from '../utils/print-templates';
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
import { printLayerTree, printBindingFields, setPrintBinding, printElementPresentation, patchPrintPresentation, printLayerLocalBox, printFrameMoveSize, printTreeDepth } from '../utils/print-designer';
import { upgradeReceiptToolTemplate } from '../utils/receipt-tool-template';
import { upgradeLabelToolTemplate } from '../utils/label-tool-template';
import { legacyReceiptFixture } from './legacy-receipt-fixture';
import { flattenQuoteLayers } from '../utils/quote-layers';

test('print frames preserve nested data links, locks and style through saved version-one settings', () => {
  const template = defaultTemplate('label');
  const frame = { ...newElement('frame', template.width), width: 42, height: 20, locked: true };
  const text = { ...newElement('text', frame.width), parentId: frame.id, width: 35, height: 8, text: 'Static text' };
  template.elements.push(frame, text);
  setPrintBinding(text, 'product.name', { product: { name: 'Actual product' } });
  assert.equal(text.type, 'field'); assert.equal(text.field, 'product.name'); assert.equal(text.text, '');
  let nodes = flattenQuoteLayers(printLayerTree(template));
  const child = nodes.find(n => n.element?.id === text.id)!;
  assert.equal(child.parentId, frame.id); assert.equal(child.locked, true); assert.equal(child.binding, 'product.name');
  const saved = printSettingsSchema.parse({ ...emptyPrintSettings(), templates: [template], labelId: template.id });
  assert.equal(saved.templates[0].elements.find(e => e.id === text.id)?.parentId, frame.id);
  setPrintBinding(text, '', { product: { name: '<b>Actual product</b>' } });
  assert.equal(text.type, 'text'); assert.equal(text.text, '<b>Actual product</b>');
  assert.ok(printBindingFields(template, [{ key: 'product.customFields.fabric', label: 'Fabric', group: 'Product custom fields', sample: 'Cotton' }], text).some(v => v.key === 'product.customFields.fabric'));
  frame.visible = false; nodes = flattenQuoteLayers(printLayerTree(template));
  assert.equal(nodes.find(n => n.element?.id === text.id)?.visible, false);
});

test('print JSON rejects cycles, non-frame parents, invalid child bounds and oversized trees', () => {
  for (const mode of ['cycle', 'parent', 'bounds', 'depth']) {
    const template = defaultTemplate('label');
    const frame = { ...newElement('frame', template.width), width: 42, height: 20 };
    const child = { ...newElement('text', frame.width), parentId: frame.id, width: 20, height: 5 };
    template.elements.push(frame, child);
    if (mode === 'cycle') frame.parentId = frame.id;
    if (mode === 'parent') child.parentId = template.elements[0].id;
    if (mode === 'bounds') child.x = 40;
    if (mode === 'depth') { let parent = frame.id; for (let i = 0; i < 8; i++) { const nested = { ...newElement('frame', 40), id: `frame-${i}`, parentId: parent, width: 40, height: 20 }; template.elements.push(nested); parent = nested.id; } }
    assert.equal(templateSchema.safeParse(template).success, false, mode);
  }
  const receipt = defaultTemplate('receipt'); receipt.elements[0].placement = 'absolute';
  assert.equal(templateSchema.safeParse(receipt).success, true);
});

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
  const expected = tax.elements.filter((e, i, all) => e.type !== 'items' && e.type !== 'taxsummary' && e.whenField !== 'receiptTaxGroups');
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
    const conditionOnly = defaultTemplate('label'); conditionOnly.elements = [{...newElement('text',50),rules:[{id:'related-rule',match:'all',action:'bold',conditions:[{field:'productName',operator:'eq',source:'field',value:'company.name'}]}]}];
    const conditionData = await loadLabelVariables([{itemId:'item-a',companyId:'branch-a',barcode:'123'}],conditionOnly);
    assert.equal(conditionData[0].company.name,'branch-a'); assert.equal(requests.length,2,'Fields used only in conditions must trigger a scoped variable lookup');
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

test('built-in printer receipts include customer notes and terms', () => {
  const bytes = buildBillReceiptBytes({ companyName: 'Test', entries: [], notes: 'Call before delivery', termsAndConditions: 'Keep receipt' });
  const text = Buffer.from(bytes).toString('latin1');
  assert.ok(text.includes('Customer notes: Call before delivery'));
  assert.ok(text.includes('Terms and conditions: Keep receipt'));
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
  assert.deepEqual(template.elements.filter(e => e.type === 'field').map(e => e.field), ['shopname','productName','labelVariantSize','sprice','dprice','code','barcode']);
  assert.equal(template.fontFamily, 'sans');
  assert.ok(template.elements.every(e => ['field', 'line', 'barcode'].includes(e.type)));
  assert.ok(template.elements.filter(e => e.type === 'field').every(e => e.fontFamily === 'Arial' && e.lineHeight === 1.15));
  assert.equal(template.elements.find(e => e.type === 'barcode')!.barcodeDisplayValue, false);
  assert.equal(template.elements.at(-1)!.align, 'center');
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
    assert.equal(elementIsStruck({...mrp,rules:[],strike:false},data),false);
    assert.equal(elementIsVisible({...discount,rules:[],visibility:'no-discount'},data),false);
  }
  assert.equal(elementIsVisible({...discount,rules:[],visibility:'no-discount'},{sprice:1440,dprice:null}),true);
  assert.equal(elementIsStruck({...mrp,strikeThrough:'always'},{}),true);
  assert.equal(labelHasDiscount({variant:{sprice:1440,dprice:1299}}),true);
});

test('only untouched legacy label starters refresh as drafts, retaining identity and existing layer IDs', () => {
  const make = (type: any, field: string, text: string, y: number, height: number, fontSize = 8, bold = false) => ({ ...newElement(type, 50), field, text, y, height, fontSize, bold, align: 'left' });
  const legacy = templateSchema.parse({ ...originalLabelTemplate(), name: 'My saved label', fontFamily: 'thermal', elements: [
    make('field','shopname','',1,5,11,true), make('line','','',5,2), make('field','productName','',7,3.5), make('field','labelVariantSize','',11,3.5),
    {...make('field','sprice','MRP Rs.',15,3.5),strikeThrough:'discount'}, {...make('field','dprice','Discount Rs.',19,3.5),visibility:'discount'},
    make('field','code','',23,3,7), make('barcode','barcode','',26,10),
  ] });
  const before = JSON.stringify(legacy), updated = upgradeLabelToolTemplate(legacy);
  assert.notEqual(updated, legacy);
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(updated.id, legacy.id); assert.equal(updated.name, legacy.name);
  assert.deepEqual(updated.elements.slice(0,8).map(e=>e.id),legacy.elements.map(e=>e.id));
  assert.equal(updated.fontFamily,'sans'); assert.equal(updated.elements.length,9);
  assert.ok(templateSchema.safeParse(updated).success);
  assert.equal(upgradeLabelToolTemplate(updated),updated);
  for (const change of [(t: typeof legacy)=>{t.elements[0].x+=.1}, (t: typeof legacy)=>{t.elements[0].background='#ffffff'}, (t: typeof legacy)=>{t.elements[0].text='My shop: '}, (t: typeof legacy)=>{t.dpi='300'}]) {
    const custom=structuredClone(legacy);change(custom);assert.equal(upgradeLabelToolTemplate(custom),custom);
  }
});


test('TSPL label jobs reset remembered positioning and retain the full blank left margin at both DPIs', () => {
  for (const dpi of ['203','300'] as const) {
    const template = {...originalLabelTemplate(),dpi};
    const width=Math.round(template.width*Number(dpi)/25.4), height=3, left=Math.round(2*Number(dpi)/25.4);
    const rgba=new Uint8ClampedArray(width*height*4).fill(255);
    for(let y=0;y<height;y++) for(let x=left;x<left+8;x++) { const index=(y*width+x)*4;rgba[index]=rgba[index+1]=rgba[index+2]=0; }
    const canvas={width,height,getContext:()=>({getImageData:()=>({data:rgba})})} as any;
    const bytes=templatePrintBytes({canvas,bounds:[],width:template.width,height:template.height},template);
    const marker=`BITMAP 0,0,${Math.ceil(width/8)},${height},0,`,prefix=Buffer.from(bytes).indexOf(marker),header=Buffer.from(bytes.slice(0,prefix)).toString('ascii');
    assert.ok(prefix>0);assert.ok(header.includes('DIRECTION 1,0\r\n'));
    // Model a printer left shifted by an earlier application's job.
    const state={referenceX:7,referenceY:9,shiftX:-left,shiftY:12};
    for(const command of header.trim().split('\r\n')) {
      const match=/^(REFERENCE|SHIFT) (-?\d+),(-?\d+)$/.exec(command);
      if(match) { const key=match[1]==='REFERENCE'?'reference':'shift';state[`${key}X`]=Number(match[2]);state[`${key}Y`]=Number(match[3]); }
    }
    assert.deepEqual(state,{referenceX:0,referenceY:0,shiftX:0,shiftY:0});
    const start=prefix+marker.length,stride=Math.ceil(width/8);
    for(let y=0;y<height;y++) {
      const dark=(x:number)=>(bytes[start+y*stride+(x>>3)]&(128>>(x%8)))===0;
      for(let x=0;x<left;x++) assert.equal(dark(x),false,`${dpi}: blank left pixels were trimmed`);
      assert.equal(dark(left),true);assert.equal(left+state.referenceX+state.shiftX,left);
    }
    const second=templatePrintBytes({canvas,bounds:[],width:template.width,height:template.height},template);
    assert.deepEqual(second,bytes,'Every label must reset placement independently');
  }
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

test('sheet receipt sizes and floating images validate without widening label limits', () => {
  const sheet = resizePrintPaper(classicReceiptTemplate(), 210, 297);
  assert.equal(sheet.paperSize, 'A4');
  assert.equal(templateSchema.safeParse(sheet).success, true);
  assert.equal(templateSchema.safeParse({ ...sheet, paperSize: undefined }).success, false);
  assert.equal(templateSchema.safeParse({ ...sheet, kind: 'label' }).success, false);
  const image = { ...sheet.elements[0], id: 'image', type: 'logo', placement: 'absolute', x: 20, y: 40, width: 50, height: 20 };
  assert.equal(templateSchema.safeParse({ ...sheet, elements: [image] }).success, true);
  assert.equal(templateSchema.safeParse({ ...sheet, elements: [{ ...image, y: 290 }] }).success, false);
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


test('linked text affixes survive save, wrap zero values, omit missing data and snapshot once on disconnect', () => {
  for (const type of ['field', 'barcode', 'qrcode'] as const) {
    const element = { ...newElement(type, 72), field: 'grandTotal', text: 'Total: ', suffix: ' incl. tax' };
    assert.equal(printElementValue(element, { grandTotal: 0 }), 'Total: 0.00 incl. tax');
    assert.equal(printElementValue(element, {}), '');
    const stored = printSettingsSchema.parse({ ...emptyPrintSettings(), templates: [{ ...classicReceiptTemplate(), id: 'affixes', elements: [element] }] });
    assert.equal(stored.templates[0].elements[0].suffix, ' incl. tax');
    setPrintBinding(element, '', { grandTotal: 25 });
    assert.equal(element.text, 'Total: 25.00 incl. tax');
    assert.equal(element.suffix, undefined);
    assert.equal(printElementValue(element, {}), 'Total: 25.00 incl. tax');
    setPrintBinding(element, 'grandTotal', { grandTotal: 25 });
    assert.equal(printElementValue(element, { grandTotal: 25 }), '25.00');
  }
  const manual = { ...newElement('text', 72), text: 'Fixed text', suffix: 'stale' };
  assert.equal(printElementValue(manual, {}), 'Fixed text');
  assert.equal(templateSchema.safeParse({ ...classicReceiptTemplate(), elements: [{ ...manual, suffix: 'a'.repeat(2001) }] }).success, false);
  assert.equal(templateSchema.parse(classicReceiptTemplate()).elements[0].suffix, undefined);
});

test('conditional visibility accepts zero values and hides missing or whitespace-only data', () => {
  const element = { ...newElement('text', 72), whenField: 'clientPhone' };
  for (const clientPhone of [undefined, null, '', '   ']) assert.equal(elementIsVisible(element, { clientPhone }), false);
  for (const clientPhone of [0, '01234']) assert.equal(elementIsVisible(element, { clientPhone }), true);
  assert.equal(elementIsVisible({ ...element, visible: false }, { clientPhone: '1234' }), false);
  assert.equal(elementIsVisible({ ...element, whenField: undefined }, {}), true);
});


test('shared inspector presentation fields survive both document formats without changing old defaults', () => {
  const style = { fontWeight: 500, fontFamily: 'Courier New' as const, letterSpacing: 12, letterSpacingUnit: 'percent' as const, textVerticalAlign: 'middle' as const, resizeMode: 'auto-height' as const, aspectLocked: true, fillOpacity: .7, fillVisible: false };
  const quote = defaultQuoteDesign(); Object.assign(quote.sections.at(-1)!, style); quote.sections[0].elements = [{ key:'company-name', ...style }];
  const savedQuote = normalizeQuoteDesign(quote);
  for (const [key,value] of Object.entries(style)) { assert.equal((savedQuote.sections.at(-1)! as any)[key],value); assert.equal((savedQuote.sections[0].elements![0] as any)[key],value); }
  const receipt = templateSchema.parse({ ...classicReceiptTemplate(), elements: [{ ...newElement('text',72),...style }] });
  for (const [key,value] of Object.entries(style)) assert.equal((receipt.elements[0] as any)[key],value);
  const legacy = classicReceiptTemplate(); delete legacy.elements[0].resizeMode;
  assert.equal(templateSchema.parse(legacy).elements[0].resizeMode,undefined);
  assert.equal(templateSchema.safeParse({...receipt,elements:[{...receipt.elements[0],fontWeight:1000}]}).success,false);
  assert.equal(templateSchema.safeParse({...receipt,elements:[{...receipt.elements[0],fillOpacity:2}]}).success,false);
  assert.equal(absoluteLetterSpacing(10,'percent',12),1.2); assert.equal(absoluteLetterSpacing(2,'absolute',12),2);
  assert.equal(verticalTextOffset(20,8,'middle'),6); assert.equal(verticalTextOffset(20,8,'bottom'),12); assert.equal(verticalTextOffset(3,8,'bottom'),0);
  assert.equal(paintColor('#112233',.5),'rgba(17,34,51,0.5)'); assert.equal(paintColor('#112233',1,false),'transparent');
});


test('multiple solid fills compose in order and persist independently of layer opacity', () => {
  const fills=[{color:'#ff0000',opacity:.5,visible:true},{color:'#0000ff',opacity:1,visible:true}];
  assert.deepEqual(compositeFills(fills),{color:'#800080',opacity:1,css:'#800080',visible:true});
  assert.equal(compositeFills([{...fills[0],visible:false},fills[1]]).color,'#0000ff');
  assert.equal(compositeFills([]).visible,false);
  const quote=defaultQuoteDesign();quote.sections[0].fills=fills;assert.deepEqual(normalizeQuoteDesign(quote).sections[0].fills,fills);
  const receipt=templateSchema.parse({...classicReceiptTemplate(),elements:[{...newElement('shape',72),fills,opacity:.3}]});assert.deepEqual(receipt.elements[0].fills,fills);assert.equal(receipt.elements[0].opacity,.3);
  assert.equal(templateSchema.safeParse({...receipt,elements:[{...receipt.elements[0],fills:Array(9).fill(fills[0])}]}).success,false);
});


test('nested mirrored and rotated frames convert movement consistently between page and parent coordinates', () => {
  const parents=[{rotation:30,flipX:true},{rotation:-40,flipY:true}];
  const world=transformLayerVector(parents,3,-7),local=transformLayerVector(parents,world.x,world.y,true);
  assert.ok(Math.abs(local.x-3)<1e-9&&Math.abs(local.y+7)<1e-9);
  assert.deepEqual(transformLayerVector([{flipX:true}],2,1,true),{x:-2,y:1});
  assert.deepEqual(transformLayerVector([],2,1,true),{x:2,y:1});
});

test('independent corners and padding survive quote and printer saves with explicit zero and legacy fallbacks', () => {
  const style = { radius: 7, cornerRadii: { topLeft: 0, topRight: 2, bottomRight: 3, bottomLeft: 4 }, padding: 8, paddingSides: { top: 1, right: 0, bottom: 3, left: 4 } };
  const quote = defaultQuoteDesign(); Object.assign(quote.sections[0], style); quote.sections[0].elements = [{ key: 'company-name', ...style }];
  const saved = normalizeQuoteDesign(quote), print = templateSchema.parse({ ...classicReceiptTemplate(), elements: [{ ...newElement('text', 72), ...style }] });
  for (const layer of [saved.sections[0], saved.sections[0].elements![0], print.elements[0]]) {
    assert.deepEqual(layerCornerRadii(layer), [0, 2, 3, 4]); assert.deepEqual(layerPadding(layer), [1, 0, 3, 4]);
    assert.deepEqual(layerBoxStyle(layer), { borderRadius: '0mm 2mm 3mm 4mm', padding: '1mm 0mm 3mm 4mm' });
  }
  assert.deepEqual(layerCornerRadii({ radius: 2 }), [2, 2, 2, 2]); assert.deepEqual(layerPadding({ padding: 3 }), [3, 3, 3, 3]);
  assert.deepEqual(layerBoxStyle({}), { borderRadius: undefined, padding: undefined });
  for (const invalid of [{ padding: -1 }, { paddingSides: { ...style.paddingSides, right: Infinity } }, { cornerRadii: { ...style.cornerRadii, bottomLeft: 101 } }, { paddingSides: { top: 1 } }]) {
    assert.equal(templateSchema.safeParse({ ...print, elements: [{ ...print.elements[0], ...invalid }] }).success, false);
  }
});

test('receipt vertical offsets support upward movement without switching out of flow', () => {
  const receipt = classicReceiptTemplate(); receipt.elements[0].gapBefore = -2;
  const saved = templateSchema.parse(JSON.parse(JSON.stringify(receipt)));
  assert.equal(saved.elements[0].gapBefore, -2); assert.notEqual(saved.elements[0].placement, 'absolute');
  for (const gapBefore of [-301, 301, NaN]) assert.equal(templateSchema.safeParse({ ...receipt, elements: [{ ...receipt.elements[0], gapBefore }] }).success, false);
});

test('text backgrounds save independently of text fill and legacy inverse paints convert only on colour edits', () => {
  const style = { background: '#123456', backgroundOpacity: .35, backgroundVisible: false, color: '#fedcba', fillOpacity: .8 };
  const quote = defaultQuoteDesign(); Object.assign(quote.sections[0], style); quote.sections[0].elements = [{ key: 'company-name', ...style }];
  const savedQuote = normalizeQuoteDesign(quote), savedPrint = templateSchema.parse({ ...classicReceiptTemplate(), elements: [{ ...newElement('text',72), ...style }] });
  for (const layer of [savedQuote.sections[0], savedQuote.sections[0].elements![0], savedPrint.elements[0]]) { assert.equal(layer.background, style.background); assert.equal(layer.backgroundOpacity, .35); assert.equal(layer.backgroundVisible, false); assert.equal(layer.fillOpacity, .8); }
  assert.equal(templateSchema.safeParse({ ...savedPrint, elements: [{ ...savedPrint.elements[0], backgroundOpacity: 2 }] }).success, false);
  const legacy = { ...newElement('text',72), inverse: true, text: 'Savings', fillOpacity: .6 }, before = JSON.stringify(legacy);
  const shown = printLayerTree({ ...classicReceiptTemplate(), elements: [legacy] })[0].model;
  assert.equal(shown.color, '#ffffff'); assert.equal(shown.background, '#000000'); assert.equal(shown.backgroundOpacity, .6); assert.equal(JSON.stringify(legacy), before);
  patchPrintPresentation(legacy, { radius: 2 }); assert.equal(legacy.inverse, true); assert.equal(legacy.background, undefined);
  patchPrintPresentation(legacy, { background: '#ff0000', backgroundOpacity: .5 });
  assert.equal(legacy.inverse, false); assert.equal(legacy.color, '#ffffff'); assert.equal(legacy.fillOpacity, .6); assert.equal(legacy.background, '#ff0000'); assert.equal(legacy.backgroundOpacity, .5);
  const layered = { ...newElement('field',72), inverse: true, fills: [{ color: '#ff0000', opacity: .4, visible: true }] };
  assert.deepEqual(printElementPresentation(layered).fills, [{ color: '#ffffff', opacity: .4, visible: true }]);
});

test('four-sided margins retain legacy receipt gaps and share save and bounds validation', () => {
  const element = { ...newElement('text',72), width: 20, gapBefore: -1, gapAfter: 3 };
  assert.deepEqual(printElementMargins(element,true),[-1,0,3,0]); assert.deepEqual(printElementMargins(element),[0,0,0,0]);
  const style = { marginSides: { top: 1, right: 2, bottom: 3, left: 4 } };
  Object.assign(element, style); const receipt = templateSchema.parse({...classicReceiptTemplate(),elements:[element]});
  assert.deepEqual(printElementMargins(receipt.elements[0],true),[1,2,3,4]); setPrintFlowTop(receipt.elements[0],-2);
  assert.deepEqual(printElementMargins(receipt.elements[0],true),[-2,2,3,4]); assert.equal(receipt.elements[0].gapBefore,undefined);
  const quote = defaultQuoteDesign(); Object.assign(quote.sections[0],style); quote.sections[0].elements=[{key:'company-name',margin:2}];
  const saved = normalizeQuoteDesign(quote); assert.deepEqual(saved.sections[0].marginSides,style.marginSides); assert.equal(saved.sections[0].elements![0].margin,2);
  assert.equal(templateSchema.safeParse({...receipt,elements:[{...element,marginSides:{...style.marginSides,right:100}}]}).success,false);
  assert.equal(templateSchema.safeParse({...receipt,elements:[{...element,marginSides:{...style.marginSides,left:-3}}]}).success,false);
  assert.equal(templateSchema.safeParse({...receipt,elements:[{...element,margin:301}]}).success,false);
});


test('barcode formats and readable values persist without changing old code defaults', () => {
  const original = newElement('barcode',72);
  const template = { ...classicReceiptTemplate(), elements:[original] };
  assert.equal(templateSchema.parse(template).elements[0].barcodeFormat, undefined);
  for (const barcodeFormat of ['CODE128','CODE39','EAN13','EAN8','UPC','ITF14'] as const) {
    const code = { ...original, barcodeFormat, barcodeDisplayValue:false };
    const settings = printSettingsSchema.parse({ ...emptyPrintSettings(),templates:[{ ...template,id:'custom-codes',elements:[code] }] });
    assert.equal(settings.templates[0].elements[0].barcodeFormat,barcodeFormat);
    assert.equal(settings.templates[0].elements[0].barcodeDisplayValue,false);
  }
  assert.equal(templateSchema.safeParse({ ...template,elements:[{ ...original,barcodeFormat:'UNSUPPORTED' }] }).success,false);
});


test('default Tax Receipt is entirely composed of public editor layers and data', () => {
  const template=classicReceiptTemplate();
  assert.ok(template.elements.every(e=>['text','field','items','taxsummary','line','qrcode','logo','shape','frame','barcode'].includes(e.type)));
  assert.ok(template.elements.every(e=>!e.inverse&&e.gapBefore===undefined&&e.gapAfter===undefined));
  assert.ok(template.elements.some(e=>e.type==='text'&&e.text==='TAX SUMMARY'));
  assert.deepEqual(template.elements.find(e=>e.type==='taxsummary')!.taxColumns!.map(c=>c.field),['tax.rate','tax.sgst','tax.cgst','tax.total']);
  const savings=template.elements.find(e=>e.field==='receiptSavings')!;
  assert.equal(savings.color,'#ffffff');assert.equal(savings.background,'#000000');
  assert.equal(fieldValue(receiptPhotoFixture,'receiptTaxGroups'),'2');
  assert.equal(fieldValue({...receiptPhotoFixture,entries:[]},'receiptTaxGroups'),'');
  assert.equal(upgradeReceiptToolTemplate(template),template);
  assert.ok(templateSchema.safeParse(template).success);
});

test('legacy starter upgrades only the local design, preserving identities, custom styles and source data', () => {
  const legacy=legacyReceiptFixture(),gst=legacy.elements.find(e=>e.field==='gstin')!;gst.background='#123456';
  const before=JSON.stringify(legacy),taxId=legacy.elements.find(e=>e.type==='taxsummary')!.id;
  const upgraded=upgradeReceiptToolTemplate(legacy);
  assert.equal(JSON.stringify(legacy),before);assert.equal(upgraded.id,legacy.id);assert.equal(upgraded.name,legacy.name);
  assert.equal(upgraded.elements.find(e=>e.id===gst.id)!.background,'#123456');
  assert.equal(upgraded.elements.find(e=>e.id===taxId)!.taxColumns!.length,4);
  const taxRows=receiptSummary(receiptPhotoFixture).tax, taxColumns=upgraded.elements.find(e=>e.id===taxId)!.taxColumns!;
  assert.deepEqual(taxColumns.map(c=>tableCellValue(taxRows[0],c.field,0)),['5','5.95','5.95','11.90']);
  assert.deepEqual(taxColumns.map(c=>tableColumnTotal(taxRows,c)),['TOTAL','21.49','21.49','42.98']);
  assert.ok(upgraded.elements.some(e=>e.type==='text'&&e.text==='TAX SUMMARY'));
  assert.ok(upgraded.elements.every(e=>!e.inverse&&e.type!=='spacer'));
  assert.ok(templateSchema.safeParse(upgraded).success);assert.equal(upgradeReceiptToolTemplate(upgraded),upgraded);
});

test('starter conversion leaves unrelated and structurally incompatible saved designs unchanged', () => {
  const unrelated=legacyReceiptFixture(); unrelated.elements[0].id='my-company-layer';
  assert.equal(upgradeReceiptToolTemplate(unrelated),unrelated);
  const fixed=legacyReceiptFixture(); fixed.elements.find(e=>e.type==='taxsummary')!.placement='absolute';
  assert.equal(upgradeReceiptToolTemplate(fixed),fixed);
  const full=legacyReceiptFixture();
  while(full.elements.length<40) full.elements.push(newElement('text',72));
  assert.equal(upgradeReceiptToolTemplate(full),full);
});

test('printer group geometry uses exact millimetres and repairs only old sub-pixel frame undersizing', () => {
  const frame={...newElement('frame',72),id:'payment',x:2,y:20,width:67.88,height:55.88};
  const caption={...newElement('text',72),id:'caption',parentId:frame.id,x:0,y:0,height:7,text:'Scan to pay',resizeMode:'auto-height' as const};
  const qr={...newElement('qrcode',72),id:'payment-qr',parentId:frame.id,x:10,y:8,width:48,height:48,text:'upi://pay'};
  const template={...classicReceiptTemplate(),elements:[frame,caption,qr]};
  assert.equal(templateSchema.safeParse(template).success,false);
  const children=JSON.stringify([caption,qr]); Object.assign(frame,printFrameMoveSize(template,frame));
  assert.deepEqual({width:frame.width,height:frame.height},{width:68,height:56});
  assert.equal(templateSchema.safeParse(template).success,true);assert.equal(JSON.stringify([caption,qr]),children);
  assert.deepEqual(printLayerLocalBox(template,frame,{payment:{x:2,y:20,width:68,height:56}}),{x:2,y:20,width:68,height:56});
  Object.assign(frame,{rotation:90,flipX:true,paddingSides:{top:2,right:0,bottom:0,left:3}});
  assert.deepEqual(printLayerLocalBox(template,qr,{payment:{x:2,y:20,width:68,height:56},'payment-qr':{x:6,y:21,width:48,height:48}}),{x:13,y:10,width:48,height:48});
  frame.width=60;assert.equal(printFrameMoveSize(template,frame).width,60);
  assert.equal(templateSchema.safeParse(template).success,false,'Real overflow must still fail validation');
});

test('printer clipboard depth counts descendants and rejects cycles without losing external parent scope', () => {
  assert.equal(printTreeDepth([]),0);
  assert.equal(printTreeDepth([{id:'copy',parentId:'outside'},{id:'child',parentId:'copy'}]),2);
  assert.equal(printTreeDepth(Array.from({length:8},(_,i)=>({id:String(i),parentId:i?String(i-1):undefined}))),8);
  assert.equal(printTreeDepth([{id:'a',parentId:'b'},{id:'b',parentId:'a'}]),Infinity);
});
