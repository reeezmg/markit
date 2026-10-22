<script setup lang="ts">
const companyScope = useCompanyScope();
const $fetch = companyScope.fetch;
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { STANDARD_LABEL_ID, defaultTemplate, originalLabelTemplate, emptyPrintSettings, fieldValue, labelFields, newElement, printSettingsSchema, receiptFields, NO_TAX_RECEIPT_ID, noTaxReceiptTemplate, type PrintElement, type PrintSettings } from '~/utils/print-templates';
import { labelVariables, labelSampleData, type LabelVariable } from '~/utils/label-variables';
import { receiptPaperSizes, labelPaperSizes, resizePrintPaper } from '~/utils/print-paper';
import { resizeLabelBox, type ResizeHandle } from '~/utils/label-box';
import { useDesignerHistory } from '~/utils/designer-history';
import { cachePrintSettings } from '~/utils/load-print-template.client';
import { downloadTemplatePDF, renderPrintTemplate } from '~/utils/print-template-renderer.client';
import { usePrint } from '~/composables/usePrintBill';
import PrinterDesignerWorkspace from './PrinterDesignerWorkspace.vue';
import ThermalReceipt from './ThermalReceipt.vue';
import { defaultTableColumns, twoLineTableColumns, classicReceiptTemplate, taxlessReceiptTemplate, CLASSIC_RECEIPT_ID } from '~/utils/print-templates';
import { receiptTableVariables } from '~/utils/receipt-table';

function setPaperSize(value: string) {
  if (!design.value || !value) return;
  try {
    const [width, height] = value.split('x').map(Number);
    Object.assign(design.value, resizePrintPaper(design.value, width, height === undefined ? design.value.height : height));
    fitPreview.value = true;
  } catch (err: any) { error.value = err.message; }
}
const paperSizes = computed(() => design.value?.kind === 'label' ? labelPaperSizes : receiptPaperSizes);
const paperPresetValue = computed(() => {
  const t = design.value;
  if (!t) return '';
  const match = paperSizes.value.find(p => p.width === t.width && (!('height' in p) || p.height === t.height));
  return match ? ('height' in match ? `${match.width}x${match.height}` : String(match.width)) : '';
});
const props = defineProps<{ receiptData: any; labelData: any; hideOriginalReceipt?: boolean }>();
const classicSample = computed(() => ({
  ...props.receiptData, isTaxIncluded: true, paymentMethod: 'UPI', upiId: props.receiptData.upiId || 'preview@upi',
  entries: [
    { description: 'FOOTWEAR', hsn: '64039990', qty: 1, mrp: 250, value: 250, discount: 0, tax: 5, tvalue: 250 },
    { description: 'LADIES PANT', hsn: '6101', qty: 1, mrp: 290, value: 290, discount: 0, tax: 12, tvalue: 290 },
  ],
  subtotal: 540, tqty: 2, tvalue: 540, ttvalue: 540, grandTotal: 540, discount: 0, tdiscount: 0,
  thankYouNote: 'Thank you please visit us again',
}));
const settings = ref<PrintSettings>(emptyPrintSettings());
const history = useDesignerHistory(settings);
const { canUndo, canRedo } = history;
const selectedId = ref('');
const editorOpen = ref(false);
const presetPreview = ref<'no-tax' | 'classic' | null>(null);
const presetData = computed(() => ({ ...classicSample.value, printTemplate: presetPreview.value === 'no-tax' ? noTaxReceiptTemplate() : classicReceiptTemplate() }));
async function presetOutput(mode: 'pdf' | 'print') {
  busy.value = true; error.value = '';
  try {
    if (mode === 'print') await printer.printBill(presetData.value, presetData.value.printTemplate);
    else {
      const { generateThermalReceiptPDF } = await import('~/utils/thermal-receipt.client');
      await generateThermalReceiptPDF(presetData.value);
    }
  } catch (err: any) { error.value = err.message || 'Could not output receipt'; }
  finally { busy.value = false; }
}
const zoom = ref(2);
const fitPreview = ref(true);
const editorTab = ref<'content' | 'setup'>('setup');
const variableSearch = ref('');
const customVariables = ref<LabelVariable[]>([]);
const variableError = ref('');
const variablePickerOpen = ref(false);
const labelPreviewMode = ref<'current' | 'discount' | 'no-discount'>('current');
const sampleLabel = computed(() => {
  const data = labelSampleData(props.labelData, customVariables.value);
  if (labelPreviewMode.value !== 'current') {
    data.dprice = labelPreviewMode.value === 'discount' ? Number(data.sprice ?? data.variant.sprice) * 0.9 : null;
    data.variant.dprice = data.dprice;
  }
  return data;
});
const sampleReceipt = computed(() => {
  const data = design.value?.fontFamily === 'thermal' ? classicSample.value : props.receiptData;
  return { ...data, entries: (data.entries || []).map((entry: any) => ({ ...labelSampleData(entry, customVariables.value), ...entry, labelVariablesLoaded: true })) };
});
const columnSearch = ref('');
const tableVariableGroups = computed(() => {
  const variables = [...receiptTableVariables, ...customVariables.value.filter(v => /^(product|variant)\./.test(v.key))].filter(v => `${v.group} ${v.label} ${v.key}`.toLowerCase().includes(columnSearch.value.toLowerCase()));
  return [...new Set(variables.map(v => v.group))].map(group => ({ group, variables: variables.filter(v => v.group === group) }));
});
function customizeTable() {
  if (element.value?.type === 'items') { element.value.columns = defaultTableColumns(); element.value.tableBorders = true; element.value.tablePadding = 0.5; }
}
function twoLineTable() {
  if (element.value?.type !== 'items') return;
  Object.assign(element.value, { columns: twoLineTableColumns(), tableBorders: false, tableRules: true, tableTotals: true, tableHeaderBold: false, tablePadding: 0, tableItemGap: 3 });
}
function addColumn() {
  const columns = element.value?.columns;
  if (!columns || columns.length >= 12) return;
  columns.push({ id: crypto.randomUUID(), header: 'New column', field: 'entry.description', width: 20, align: 'left', line: columns.at(-1)?.line || 1 });
  setColumnWidth(columns.length - 1, 20);
}
function columnPercent(index: number) {
  const columns = element.value?.columns || [];
  return columns[index] ? columns[index].width / columns.filter(c => (c.line || 1) === (columns[index].line || 1)).reduce((sum, c) => sum + c.width, 0) * 100 : 0;
}
function setColumnWidth(index: number, percent: number) {
  const columns = element.value?.columns;
  if (!columns || !columns[index] || !Number.isFinite(percent)) return;
  const others = columns.filter((c, i) => i !== index && (c.line || 1) === (columns[index].line || 1));
  if (!others.length) { columns[index].width = 100; return; }
  const width = Math.max(1, Math.min(100 - others.length, percent));
  const total = others.reduce((sum, c) => sum + c.width, 0);
  const remaining = 100 - width - others.length;
  others.forEach(c => { c.width = 1 + remaining * c.width / total; });
  columns[index].width = width;
}
function moveColumn(index: number, delta: number) {
  const columns = element.value?.columns;
  if (!columns || index + delta < 0 || index + delta >= columns.length) return;
  const [column] = columns.splice(index, 1); columns.splice(index + delta, 0, column);
}
const previewViewport = ref<HTMLElement | null>(null);
const viewportSize = ref({ width: 0, height: 0 });
let viewportObserver: ResizeObserver | undefined;
watch(previewViewport, (viewport) => {
  viewportObserver?.disconnect();
  if (!viewport) return;
  viewportObserver = new ResizeObserver(([entry]) => {
    viewportSize.value = { width: entry.contentRect.width, height: entry.contentRect.height };
  });
  viewportObserver.observe(viewport);
}, { flush: 'post' });
const elementId = ref('');
const loading = ref(true);
const busy = ref(false);
const message = ref('');
const error = ref('');
const previewError = ref('');
const preview = ref('');
const rendering = ref(false);
const previewHeight = ref(100);
const previewBounds = ref<{ id: string; x: number; y: number; width: number; height: number }[]>([]);
const saved = ref('');
const previewBox = ref<HTMLElement | null>(null);
const canSave = computed(() => ['admin', 'manager'].includes(companyScope.auth.session.value?.role || ''));
const design = computed(() => settings.value.templates.find(t => t.id === selectedId.value));
const libraryTemplates = computed(() => settings.value.templates);
const needsReceiptChoice = computed(() => props.hideOriginalReceipt && settings.value.receiptId === null);
const choosingReceiptBase = ref(false);
const receiptBaseChooser = ref<HTMLElement | null>(null);
let receiptChooserTrigger: HTMLElement | null = null;
async function chooseReceiptBase(event: Event) { receiptChooserTrigger = event.currentTarget as HTMLElement; choosingReceiptBase.value = true; await nextTick(); receiptBaseChooser.value?.focus(); }
async function cancelReceiptBase() { choosingReceiptBase.value = false; await nextTick(); receiptChooserTrigger?.focus(); }
async function closeEditor() { editorOpen.value = false; await nextTick(); if (design.value?.kind === 'receipt') receiptChooserTrigger?.focus(); }
const element = computed(() => design.value?.elements.find(e => e.id === elementId.value));
const canvasHeight = computed(() => design.value?.kind === 'label' ? design.value.height : previewHeight.value);
const hitBounds = computed(() => design.value?.kind === 'label' ? design.value.elements : previewBounds.value);
const resizeHandles = computed<ResizeHandle[]>(() => design.value?.kind === 'receipt' ? ['e', 'se', 's', 'sw', 'w'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
const selectionBounds = computed(() => hitBounds.value.find(b => b.id === elementId.value));
const showGuides = ref(true);
const selectedIndex = computed(() => design.value?.elements.findIndex(e => e.id === elementId.value) ?? -1);
function duplicateElement() {
  if (!element.value || !design.value || design.value.elements.length >= 40 || busy.value) return;
  const copy = clone(element.value); copy.id = crypto.randomUUID();
  design.value.elements.splice(selectedIndex.value + 1, 0, copy); selectElement(copy.id);
}
function removeElement() {
  if (!design.value || !element.value || design.value.elements.length <= 1 || busy.value) return;
  const index = selectedIndex.value;
  design.value.elements.splice(index, 1);
  elementId.value = design.value.elements[Math.min(index, design.value.elements.length - 1)].id;
}
function setZoom(value: number) { if (Number.isFinite(value)) { zoom.value = Math.max(0.25, Math.min(3, value)); fitPreview.value = false; } }
function wheelZoom(event: WheelEvent) {
  event.preventDefault(); if (stopPointer) return; changeZoom(event.deltaY < 0 ? 0.1 : -0.1);
}
function canvasShortcut(event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable=true]') || busy.value) return;
  if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(0.25); }
  else if (event.key === '-') { event.preventDefault(); changeZoom(-0.25); }
  else if (event.key === '0') { event.preventDefault(); fitPreview.value = true; }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateElement(); }
  else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeElement(); }
  else if (design.value?.kind === 'receipt' && !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !(event.target as HTMLElement)?.closest('.resize-handle') && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && element.value) {
    event.preventDefault();
    const step = event.shiftKey ? 1 : 0.1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') element.value.x = Math.max(0, Math.min(design.value.width - element.value.width, Math.round((element.value.x + (event.key === 'ArrowLeft' ? -step : step)) * 10) / 10));
    else element.value.gapBefore = Math.max(0, Math.min(300, Math.round(((element.value.gapBefore || 0) + (event.key === 'ArrowUp' ? -step : step)) * 10) / 10));
  }
}
function alignBox(alignment: 'left' | 'center' | 'right') {
  if (!element.value || !design.value || busy.value) return;
  const space = Math.max(0, design.value.width - element.value.width);
  element.value.x = alignment === 'left' ? 0 : alignment === 'right' ? space : space / 2;
}
function panCanvas(event: PointerEvent) {
  if (event.button !== 0 && event.button !== 1 || (event.target as HTMLElement).closest('.preview-hit-area, .resize-handle')) return;
  const viewport = previewViewport.value!;
  event.preventDefault(); viewport.setPointerCapture(event.pointerId);
  const left = viewport.scrollLeft, top = viewport.scrollTop;
  const move = (next: PointerEvent) => { viewport.scrollLeft = left - next.clientX + event.clientX; viewport.scrollTop = top - next.clientY + event.clientY; };
  const stop = () => {
    viewport.removeEventListener('pointermove', move); viewport.removeEventListener('pointerup', stop); viewport.removeEventListener('pointercancel', stop); viewport.removeEventListener('lostpointercapture', stop);
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    stopPointer = undefined;
  };
  stopPointer?.(); stopPointer = stop;
  viewport.addEventListener('pointermove', move); viewport.addEventListener('pointerup', stop); viewport.addEventListener('pointercancel', stop); viewport.addEventListener('lostpointercapture', stop);
}
function startReceiptGesture(event: PointerEvent, id: string, handle?: ResizeHandle) {
  if (!design.value || busy.value || event.button !== 0 || !previewBox.value) return;
  stopPointer?.(); event.preventDefault(); event.stopPropagation(); selectElement(id);
  const item = element.value!, paper = design.value;
  const target = event.currentTarget as HTMLElement;
  target.focus({ preventScroll: true }); target.setPointerCapture(event.pointerId);
  const original = { x: item.x, y: 0, width: item.width, height: item.height, gapBefore: item.gapBefore };
  const pixelScale = previewBox.value.getBoundingClientRect().width / paper.width;
  history.begin();
  const movePointer = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) return;
    const dx = (next.clientX - event.clientX) / pixelScale, dy = (next.clientY - event.clientY) / pixelScale;
    if (handle) {
      const resized = resizeLabelBox(original, handle, dx, dy, { width: paper.width, height: 100 });
      Object.assign(item, { x: resized.x, width: resized.width, height: resized.height });
    } else {
      item.x = Math.max(0, Math.min(paper.width - item.width, Math.round((original.x + dx) * 10) / 10));
      item.gapBefore = Math.max(0, Math.min(300, Math.round(((original.gapBefore || 0) + dy) * 10) / 10));
    }
  };
  const stop = (end?: Event) => {
    target.removeEventListener('pointermove', movePointer); target.removeEventListener('pointerup', stop);
    target.removeEventListener('pointercancel', stop); target.removeEventListener('lostpointercapture', stop);
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    if (end?.type !== 'pointerup') Object.assign(item, { x: original.x, width: original.width, height: original.height, gapBefore: original.gapBefore });
    stopPointer = undefined; history.end();
  };
  stopPointer = stop;
  target.addEventListener('pointermove', movePointer); target.addEventListener('pointerup', stop);
  target.addEventListener('pointercancel', stop); target.addEventListener('lostpointercapture', stop);
}
const resizeLabels: Record<ResizeHandle, string> = { nw: 'top-left corner', n: 'top edge', ne: 'top-right corner', e: 'right edge', se: 'bottom-right corner', s: 'bottom edge', sw: 'bottom-left corner', w: 'left edge' };
let stopPointer: (() => void) | undefined;
const fields = computed(() => design.value?.kind === 'label' ? labelFields : receiptFields);
const availableVariables = computed(() => design.value?.kind === 'label'
  ? [...labelVariables, ...customVariables.value, ...labelFields.map(key => ({ key, label: friendlyField(key), group: 'Existing label fields', sample: '' }))]
  : receiptFields.map(key => ({ key, label: friendlyField(key), group: 'Receipt', sample: '' })));
const variableGroups = computed(() => {
  const query = variableSearch.value.trim().toLowerCase();
  const matches = availableVariables.value.filter(v => `${v.group} ${v.label} ${v.key}`.toLowerCase().includes(query));
  return [...new Set(matches.map(v => v.group))].map(group => ({ group, variables: matches.filter(v => v.group === group) }));
});
const selectedVariable = computed(() => availableVariables.value.find(v => v.key === element.value?.field));
function chooseVariable(key: string) {
  if (!element.value) return;
  element.value.field = key; variablePickerOpen.value = false; variableSearch.value = '';
}
async function loadCustomVariables() {
  variableError.value = '';
  try { customVariables.value = await $fetch<LabelVariable[]>('/api/settings/label-variables'); }
  catch { variableError.value = 'Custom fields could not be loaded.'; }
}
const dirty = computed(() => saved.value !== JSON.stringify(settings.value));
const previewZoom = computed(() => {
  if (!fitPreview.value || !design.value || !viewportSize.value.width) return zoom.value;
  // Receipts grow with their items. Fit their width and scroll vertically so
  // longer receipts remain readable; fixed-size labels still fit both axes.
  if (design.value.kind === 'receipt') return Math.max(0.1, Math.min(2, viewportSize.value.width / (design.value.width * 4)));
  return Math.max(0.1, Math.min(3, viewportSize.value.width / (design.value.width * 4), viewportSize.value.height / (canvasHeight.value * 4)));
});
function changeZoom(delta: number) {
  zoom.value = Math.max(0.25, Math.min(3, previewZoom.value + delta));
  fitPreview.value = false;
}
function selectElement(id: string) { elementId.value = id; editorTab.value = 'content'; }
const fieldLabels: Record<string, string> = { labelVariantSize: 'Variant name and size', code: 'Variant code', dprice: 'Discounted price', taxsummary: 'Tax summary', receiptDiscount: 'Discount / round off', receiptSavings: 'Savings', receiptDate: 'Receipt date', receiptUpiPayment: 'Receipt UPI payment', shopname: 'Shop name', sprice: 'Selling price', mrp: 'MRP', gstin: 'GST number', barcode: 'Barcode' };
const friendlyField = (field: string) => fieldLabels[field] || field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, s => s.toUpperCase());
const elementName = (e: PrintElement) => e.type === 'field' ? availableVariables.value.find(v => v.key === e.field)?.label || friendlyField(e.field || 'Variable') : e.type === 'text' ? e.text || 'Text' : e.type === 'qrcode' ? 'QR code' : e.type === 'items' ? 'Table' : friendlyField(e.type);
const printer = usePrint();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  choosingReceiptBase.value = false;
  loading.value = true; error.value = '';
  const companyId = companyScope.auth.session.value?.companyId;
  try {
    settings.value = await $fetch<PrintSettings>('/api/settings/print-templates');
    cachePrintSettings(companyId, settings.value);
    for (const template of settings.value.templates) {
      if (template.kind === 'receipt' && template.name === 'Classic Tax Receipt') template.name = 'Tax Receipt';
    }
    saved.value = JSON.stringify(settings.value);
    selectedId.value = settings.value.templates[0]?.id || '';
    history.reset();
  } catch (err: any) { error.value = err?.data?.statusMessage || 'Could not load print designs. Please retry.'; }
  finally { loading.value = false; }
}
onMounted(load);
onMounted(loadCustomVariables);
watch(elementId, () => { variablePickerOpen.value = false; variableSearch.value = ''; });
onBeforeUnmount(() => { stopPointer?.(); clearTimeout(timer); generation++; viewportObserver?.disconnect(); });
watch(selectedId, () => { elementId.value = design.value?.elements[0]?.id || ''; message.value = ''; });
watch([design, sampleReceipt, sampleLabel], () => {
  const run = ++generation;
  clearTimeout(timer);
  rendering.value = true; previewError.value = '';
  if (!design.value) { preview.value = ''; previewBounds.value = []; rendering.value = false; return; }
  timer = setTimeout(async () => {
    try {
      const t = clone(design.value!);
      const checked = printSettingsSchema.safeParse(settings.value);
      if (!checked.success) throw new Error(checked.error.issues[0]?.message);
      const rendered = await renderPrintTemplate(t, t.kind === 'receipt' ? sampleReceipt.value : sampleLabel.value);
      if (run !== generation) return;
      preview.value = rendered.canvas.toDataURL('image/png'); previewHeight.value = rendered.height; previewBounds.value = rendered.bounds;
    } catch (err: any) { if (run === generation) { previewError.value = err.message; preview.value = ''; previewBounds.value = []; } }
    finally { if (run === generation) rendering.value = false; }
  }, 120);
}, { deep: true });
function create(kind: 'receipt' | 'label', base: 'tax' | 'no-tax' = 'tax') {
  if (busy.value || settings.value.templates.length >= 12) return;
  choosingReceiptBase.value = false;
  editorTab.value = 'setup'; fitPreview.value = true;
  const template = kind === 'receipt' ? { ...(base === 'no-tax' ? noTaxReceiptTemplate() : classicReceiptTemplate()), id: crypto.randomUUID(), name: base === 'no-tax' ? 'My No Tax Receipt' : 'My Tax Receipt' } : defaultTemplate(kind);
  settings.value.templates.push(template); selectedId.value = template.id;
  editorOpen.value = true; zoom.value = kind === 'label' ? 2 : 1;
}
const receiptStyle = computed(() => design.value?.elements.some(e => e.type === 'taxsummary') ? 'tax' : 'taxless');
function applyClassic(mode: 'tax' | 'taxless' = 'tax') {
  if (design.value?.kind !== 'receipt') return;
  const preset = mode === 'taxless' ? taxlessReceiptTemplate() : classicReceiptTemplate();
  if (['Classic Tax Receipt', 'Tax Receipt', 'Taxless Receipt'].includes(design.value.name)) design.value.name = preset.name;
  Object.assign(design.value, { width: preset.width, fontFamily: preset.fontFamily, elements: preset.elements });
  elementId.value = preset.elements[0].id; fitPreview.value = true;
}
function edit(id: string) {
  receiptChooserTrigger = null;
  editorTab.value = 'setup'; fitPreview.value = true;
  selectedId.value = id;
  editorOpen.value = true;
  zoom.value = design.value?.kind === 'label' ? 2 : 1;
}
function resetLabelLayout() {
  if (design.value?.kind !== 'label') return;
  const base = originalLabelTemplate();
  Object.assign(design.value, { width: base.width, height: base.height, fontFamily: base.fontFamily, elements: base.elements });
  elementId.value = base.elements[0].id; fitPreview.value = true;
}
function duplicate() {
  if (!design.value) return;
  const copy = clone(design.value); copy.id = crypto.randomUUID(); copy.name = `${copy.name.slice(0, 70)} copy`;
  settings.value.templates.push(copy); selectedId.value = copy.id;
}
function removeDesign() {
  const id = selectedId.value;
  if (settings.value.receiptId === id) settings.value.receiptId = null;
  if (settings.value.labelId === id) settings.value.labelId = null;
  settings.value.templates = settings.value.templates.filter(t => t.id !== id);
  selectedId.value = settings.value.templates[0]?.id || '';
}
function add(type: PrintElement['type']) {
  if (!design.value) return;
  const e = newElement(type, design.value.width);
  if (type === 'field') e.field = design.value.kind === 'label' ? 'product.name' : fields.value[0];
  if (type === 'barcode' || type === 'qrcode') e.field = design.value.kind === 'label' ? 'barcode' : 'invoiceNumber';
  if (design.value.kind === 'label') e.height = Math.min(e.height, design.value.height - e.y);
  design.value.elements.push(e); elementId.value = e.id;
}
function move(index: number, change: number) {
  const list = design.value!.elements;
  if (index + change < 0 || index + change >= list.length) return;
  const [item] = list.splice(index, 1); list.splice(index + change, 0, item);
}
let dragged = '';
function drop(index: number) {
  const list = design.value!.elements;
  const from = list.findIndex(e => e.id === dragged);
  if (from < 0 || from === index) return;
  const [item] = list.splice(from, 1); list.splice(index, 0, item); dragged = '';
}
function startMove(event: PointerEvent, id: string, handle?: ResizeHandle) {
  if (design.value?.kind === 'receipt') { startReceiptGesture(event, id, handle); return; }
  if (design.value?.kind !== 'label' || busy.value || event.button !== 0 || !previewBox.value) return;
  stopPointer?.();
  event.preventDefault(); event.stopPropagation(); selectElement(id);
  const e = element.value!;
  const box = previewBox.value!.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const target = event.currentTarget as HTMLElement;
  target.focus({ preventScroll: true });
  target.setPointerCapture(event.pointerId);
  history.begin();
  const startX = event.clientX, startY = event.clientY;
  const original = { x: e.x, y: e.y, width: e.width, height: e.height };
  const width = design.value.width, height = design.value.height;
  const movePointer = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId || busy.value) return;
    const dx = (next.clientX - startX) * width / box.width;
    const dy = (next.clientY - startY) * height / box.height;
    if (handle) Object.assign(e, resizeLabelBox(original, handle, dx, dy, { width, height }));
    else {
      e.x = Math.max(0, Math.min(width - e.width, Math.round((original.x + dx) * 10) / 10));
      e.y = Math.max(0, Math.min(height - e.height, Math.round((original.y + dy) * 10) / 10));
    }
  };
  const stop = () => {
    target.removeEventListener('pointermove', movePointer); target.removeEventListener('pointerup', stop);
    target.removeEventListener('pointercancel', stop); target.removeEventListener('lostpointercapture', stop);
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    stopPointer = undefined;
    history.end();
  };
  stopPointer = stop;
  target.addEventListener('pointermove', movePointer); target.addEventListener('pointerup', stop);
  target.addEventListener('pointercancel', stop); target.addEventListener('lostpointercapture', stop);
}
function resizeWithKeyboard(event: KeyboardEvent, handle: ResizeHandle) {
  if (!element.value || !design.value || busy.value || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const step = event.shiftKey ? 1 : 0.1;
  const receipt = design.value.kind === 'receipt';
  const resized = resizeLabelBox(receipt ? { ...element.value, y: 0 } : element.value, handle,
    event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
    event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0, receipt ? { width: design.value.width, height: 100 } : design.value);
  Object.assign(element.value, receipt ? { x: resized.x, width: resized.width, height: resized.height } : resized);
}
function moveWithKeyboard(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || busy.value || stopPointer || design.value?.kind !== 'label' || !element.value) return;
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], .resize-handle')) return;
  event.preventDefault(); event.stopPropagation();
  const step = event.shiftKey ? 1 : 0.1;
  const box = element.value;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    box.x = Math.max(0, Math.min(design.value.width - box.width, Math.round((box.x + (event.key === 'ArrowLeft' ? -step : step)) * 10) / 10));
  } else {
    box.y = Math.max(0, Math.min(design.value.height - box.height, Math.round((box.y + (event.key === 'ArrowUp' ? -step : step)) * 10) / 10));
  }
}
async function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file || !element.value) return;
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 250000) { error.value = 'Use a PNG or JPEG logo smaller than 250 KB.'; return; }
  const target = element.value;
  const reader = new FileReader(); reader.onload = () => { target.image = String(reader.result); }; reader.readAsDataURL(file);
}
async function save() {
  const companyId = companyScope.auth.session.value?.companyId;
  stopPointer?.();
  error.value = ''; message.value = '';
  const checked = printSettingsSchema.safeParse(settings.value);
  if (!checked.success) { error.value = checked.error.issues[0]?.message || 'Check the design settings'; return; }
  busy.value = true;
  try {
    // Validate every design with sample data before making any one a company default.
    for (const t of checked.data.templates) await renderPrintTemplate(t, t.kind === 'receipt' ? sampleReceipt.value : sampleLabel.value);
    settings.value = await $fetch<PrintSettings>('/api/settings/print-templates', { method: 'PUT', body: checked.data });
    saved.value = JSON.stringify(settings.value); message.value = 'Designs saved for this company.';
    history.reset();
    cachePrintSettings(companyId, settings.value);
  } catch (err: any) { error.value = err?.data?.statusMessage || err.message || 'Could not save designs'; }
  finally { busy.value = false; }
}
async function output(mode: 'pdf' | 'print') {
  if (!design.value) return;
  error.value = ''; message.value = ''; busy.value = true;
  try {
    const t = clone(design.value), data = t.kind === 'receipt' ? sampleReceipt.value : sampleLabel.value;
    if (mode === 'pdf') await downloadTemplatePDF(t, data, `${t.kind}-sample.pdf`);
    else if (t.kind === 'receipt') await printer.printBill(data, t);
    else await printer.printLabel([data], `${t.width}x${t.height}mm`, t);
    if (mode === 'print') message.value = t.kind === 'label' ? 'Sample sent to the label printer.' : 'Sample sent to the receipt printer.';
  } catch (err: any) { error.value = err.message || 'Could not print the design'; }
  finally { busy.value = false; }
}
function discard() { choosingReceiptBase.value = false; stopPointer?.(); settings.value = JSON.parse(saved.value); history.reset(); selectedId.value = settings.value.templates[0]?.id || ''; editorOpen.value = false; error.value = ''; message.value = ''; }
function restoreHistory(direction: 'undo' | 'redo') {
  if (busy.value || loading.value) return;
  stopPointer?.();
  history[direction]();
  if (!design.value) selectedId.value = settings.value.templates[0]?.id || '';
  if (!element.value) elementId.value = design.value?.elements[0]?.id || '';
  error.value = ''; message.value = '';
}
function historyShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
  if ((event.target as HTMLElement)?.closest('[data-history-ignore]')) return;
  const key = event.key.toLowerCase();
  if (key !== 'z' && key !== 'y') return;
  event.preventDefault(); event.stopPropagation();
  restoreHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo');
}
</script>

<template>
  <section class="mb-8 pb-8 border-b-2 border-gray-300 dark:border-gray-600 designer">
    <h2 class="text-lg font-semibold">Receipt &amp; Label Designer</h2>
    <p class="text-sm text-gray-500 mb-4">Create and customize receipts and product labels for your company.</p>
    <p v-if="loading" role="status">Loading print designs…</p>
    <p v-if="error" role="alert" class="text-red-600 mb-3">{{ error }}</p>
    <p v-if="message" role="status" class="text-green-700 mb-3">{{ message }}</p>
    <UButton v-if="!loading && !saved" label="Retry loading designs" @click="load" />
    <template v-if="!loading && saved">
      <div class="design-toolbar">
        <div class="design-toolbar-actions">
          <UButton label="New receipt" :disabled="busy || settings.templates.length >= 12" @click="chooseReceiptBase" />
          <UButton label="New label" variant="soft" :disabled="busy || settings.templates.length >= 12" @click="create('label')" />
        </div>
        <div class="design-toolbar-actions">
          <span class="save-status" role="status">{{ dirty ? 'Unsaved changes' : 'All changes saved' }}</span>
          <UButton v-if="dirty" label="Discard changes" variant="soft" :disabled="busy" @click="discard" />
          <UButton label="Save designs" :loading="busy" :disabled="!canSave || !dirty || !!previewError" @click="save" />
        </div>
      </div>
      <p v-if="!canSave" class="text-sm mb-3">An administrator or manager can save company designs.</p>
      <div v-if="choosingReceiptBase" ref="receiptBaseChooser" class="receipt-base-chooser" tabindex="-1" role="group" aria-labelledby="receipt-base-title" @keydown.esc.stop="cancelReceiptBase">
        <div class="section-heading"><div><h3 id="receipt-base-title">Choose a starting template</h3><p>You can change the layout, text and columns in the editor.</p></div><button type="button" @click="cancelReceiptBase">Cancel</button></div>
        <div class="receipt-base-grid">
          <button type="button" class="receipt-base-card" :disabled="busy || settings.templates.length >= 12" @click="create('receipt', 'tax')"><strong>Tax Receipt</strong><span>Item tax details, tax summary and payment QR.</span><span class="receipt-base-link">Start with Tax Receipt &rarr;</span></button>
          <button type="button" class="receipt-base-card" :disabled="busy || settings.templates.length >= 12" @click="create('receipt', 'no-tax')"><strong>No Tax Receipt</strong><span>Six-column item table with no tax summary.</span><span class="receipt-base-link">Start with No Tax Receipt &rarr;</span></button>
        </div>
      </div>
      <div class="design-defaults">
        <div class="section-heading"><div><h3>Print defaults</h3><p>Choose which design to use for each print. Save to apply your changes.</p></div></div>
        <div class="default-selectors">
          <label>Default receipt<select v-model="settings.receiptId" aria-label="Default receipt">
            <option v-if="settings.receiptId === null" :value="null" disabled>Choose a receipt design</option>
            <optgroup label="Base templates"><option :value="NO_TAX_RECEIPT_ID">No Tax Receipt</option><option :value="CLASSIC_RECEIPT_ID">Tax Receipt</option></optgroup>
            <optgroup v-if="settings.templates.some(t => t.kind === 'receipt')" label="Your receipt designs"><option v-for="t in settings.templates.filter(t => t.kind === 'receipt')" :key="t.id" :value="t.id">{{ t.name }}</option></optgroup>
          </select></label>
          <label>Default product label<select v-model="settings.labelId" aria-label="Default product label">
            <option v-if="settings.labelId === null" :value="null" disabled>Choose a label design</option>
            <optgroup label="Base templates"><option :value="STANDARD_LABEL_ID">Standard Label (50 x 38 mm)</option></optgroup>
            <optgroup v-if="settings.templates.some(t => t.kind === 'label')" label="Your label designs"><option v-for="t in settings.templates.filter(t => t.kind === 'label')" :key="t.id" :value="t.id">{{ t.name }}</option></optgroup>
          </select></label>
        </div>
        <p v-if="needsReceiptChoice" class="default-help">Your previous receipt is still active. Choose a base template or a saved receipt to replace it.</p>
        <details class="base-previews"><summary>Preview the base templates</summary><div class="design-toolbar-actions">
          <UButton label="Preview No Tax Receipt" variant="soft" @click="presetPreview = 'no-tax'" />
          <UButton label="Preview Tax Receipt" variant="soft" @click="presetPreview = 'classic'" />
        </div></details>
      </div>
      <PrinterDesignerWorkspace v-if="presetPreview" :fullscreen="true" :open="true" kind="receipt" :title="presetPreview === 'no-tax' ? 'No Tax Receipt' : 'Tax Receipt'" :busy="busy" :dirty="dirty" @close="presetPreview = null">
        <template #actions>
          <UButton label="Use for company" :disabled="busy || !canSave" @click="settings.receiptId = presetPreview === 'no-tax' ? NO_TAX_RECEIPT_ID : CLASSIC_RECEIPT_ID; save()" />
          <UButton label="Download PDF" :disabled="busy" @click="presetOutput('pdf')" />
          <UButton label="Test print" :disabled="busy" @click="presetOutput('print')" />
        </template>
        <div v-if="presetPreview" class="h-full overflow-auto">
          <p v-if="error" role="alert" class="text-red-600 mb-3">{{ error }}</p>
          <p v-if="message" role="status" class="mb-3">{{ message }}</p>
          <div class="preset-receipt preset-receipt-classic"><ThermalReceipt :data="presetData" /></div>
          <p class="text-sm text-gray-500 mt-3 text-center">Sample receipt. Actual bills use your company details, tax settings and UPI address.</p>
        </div>
      </PrinterDesignerWorkspace>
      <div class="section-heading"><div><h3>Your designs</h3><p>Open a receipt or product label to edit it.</p></div></div>
      <p v-if="!libraryTemplates.length" class="empty-designs">No custom designs yet. Choose New receipt or New label to create one.</p>
      <div v-else class="template-library">
        <button v-for="t in libraryTemplates" :key="t.id" type="button" class="template-card" :class="{ 'template-card-selected': editorOpen && t.id === selectedId }" :disabled="busy" @click="edit(t.id)">
          <span class="template-card-icon" aria-hidden="true">{{ t.kind === 'label' ? '▤' : '▥' }}</span>
          <span class="template-card-description"><strong>{{ t.name }}<small v-if="settings.receiptId === t.id || settings.labelId === t.id" class="default-badge">Default</small></strong><span>{{ t.kind === 'label' ? `${t.width} × ${t.height} mm label` : `${t.width} mm receipt` }} · {{ t.dpi }} DPI</span></span>
          <span class="template-card-link">Edit {{ t.kind }} →</span>
        </button>
      </div>
      <details class="printer-help"><summary>Printer setup tips</summary><p>Match the printable width and resolution to your printer. Connect and assign your WebUSB printers above. Saved company defaults are used by billing and product printing.</p></details>
      <div @keydown.capture="historyShortcut" @keydown="moveWithKeyboard($event); canvasShortcut($event)">
      <PrinterDesignerWorkspace v-if="design" :fullscreen="true" :kind="design.kind" :open="editorOpen" :title="design.name || `Untitled ${design.kind}`" :busy="busy" :dirty="dirty" @close="closeEditor">
        <template #actions>
          <UButton label="Download PDF" variant="soft" :disabled="busy || rendering || !preview || !!previewError" @click="output('pdf')" />
          <UButton label="Test print" variant="soft" :disabled="busy || rendering || !preview || !!previewError" @click="output('print')" />
          <div v-if="design.kind === 'receipt'" class="receipt-style" role="group" aria-label="Receipt template">
            <button type="button" :disabled="busy" :aria-pressed="receiptStyle === 'tax'" @click="applyClassic('tax')">Tax</button>
            <button type="button" :disabled="busy" :aria-pressed="receiptStyle === 'taxless'" @click="applyClassic('taxless')">Taxless</button>
          </div>
          <UButton label="Undo" title="Undo (Ctrl+Z)" variant="soft" :disabled="busy || !canUndo" @click="restoreHistory('undo')" />
          <UButton label="Redo" title="Redo (Ctrl+Y)" variant="soft" :disabled="busy || !canRedo" @click="restoreHistory('redo')" />
          <UButton label="Save designs" :loading="busy" :disabled="!canSave || !dirty || !!previewError" @click="save" />
        </template>
        <div class="designer designer-workspace">
        <p v-if="error" role="alert" class="text-red-600 mb-3">{{ error }}</p>
        <p v-if="message" role="status" class="text-green-700 mb-3">{{ message }}</p>
        <div class="editor-layout">
        <fieldset :disabled="busy" class="editor-sidebar min-w-0">
          <div class="editor-tabs" aria-label="Editor controls">
            <button type="button" data-editor-tab="setup" :aria-pressed="editorTab === 'setup'" @click="editorTab = 'setup'">{{ design.kind === 'label' ? 'Label setup' : 'Receipt setup' }}</button>
            <button type="button" data-editor-tab="content" :aria-pressed="editorTab === 'content'" @click="editorTab = 'content'">Content <span>{{ design.elements.length }}</span></button>
          </div>
          <div class="controls-scroll">
          <div v-show="editorTab === 'setup'" class="setup-controls">
            <div class="control-heading"><p v-if="design.kind === 'label'">New labels start with the original label layout. Edit any item in Content.</p><h3>Paper &amp; design</h3><p>{{ design.kind === 'receipt' ? 'Set the receipt width to match the printable area of your paper.' : 'Set your label size to match the paper in your printer.' }}</p></div>
            <label>Design name<input v-model="design.name" maxlength="80" /></label>
            <label>Typeface<select v-model="design.fontFamily"><option :value="undefined">Standard</option><option value="thermal">Condensed thermal</option></select></label>
            <label>Standard paper size<select aria-label="Standard paper size" :value="paperPresetValue" @change="setPaperSize(($event.target as HTMLSelectElement).value)"><option value="">Custom size</option><option v-for="size in paperSizes" :key="size.label" :value="'height' in size ? `${size.width}x${size.height}` : String(size.width)">{{ size.label }}</option></select></label>
            <div class="control-grid three-columns">
              <label>Width (mm)<input :value="design.width" @change="setPaperSize(`${Number(($event.target as HTMLInputElement).value)}x${design.height}`)" type="number" min="25" max="100" step="1" /></label>
              <label v-if="design.kind === 'label'">Height (mm)<input :value="design.height" @change="setPaperSize(`${design.width}x${Number(($event.target as HTMLInputElement).value)}`)" type="number" min="15" max="150" step="1" /></label>
              <label>Resolution<select v-model="design.dpi"><option value="203">203 DPI</option><option value="300">300 DPI</option></select></label>
            </div>
            <label v-if="design.kind === 'label'" class="default-choice"><input type="checkbox" :checked="settings.labelId === design.id" @change="settings.labelId = settings.labelId === design.id ? null : design.id" /> Use as default product label</label>
            <label v-else class="default-choice"><input type="checkbox" :checked="settings.receiptId === design.id" @change="settings.receiptId = settings.receiptId === design.id ? CLASSIC_RECEIPT_ID : design.id" /> Use as default receipt</label>
            <div class="design-actions"><UButton v-if="design.kind === 'label'" label="Use original label layout" variant="soft" @click="resetLabelLayout" /><UButton v-if="design.kind === 'receipt'" label="Use photo layout" variant="soft" @click="applyClassic()" /><UButton label="Duplicate" variant="soft" :disabled="settings.templates.length >= 12" @click="duplicate" /><UButton label="Delete design" variant="soft" color="red" @click="removeDesign" /></div>
          </div>
          <div v-show="editorTab === 'content'" class="content-controls">
            <div class="control-heading"><h3>What goes on your {{ design.kind }}?</h3><p>Select an item below or click it in the preview to edit.</p></div>
            <div class="add-tools" aria-label="Add content">
              <UButton v-for="type in (design.kind === 'receipt' ? ['text', 'field', 'items', 'taxsummary', 'spacer', 'line', 'barcode', 'qrcode', 'logo'] : ['text', 'field', 'line', 'barcode', 'qrcode', 'logo'])" :key="type" :label="type === 'items' ? '+ Table' : type === 'field' ? '+ Variable' : type === 'qrcode' ? '+ QR code' : '+ ' + friendlyField(type)" variant="outline" size="sm" :disabled="design.elements.length >= 40" @click="add(type as PrintElement['type'])" />
            </div>
            <div class="content-body">
            <div class="element-list">
              <div v-for="(e, i) in design.elements" :key="e.id" class="element-row" :class="{ 'element-selected': elementId === e.id }" draggable="true" @dragstart="dragged = e.id" @dragover.prevent @drop.prevent="drop(i)">
                <button type="button" class="element-select" :title="elementName(e)" :aria-pressed="elementId === e.id" @click="selectElement(e.id)"><span class="element-number">{{ i + 1 }}</span><span>{{ elementName(e) }}</span></button>
                <button type="button" :disabled="i === 0" aria-label="Move section up" @click="move(i, -1)">↑</button>
                <button type="button" :disabled="i === design.elements.length - 1" aria-label="Move section down" @click="move(i, 1)">↓</button>
              </div>
            </div>
            <div v-if="element" class="element-properties" :key="element.id">
              <div class="properties-heading"><h3>{{ elementName(element) }}</h3><span>Selected item</span></div>
              <div v-if="element.type === 'items'" class="table-controls">
                <p>Each column has one heading and a variable for every bill item. Headings and values wrap automatically and share the same width and alignment.</p>
                <UButton label="Use two-line item layout" variant="soft" @click="twoLineTable" />
                <UButton v-if="!element.columns" label="Customize table columns" @click="customizeTable" />
                <template v-else>
                  <label>Find a column variable<input v-model="columnSearch" data-history-ignore type="search" placeholder="Product, brand, category, size…" /></label>
                  <div v-for="(column, index) in element.columns" :key="column.id" class="table-column">
                    <div class="table-column-heading"><strong>Column {{ index + 1 }}</strong><div>
                      <button type="button" :disabled="index === 0" aria-label="Move column left" @click="moveColumn(index, -1)">←</button>
                      <button type="button" :disabled="index === element.columns.length - 1" aria-label="Move column right" @click="moveColumn(index, 1)">→</button>
                      <button type="button" :disabled="element.columns.length === 1" aria-label="Remove column" @click="element.columns.splice(index, 1)">Remove</button>
                    </div></div>
                    <label>Heading<textarea v-model="column.header" rows="2" maxlength="200" placeholder="Enter a heading; Enter adds a new line" /></label>
                    <label>Row variable<select v-model="column.field"><option :value="column.field">{{ [...receiptTableVariables, ...customVariables].find(v => v.key === column.field)?.label || column.field }}</option><optgroup v-for="group in tableVariableGroups" :key="group.group" :label="group.group"><option v-for="variable in group.variables" :key="variable.key" :value="variable.key">{{ variable.label }}</option></optgroup></select></label>
                    <div class="control-grid">
                      <label>Layout line<select :value="column.line || 1" @change="column.line = Number(($event.target as HTMLSelectElement).value)"><option :value="1">Line 1</option><option :value="2">Line 2</option><option :value="3">Line 3</option></select></label>
                      <label>Width (%)<input :value="Number(columnPercent(index).toFixed(1))" type="number" min="1" max="100" step="1" @change="setColumnWidth(index, Number(($event.target as HTMLInputElement).value))" /><small>{{ (element.width * columnPercent(index) / 100).toFixed(1) }} mm</small></label>
                      <label>Column alignment<select v-model="column.align"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                    </div>
                    <label>Text after value<input v-model="column.suffix" maxlength="20" placeholder="e.g. %" /></label>
                    <label v-if="/^entry\.(qty|mrp|value|discount|discountAmount|tvalue)$/.test(column.field)" class="bold-choice"><input v-model="column.total" type="checkbox" /> Sum this column in totals row</label>
                  </div>
                  <UButton label="Add column" :disabled="element.columns.length >= 12" variant="outline" @click="addColumn" />
                  <div class="control-grid">
                    <label>Cell padding (mm)<input v-model.number="element.tablePadding" type="number" min="0" max="3" step="0.1" /></label>
                    <label class="bold-choice"><input v-model="element.tableBorders" type="checkbox" /> Table borders</label>
                    <label>Gap after each item (mm)<input v-model.number="element.tableItemGap" type="number" min="0" max="10" step="0.5" /></label>
                    <label class="bold-choice"><input v-model="element.tableRules" type="checkbox" /> Header and footer rules</label>
                    <label class="bold-choice"><input v-model="element.tableTotals" type="checkbox" /> Show totals row</label>
                    <label class="bold-choice"><input :checked="element.tableHeaderBold !== false" type="checkbox" @change="element.tableHeaderBold = ($event.target as HTMLInputElement).checked" /> Bold headings</label>
                  </div>
                </template>
              </div>
              <div v-if="element.type === 'field' || element.type === 'barcode' || element.type === 'qrcode'" class="variable-control">
                <span class="variable-label">Variable</span>
                <button type="button" class="variable-trigger" :aria-expanded="variablePickerOpen" @click="variablePickerOpen = !variablePickerOpen">
                  <span><small v-if="selectedVariable">{{ selectedVariable.group }}</small>{{ selectedVariable?.label || element.field || 'Choose a variable' }}</span><span aria-hidden="true">▾</span>
                </button>
                <div v-if="variablePickerOpen" class="variable-picker">
                  <label>Find a variable<input v-model="variableSearch" data-history-ignore type="search" placeholder="Search company, category, size, supplier…" /></label>
                  <div class="variable-results">
                    <section v-for="group in variableGroups" :key="group.group"><h4>{{ group.group }}</h4><button v-for="variable in group.variables" :key="variable.key" type="button" :aria-pressed="element.field === variable.key" @click="chooseVariable(variable.key)">{{ variable.label }}</button></section>
                    <p v-if="!variableGroups.length">No matching variables.</p>
                  </div>
                  <p v-if="variableError" class="variable-note">{{ variableError }} <button type="button" @click="loadCustomVariables">Retry</button></p>
                  <button type="button" class="variable-clear" @click="chooseVariable('')">Use custom text only</button>
                </div>
                <p v-if="element.field" class="variable-note">Sample: {{ fieldValue(design.kind === 'label' ? sampleLabel : receiptData, element.field) || 'No value' }}</p>
                <p v-if="element.field.startsWith('distributor') || element.field.startsWith('purchaseorder.')" class="variable-note">Uses the supplier linked to this product's purchase order. Blank when no supplier is linked.</p>
              </div>
              <label v-if="['field', 'text', 'barcode', 'qrcode'].includes(element.type)">{{ element.field ? 'Text before field' : 'Text' }}<textarea v-model="element.text" rows="2" maxlength="2000" placeholder="Enter your text" /></label>
              <label v-if="element.type === 'logo'">Logo (PNG/JPEG, up to 250 KB)<input type="file" accept="image/png,image/jpeg" @change="upload" /></label>
              <div v-if="['text', 'field', 'items', 'taxsummary'].includes(element.type)" class="control-grid three-columns">
                <label>Text size (pt)<input v-model.number="element.fontSize" type="number" min="6" max="32" /></label>
                <label v-if="element.type !== 'items'">Alignment<select v-model="element.align"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                <label class="bold-choice"><input v-model="element.bold" type="checkbox" /> Bold text</label>
              </div>
              <div v-if="design.kind === 'label'" class="control-grid">
                <label>Show this item<select :value="element.visibility || 'always'" @change="element.visibility = ($event.target as HTMLSelectElement).value as PrintElement['visibility']"><option value="always">Always</option><option value="discount">Only when discounted</option><option value="no-discount">Only when not discounted</option></select></label>
                <label v-if="['field', 'text'].includes(element.type)">Strike through<select :value="element.strikeThrough || 'never'" @change="element.strikeThrough = ($event.target as HTMLSelectElement).value as PrintElement['strikeThrough']"><option value="never">Never</option><option value="always">Always</option><option value="discount">Only when discounted</option></select></label>
                <p class="variable-note">Discounted means the discounted price is lower than MRP. Add separate items with opposite rules for an if/else layout. Hidden items stay selectable here.</p>
              </div>
              <details class="position-controls">
                <summary>Position &amp; size <span>mm</span></summary>
                <div class="control-grid">
                  <label>From left<input v-model.number="element.x" type="number" min="0" step="0.1" /></label>
                  <label v-if="design.kind === 'label'">From top<input v-model.number="element.y" type="number" min="0" step="0.1" /></label>
                  <label>Width<input v-model.number="element.width" type="number" min="2" step="0.1" /></label>
                  <label v-if="design.kind === 'receipt'">Space above (mm)<input v-model.number="element.gapBefore" type="number" min="0" max="300" step="0.5" /></label>
                  <label v-if="design.kind === 'receipt'">Gap after section (mm)<input v-model.number="element.gapAfter" type="number" min="0" max="30" step="0.5" /></label>
                  <label>{{ design.kind === 'receipt' ? 'Minimum height' : 'Height' }}<input v-model.number="element.height" type="number" min="2" step="0.1" /></label>
                </div>
              </details>
              <label v-if="design.kind === 'receipt' && ['text', 'field'].includes(element.type)" class="bold-choice"><input v-model="element.inverse" type="checkbox" /> White text on black</label>
              <UButton label="Remove element" color="red" variant="soft" size="xs" :disabled="design.elements.length <= 1" @click="removeElement" />
            </div>
            <p v-else class="empty-selection">Select an item to change its text, style or position. Use the buttons above to add something new.</p>
            </div>
          </div>
          </div>
        </fieldset>
        <div v-if="design" class="editor-preview min-w-0">

          <p v-if="previewError" role="alert" class="text-red-600 mb-3">{{ previewError }}</p>
          <div class="canvas-toolbar"><select aria-label="Canvas paper size" :value="paperPresetValue" @change="setPaperSize(($event.target as HTMLSelectElement).value)"><option value="">Custom size</option><option v-for="size in paperSizes" :key="size.label" :value="'height' in size ? `${size.width}x${size.height}` : String(size.width)">{{ size.label }}</option></select><select v-if="design.kind === 'label'" v-model="labelPreviewMode" aria-label="Sample discount scenario" style="width: 150px"><option value="current">Sample data</option><option value="discount">With discount</option><option value="no-discount">Without discount</option></select><span role="status">{{ rendering ? 'Updating...' : 'Canvas' }}</span><div><button type="button" class="fit-button" :aria-pressed="fitPreview" @click="fitPreview = true">{{ design.kind === 'receipt' ? 'Fit width' : 'Fit' }}</button><button type="button" aria-label="Zoom out" :disabled="previewZoom <= 0.25" @click="changeZoom(-0.25)">−</button><select aria-label="Preview zoom" :value="Math.round(previewZoom * 100)" @change="setZoom(Number(($event.target as HTMLSelectElement).value) / 100)"><option v-if="![25,50,75,100,150,200,300].includes(Math.round(previewZoom * 100))" :value="Math.round(previewZoom * 100)">{{ Math.round(previewZoom * 100) }}%</option><option v-for="level in [25,50,75,100,150,200,300]" :key="level" :value="level">{{ level }}%</option></select><button type="button" aria-label="Zoom in" :disabled="previewZoom >= 3" @click="changeZoom(0.25)">+</button></div></div>
          <div class="selection-toolbar" aria-label="Selected section actions">
            <template v-if="element"><strong>{{ elementName(element) }}</strong><button type="button" :disabled="busy || selectedIndex === 0" @click="move(selectedIndex, -1)" aria-label="Move selected item up">&uarr;</button><button type="button" :disabled="busy || selectedIndex === design.elements.length - 1" @click="move(selectedIndex, 1)" aria-label="Move selected item down">&darr;</button><button type="button" :disabled="busy || design.elements.length >= 40" @click="duplicateElement">Duplicate item</button><button type="button" :disabled="busy || design.elements.length <= 1" @click="removeElement">Delete item</button></template>
            <template v-if="element"><button v-for="alignment in (['left', 'center', 'right'] as const)" :key="alignment" type="button" :disabled="busy" :aria-label="`Align box ${alignment}`" @click="alignBox(alignment)">{{ alignment }}</button></template>
            <button type="button" :aria-pressed="showGuides" @click="showGuides = !showGuides">Guides</button>
          </div>
          <div ref="previewViewport" class="canvas-workbench" tabindex="0" aria-label="Design canvas. Plus and minus zoom; zero fits the view." @wheel="wheelZoom" @pointerdown="panCanvas">
            <div ref="previewBox" class="preview-paper" :style="{ width: `${design.width * 4 * previewZoom}px`, aspectRatio: `${design.width} / ${canvasHeight}`, flexShrink: 0 }">
              <img v-if="preview" :src="preview" alt="Sample of the designed print" class="preview-image" draggable="false" />
              <button v-for="b in hitBounds" :key="b.id" type="button" :aria-label="`Select ${design.elements.find(e => e.id === b.id)?.type} element`" class="preview-hit-area" :class="{ 'preview-hit-selected': elementId === b.id, 'preview-hit-guide': showGuides }" :style="{ left: `${b.x / design.width * 100}%`, top: `${b.y / canvasHeight * 100}%`, width: `${b.width / design.width * 100}%`, height: `${b.height / canvasHeight * 100}%`, cursor: 'grab' }" @click="selectElement(b.id)" @pointerdown="startMove($event, b.id)" />
              <div v-if="element && selectionBounds" class="resize-selection" :style="{ left: `${selectionBounds.x / design.width * 100}%`, top: `${selectionBounds.y / canvasHeight * 100}%`, width: `${selectionBounds.width / design.width * 100}%`, height: `${selectionBounds.height / canvasHeight * 100}%` }">
                <button v-for="handle in resizeHandles" :key="handle" type="button" class="resize-handle" :data-handle="handle" :aria-label="`Resize ${resizeLabels[handle]}`" :title="'Drag to resize. Arrow keys adjust; Shift adjusts by 1 mm.'" :disabled="busy" :style="{ left: handle.includes('w') ? '0%' : handle.includes('e') ? '100%' : '50%', top: handle.includes('n') ? '0%' : handle.includes('s') ? '100%' : '50%', cursor: `${handle}-resize` }" @pointerdown="startMove($event, element.id, handle)" @keydown="resizeWithKeyboard($event, handle)" @click.stop />
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
      </PrinterDesignerWorkspace>
      </div>
    </template>
  </section>
</template>

<style scoped>
.selection-toolbar { flex-shrink: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 8px 12px; background: white; border: 1px solid #e2e8f0; border-top: 0; font-size: 12px; }
.selection-toolbar strong { flex: 1; min-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.selection-toolbar button { padding: 5px 8px; border: 1px solid #cbd5e1; border-radius: 5px; }
.selection-toolbar button[aria-pressed=true] { color: #c2410c; background: #fff7ed; }
.canvas-tip { font-size: 11px; color: #64748b; margin-top: 8px; }
.canvas-toolbar select { width: 78px; margin: 0; padding: 4px; font-size: 12px; }
.preview-hit-area.preview-hit-guide { border: 1px dashed #94a3b855; }
.drop-marker { position: absolute; left: 0; right: 0; height: 3px; background: #f97316; pointer-events: none; z-index: 5; }
.drop-marker span { position: absolute; right: 0; bottom: 3px; padding: 3px 6px; background: #c2410c; color: white; font-size: 11px; border-radius: 3px; }
:global(.dark) .selection-toolbar { background: #111827; border-color: #334155; }

.design-toolbar, .design-toolbar-actions, .section-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.design-toolbar { justify-content: space-between; margin-bottom: 24px; }
.save-status { font-size: 12px; color: #64748b; }
.section-heading { justify-content: space-between; margin-bottom: 14px; }
.section-heading h3 { font-size: 14px; font-weight: 600; }
.section-heading p, .default-help, .printer-help p { margin-top: 4px; font-size: 13px; color: #64748b; }
.design-defaults { padding: 18px; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px; }
.default-selectors, .receipt-base-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.base-previews { margin-top: 16px; font-size: 13px; }
.base-previews summary, .printer-help summary { cursor: pointer; color: #475569; }
.base-previews .design-toolbar-actions { margin-top: 12px; }
.receipt-base-chooser { padding: 20px; margin-bottom: 24px; border: 1px solid #fdba74; background: #fff7ed; color: #0f172a; border-radius: 12px; }
.receipt-base-chooser:focus { outline: 2px solid #fb923c; outline-offset: 3px; }
.receipt-base-card { display: grid; gap: 8px; text-align: left; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background: white; color: #0f172a; }
.receipt-base-card:hover { border-color: #f97316; }
.receipt-base-card > span { font-size: 13px; color: #64748b; }
.receipt-base-card .receipt-base-link { margin-top: 8px; color: #c2410c; font-weight: 600; }
.empty-designs { padding: 24px; border: 1px dashed #cbd5e1; border-radius: 12px; font-size: 13px; color: #64748b; margin-bottom: 20px; }
.default-badge { margin-left: 8px; padding: 3px 6px; background: #fff7ed; color: #c2410c; border-radius: 4px; font-size: 10px; font-weight: 500; }
.printer-help { margin-top: 16px; font-size: 12px; }
@media (max-width: 600px) { .default-selectors, .receipt-base-grid { grid-template-columns: 1fr; } .design-toolbar { align-items: flex-start; flex-direction: column; } }

.receipt-style { display: flex; padding: 3px; border: 1px solid #fed7aa; border-radius: 8px; gap: 3px; }
.receipt-style button { padding: 6px 12px; border-radius: 5px; font-size: 14px; }
.receipt-style button[aria-pressed=true] { background: #f97316; color: white; }

.table-controls { display: grid; gap: 12px; }
.table-controls > p { font-size: 12px; color: #64748b; }
.table-column { display: grid; gap: 10px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; }
.table-column-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 13px; }
.table-column-heading button { padding: 4px 6px; }
.designer label { display: block; font-size: 0.875rem; }
.designer input:not([type=checkbox]), .designer select, .designer textarea { display: block; width: 100%; margin-top: 4px; border: 1px solid #9ca3af; border-radius: 6px; padding: 6px 8px; background: transparent; }
.designer input[type=checkbox] { width: 16px; height: 16px; }
.designer button:disabled { opacity: 0.45; }
.template-library { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 24px; }
.template-card { display: flex; align-items: center; gap: 12px; text-align: left; padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; transition: border-color .15s, box-shadow .15s; }
.template-card:hover, .template-card-selected { border-color: #60a5fa; box-shadow: 0 0 0 1px #60a5fa; }
.template-card-icon { display: grid; place-items: center; width: 40px; height: 44px; border-radius: 8px; color: #2563eb; background: #eff6ff; font-size: 24px; }
.template-card-description { flex: 1; min-width: 0; display: grid; gap: 4px; }
.template-card-description strong { font-size: 14px; overflow: hidden; text-overflow: ellipsis; }
.template-card-description span { font-size: 12px; color: #64748b; }
.template-card-link { font-size: 12px; color: #2563eb; white-space: nowrap; }
.editor-layout { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(320px, 1fr); gap: 12px; }
.editor-sidebar { min-width: 0; min-height: 0; margin: 0; padding: 0; border: 1px solid #e2e8f0; border-radius: 12px; background: white; display: flex; flex-direction: column; overflow: hidden; }
.editor-tabs { display: flex; flex: none; gap: 6px; padding: 8px; border-bottom: 1px solid #e2e8f0; }
.editor-tabs button { flex: 1; padding: 10px 12px; border-radius: 7px; font-size: 14px; font-weight: 600; color: #64748b; }
.editor-tabs button[aria-pressed=true] { color: #c2410c; background: #fff7ed; }
.editor-tabs span { margin-left: 6px; font-size: 11px; }
.controls-scroll { overflow: auto; min-height: 0; padding: 20px; scrollbar-gutter: stable; }
.setup-controls, .content-controls { display: grid; gap: 16px; }
.control-heading h3, .properties-heading h3 { font-size: 15px; font-weight: 650; margin: 0; }
.control-heading p { font-size: 12px; color: #64748b; margin: 5px 0 0; }
.control-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.three-columns { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.add-tools, .paper-presets, .design-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.paper-presets button { padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 7px; font-size: 13px; }
.paper-presets button[aria-pressed=true] { background: #fff7ed; border-color: #fb923c; color: #c2410c; }
.paper-presets span { width: 100%; font-size: 12px; color: #64748b; }
.designer .default-choice, .designer .bold-choice { display: flex; align-items: center; gap: 8px; }
.bold-choice { padding-top: 22px; }
.element-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; max-height: 160px; overflow: auto; }
.element-row { display: flex; min-width: 0; align-items: center; border: 1px solid #e2e8f0; border-radius: 7px; }
.element-selected { border-color: #fb923c; background: #fff7ed; color: #9a3412; }
.element-select { display: flex; align-items: center; gap: 7px; min-width: 0; flex: 1; text-align: left; }
.element-select > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.element-number { color: #94a3b8; font-size: 11px; }
.element-properties { display: grid; gap: 14px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
.properties-heading { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
.properties-heading h3 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.properties-heading span { flex: none; font-size: 11px; color: #c2410c; background: #fff7ed; border-radius: 4px; padding: 4px 6px; }
.position-controls { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
.position-controls summary { cursor: pointer; font-size: 13px; font-weight: 600; }
.position-controls summary span { float: right; font-size: 11px; font-weight: 400; color: #64748b; }
.position-controls[open] summary { margin-bottom: 12px; }
.empty-selection { padding: 16px; background: #f8fafc; color: #64748b; border-radius: 8px; font-size: 13px; }
.design-actions { padding-top: 16px; border-top: 1px solid #e2e8f0; }
.variable-control { min-width: 0; }
.variable-label { display: block; font-size: 14px; margin-bottom: 5px; }
.variable-trigger { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 9px 10px; border: 1px solid #cbd5e1; border-radius: 6px; text-align: left; background: white; font-size: 14px; }
.variable-trigger small { display: block; color: #64748b; font-size: 11px; }
.variable-picker { padding: 10px; border: 1px solid #fdba74; border-radius: 8px; margin-top: 6px; background: #fff; }
.variable-results { max-height: 220px; overflow: auto; margin-top: 8px; }
.variable-results h4 { position: sticky; top: 0; background: #f8fafc; padding: 7px; font-size: 11px; color: #64748b; font-weight: 600; }
.variable-results button { display: block; width: 100%; padding: 8px; text-align: left; border-radius: 5px; font-size: 13px; }
.variable-results button:hover, .variable-results button[aria-pressed=true] { background: #fff7ed; color: #c2410c; }
.variable-note { margin-top: 6px; font-size: 11px; color: #64748b; overflow-wrap: anywhere; }
.variable-note button, .variable-clear { color: #c2410c; text-decoration: underline; font-size: 12px; }
.variable-clear { margin-top: 10px; }
:global(.dark) .variable-trigger, :global(.dark) .variable-picker { background: #0f172a; border-color: #475569; }
:global(.dark) .variable-results h4 { background: #1e293b; color: #cbd5e1; }
.panel-title { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; color: #64748b; }
.designer input:not([type=checkbox]), .designer select, .designer textarea { padding: 9px 10px; border-color: #cbd5e1; background: #fff; transition: box-shadow .15s; }
.designer input:focus-visible, .designer select:focus-visible, .designer textarea:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
.element-list button { padding: 6px; font-size: 13px; }
.content-body { display: grid; gap: 16px; }
@media (min-width: 1100px) {
  .content-body { grid-template-columns: minmax(0, 0.85fr) minmax(0, 2fr); align-items: start; }
  .element-list { grid-template-columns: 1fr; max-height: 280px; }
  .element-properties { border-top: 0; border-left: 1px solid #e2e8f0; padding: 0 0 0 16px; }
  .properties-heading { align-items: start; flex-direction: column; gap: 3px; }
}
.editor-preview { order: -1; display: flex; flex-direction: column; min-height: 0; }
.preset-receipt { width: fit-content; max-width: 100%; margin: 0 auto; }
.preset-receipt-classic { width: min(100%, 420px); }
.preset-receipt-classic :deep(img[alt="Receipt"]) { width: 100% !important; }
.preview-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; flex: none; }
.preview-heading .canvas-state { flex: 1; font-size: 15px; font-weight: 600; }
.preview-paper { position: relative; background: white; box-shadow: 0 3px 12px #0f172a1a; }
.preview-image { position: absolute; inset: 0; width: 100%; height: 100%; }
.preview-hit-area { position: absolute; touch-action: none; border: 0; padding: 0; background: transparent; }
.preview-hit-area:hover { outline: 1px solid #fb923c; }
.preview-hit-selected { outline: 2px solid #f97316; }
.resize-selection { position: absolute; pointer-events: none; z-index: 3; outline: 2px solid #f97316; }
.resize-handle { position: absolute; width: 14px; height: 14px; transform: translate(-50%, -50%); pointer-events: auto; touch-action: none; border: 0; padding: 0; background: transparent; }
.resize-handle::after { content: ''; position: absolute; width: 9px; height: 9px; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border: 2px solid #f97316; border-radius: 2px; }
.resize-handle[data-handle=n], .resize-handle[data-handle=s] { width: calc(100% - 14px); }
.resize-handle[data-handle=e], .resize-handle[data-handle=w] { height: calc(100% - 14px); }
.resize-handle:hover::after, .resize-handle:focus-visible::after { background: #ffedd5; box-shadow: 0 0 0 2px #fb923c66; }
.canvas-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 12px 12px 0 0; background: #fff; font-size: 12px; color: #64748b; }
.canvas-toolbar > select { width: auto; max-width: 220px; min-width: 0; margin: 0; }
.canvas-toolbar div { margin-left: auto; flex-shrink: 0; display: flex; align-items: center; gap: 12px; }
.canvas-toolbar button { flex-shrink: 0; width: 28px; height: 28px; border: 1px solid #cbd5e1; border-radius: 6px; color: #0f172a; font-size: 18px; }
.canvas-toolbar .fit-button { flex: none; white-space: nowrap; width: auto; padding: 0 10px; font-size: 12px; }
.canvas-toolbar .fit-button[aria-pressed=true] { color: #c2410c; border-color: #fb923c; background: #fff7ed; }
.canvas-workbench { touch-action: none; cursor: grab; flex: 1; display: flex; align-items: flex-start; min-height: 350px; max-height: 850px; padding: 24px; overflow: auto; border: 1px solid #e2e8f0; border-top: 0; border-radius: 0 0 12px 12px; background-color: #eef2f6; background-image: radial-gradient(#cbd5e1 1px, transparent 1px); background-size: 16px 16px; }
.canvas-workbench > div { margin: auto; }
.canvas-caption { padding-top: 12px; font-size: 12px; color: #64748b; }
.designer-workspace { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.designer-workspace .editor-layout { flex: 1; min-height: 0; }
.designer-workspace .canvas-workbench { min-height: 0; max-height: none; }
.designer-workspace .canvas-toolbar, .designer-workspace .canvas-caption { flex: none; }
:global(.dark) .template-card, :global(.dark) .editor-sidebar, :global(.dark) .canvas-toolbar { background: #111827; border-color: #334155; }
:global(.dark) .designer input:not([type=checkbox]), :global(.dark) .designer select, :global(.dark) .designer textarea { background: #0f172a; border-color: #475569; }
:global(.dark) .canvas-workbench { background-color: #1e293b; background-image: radial-gradient(#475569 1px, transparent 1px); border-color: #334155; }
:global(.dark) .canvas-toolbar button { color: #e2e8f0; border-color: #475569; }
:global(.dark) .element-selected, :global(.dark) .editor-tabs button[aria-pressed=true], :global(.dark) .properties-heading span, :global(.dark) .paper-presets button[aria-pressed=true] { background: #431407; color: #fdba74; }
:global(.dark) .element-row, :global(.dark) .editor-tabs, :global(.dark) .position-controls, :global(.dark) .element-properties { border-color: #334155; }
@media (max-width: 1000px) { .element-list { grid-template-columns: 1fr; max-height: 135px; } .controls-scroll { padding: 14px; } .canvas-toolbar > span { display: none; } .canvas-toolbar { justify-content: flex-end; } }
@media (max-width: 760px) { .editor-layout { grid-template-columns: 1fr; } .designer-workspace { height: auto; } .designer-workspace .editor-layout { flex: none; } .controls-scroll { overflow: visible; } .designer-workspace .editor-preview { order: -1; height: 75dvh; } .canvas-workbench { min-height: 200px; padding: 20px; } .element-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>

