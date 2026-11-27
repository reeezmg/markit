<script setup lang="ts">
import { designerFonts, transformLayerVector } from '~/utils/designer-presentation'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MousePointer2, Hand, Type, Image as ImageIcon, Square, Minus, Layers, Copy, Group, Trash2, Magnet, Grid2X2, Keyboard, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, Columns3, Rows3, QrCode, Barcode } from 'lucide-vue-next'
import QuoteCanvas from './QuoteCanvas.vue'
import LayerTree from './LayerTree.vue'
import ElementProperties from './ElementProperties.vue'
import DataBinding from './DataBinding.vue'
import TextProperties from './TextProperties.vue'
import { printConditionValue } from '~/utils/print-templates'
import CanvasToolbar from './CanvasToolbar.vue'
import TableProperties from './TableProperties.vue'
import ColumnWidth from './ColumnWidth.vue'
import { printLayerTree, printCanvasDesign, printElementId, printBindingFields, setPrintBinding, patchPrintPresentation, printLayerLocalBox, printFrameMoveSize, printTreeDepth } from '~/utils/print-designer'
import { flattenQuoteLayers, independentLayerIds, layerAncestors } from '~/utils/quote-layers'
import { newElement, fieldValue, printElementValue, defaultTableColumns, defaultTaxTableColumns, twoLineTableColumns, classicReceiptTemplate, noTaxReceiptTemplate, originalLabelTemplate, CLASSIC_RECEIPT_ID, printElementMargins, setPrintFlowTop, type PrintElement, type PrintSettings } from '~/utils/print-templates'
import { barcodeFormatOptions, barcodeFormatInfo, barcodeFormats } from '~/utils/print-codes'
import { receiptPaperSizes, labelPaperSizes, resizePrintPaper } from '~/utils/print-paper'
import { receiptTableVariables, receiptTaxTableVariables } from '~/utils/receipt-table'
import type { LabelVariable } from '~/utils/label-variables'
import { prepareDesignerImage } from '~/utils/designer-image.client'
import { boxUnion, roundMM, type DesignerBox } from '~/utils/designer-geometry'
import { setColumnPercentage, columnPercentage } from '~/utils/document-table'
import type { QuoteDesignSection } from '~/utils/quote-design'
import { renderPrintTemplate } from '~/utils/print-template-renderer.client'

const props = defineProps<{ settings: PrintSettings; selectedId: string; saved: string; busy: boolean; canSave: boolean; error?: string; message?: string; sampleLabel: any; sampleReceipt: any; variables: LabelVariable[]; variableError?: string }>()
const emit = defineEmits<{ close: []; save: []; output: [mode: 'pdf' | 'print']; history: [direction: 'undo' | 'redo']; gesture: [active: boolean]; select: [id: string]; retryVariables: []; previewData: [data: any] }>()
const previewScope = useCompanyScope('form'), productQuery = ref(''), products = ref<any[]>([]), searching = ref(false), actualProduct = ref<any>(null), productError = ref('')
const design = computed(() => props.settings.templates.find(t => t.id === props.selectedId)!)
const tree = computed(() => printLayerTree(design.value)), nodes = computed(() => flattenQuoteLayers(tree.value)), facade = computed(() => printCanvasDesign(design.value))
const selectedIds = ref<string[]>([]), selected = computed(() => nodes.value.find(n => n.id === selectedIds.value[0])), item = computed(() => design.value.elements.find(e => e.id === printElementId(selectedIds.value[0] || '')))
const locked = computed(() => nodes.value.some(n => selectedIds.value.includes(n.id) && n.locked))
const canvas = ref<InstanceType<typeof QuoteCanvas> | null>(null), viewport = ref<HTMLElement | null>(null), inspector = ref<HTMLElement | null>(null)
const zoom = ref(100), showLayers = ref(true), tool = ref('select'), snapping = ref(true), grid = ref(false), shortcuts = ref(false), tab = ref('design')
const contextMenu = ref<{ x: number; y: number } | null>(null)
const tableInsert = ref(false), codeInsert = ref(false)
const tableSources = [
  { value: 'items', label: 'Items', description: 'Products, quantities and prices from the bill.' },
  { value: 'taxsummary', label: 'Tax summary', description: 'Bill taxes grouped by rate.' },
] as const
const alignActions = [{ value: 'left', icon: AlignStartVertical }, { value: 'center', icon: AlignCenterVertical }, { value: 'right', icon: AlignEndVertical }, { value: 'top', icon: AlignStartHorizontal }, { value: 'middle', icon: AlignCenterHorizontal }, { value: 'bottom', icon: AlignEndHorizontal }]
const bitmap = ref(''), bounds = ref<Record<string, DesignerBox>>({}), emptyBounds = ref<Record<string, DesignerBox>>({}), previewHeight = ref(100), rendering = ref(false), renderError = ref(''), localError = ref(''), uploading = ref(false), revision = ref(0), dragged = ref(''), space = ref(false)
const unavailable = computed(() => props.busy || uploading.value), data = computed(() => design.value.kind === 'receipt' ? props.sampleReceipt : actualProduct.value || props.sampleLabel)
const ruleResolver = (key: string) => printConditionValue(data.value, key)
const fields = computed(() => item.value ? printBindingFields(design.value, props.variables, item.value) : [])
const valuePreview = computed(() => item.value ? item.value.type === 'logo' ? fieldValue(data.value, item.value.field) : printElementValue(item.value, data.value) : '')
const visibilityFields = computed(() => item.value ? printBindingFields(design.value, props.variables, { ...item.value, type: 'field', field: item.value.whenField || '' }) : [])
const flowing = computed(() => design.value.kind === 'receipt' && !!item.value && !item.value.parentId && item.value.placement !== 'absolute')
const dirty = computed(() => JSON.stringify(props.settings) !== props.saved)
const dimensions = computed(() => ({ width: design.value.width, height: design.value.kind === 'label' ? design.value.height : Math.max(design.value.paperSize ? design.value.height : 20, previewHeight.value) }))
const papers = computed(() => design.value.kind === 'label' ? labelPaperSizes : receiptPaperSizes)
const raw = (id: string) => design.value.elements.find(e => e.id === printElementId(id))
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
watch(data, value => emit('previewData', clone(value)), { deep: true, immediate: true })
let generation = 0, timer: ReturnType<typeof setTimeout> | undefined, stopPan: (() => void) | undefined
let productVersion = 0, revealId = ''
async function findProducts() {
  const version = ++productVersion; productError.value = ''; products.value = []
  if (!productQuery.value.trim()) return
  searching.value = true
  try { const result = await previewScope.fetch<any[]>('/api/bill/searchItems', { query: { q: productQuery.value.trim(), field: 'all', limit: 8 } }); if (version === productVersion) products.value = result }
  catch (cause: any) { if (version === productVersion) productError.value = cause?.data?.statusMessage || cause.message || 'Could not find products.' }
  finally { if (version === productVersion) searching.value = false }
}
async function chooseProduct(product: any) {
  const version = ++productVersion; searching.value = true; productError.value = ''
  try {
    const rows = await previewScope.fetch<any[]>('/api/settings/label-variables', { method: 'POST', body: { itemIds: [product.id], barcodes: [] } })
    if (version !== productVersion) return
    const row = rows.find(r => r.itemId === product.id)
    if (!row) throw Error('This product is unavailable. Search again.')
    const v = row.variables
    actualProduct.value = { ...v, itemId: product.id, companyId: previewScope.auth.session.value?.companyId, barcode: row.barcode || product.barcode, labelVariablesLoaded: true,
      shopname: v.company?.name || '', productName: v.product?.name || '', brand: v.product?.brand?.name || '', name: v.variant?.name || '', size: v.item?.size || '', code: v.variant?.code || '', sprice: v.variant?.sprice, dprice: v.variant?.dprice }
    products.value = []
  } catch (cause: any) { if (version === productVersion) productError.value = cause?.data?.statusMessage || cause.message || 'Could not preview this product.' }
  finally { if (version === productVersion) searching.value = false }
}
function resetProduct() { productVersion++; actualProduct.value = null; products.value = []; searching.value = false; productError.value = '' }
let originals: PrintElement[] | undefined, originalBounds: Record<string, DesignerBox> | undefined, clipboard: PrintElement[] = []
function select(id: string, event?: MouseEvent) {
  selectedIds.value = independentLayerIds(nodes.value, event?.shiftKey ? selectedIds.value.includes(id) ? selectedIds.value.filter(n => n !== id) : [...selectedIds.value, id] : [id]); tab.value = 'design'
  nextTick(() => { if (inspector.value) inspector.value.scrollTop = 0 })
}
watch(() => props.selectedId, () => { selectedIds.value = design.value?.elements[0] ? [design.value.elements[0].id] : []; fit(); }, { immediate: true })
watch(nodes, () => { selectedIds.value = selectedIds.value.filter(id => nodes.value.some(n => n.id === id)) })
watch([design, data], () => {
  const run = ++generation; clearTimeout(timer); rendering.value = true; renderError.value = ''
  timer = setTimeout(async () => {
    try { const result = await renderPrintTemplate(clone(design.value), clone(data.value), { mode: 'design' }); if (run !== generation) return
      bitmap.value = result.canvas.toDataURL('image/png'); previewHeight.value = result.height
      bounds.value = Object.fromEntries(result.bounds.map((b: DesignerBox & { id: string }) => [b.id, b])); emptyBounds.value = Object.fromEntries((result.emptyBounds || []).map(b => [b.id, b])); revision.value++
      if (revealId) { const id = revealId; revealId = ''; nextTick(() => { Array.from(viewport.value?.querySelectorAll<HTMLElement>('[data-layer-id]') || []).find(el => printElementId(el.dataset.layerId || '') === id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }) }
    } catch (cause: any) { if (run === generation) renderError.value = cause.message }
    finally { if (run === generation) rendering.value = false }
  }, 100)
}, { deep: true, immediate: true })
function fit() { nextTick(() => { if (!viewport.value || !design.value) return; const width = viewport.value.clientWidth - 80, height = viewport.value.clientHeight - 80; zoom.value = Math.max(25, Math.min(300, Math.floor(Math.min(width / (design.value.width * 96/25.4), design.value.kind === 'label' ? height / (design.value.height * 96/25.4) : 2) * 100))) }) }
function transaction(action: () => void) { if (unavailable.value) return; localError.value = ''; emit('gesture', true); action(); emit('gesture', false) }
function gesture(active: boolean) { if (active) { originals = clone(design.value.elements); originalBounds = clone(bounds.value) } emit('gesture', active); if (!active) { originals = undefined; originalBounds = undefined } }
function restore() { if (originals) design.value.elements = clone(originals) }
function changeBinding(binding: string) { if (!item.value || locked.value) return; transaction(() => setPrintBinding(item.value!, binding, data.value)) }
function editItem(values: Partial<PrintElement>) { if (!item.value || locked.value) return; transaction(() => Object.assign(item.value!, values)) }
function flowCursor(id: string) {
  const previous = design.value.elements.slice(0, design.value.elements.findIndex(e => e.id === id)).reverse().find(e => !e.parentId && e.placement !== 'absolute' && bounds.value[e.id])
  return previous ? bounds.value[previous.id].y + bounds.value[previous.id].height + printElementMargins(previous, true)[2] : 2
}
function changePlacement(value: string) {
  if (!item.value || item.value.parentId || design.value.kind !== 'receipt' || locked.value) return
  const element = item.value, measured = bounds.value[element.id] || emptyBounds.value[element.id]
  if (value === 'absolute') {
    const y = measured?.y ?? element.y
    if (y > 1400 || design.value.paperSize && y + element.height > design.value.height) { localError.value = 'Move this layer inside the first page before fixing its position.'; return }
    const [top, , , left] = printElementMargins(element)
    editItem({ placement: 'absolute', x: Math.max(0, (measured?.x ?? element.x) - left), y: Math.max(0, y - top) })
  }
  else {
    const cursor = flowCursor(element.id)
    const gap = (measured?.y ?? element.y) - cursor
    if (Math.abs(gap) > 300) { localError.value = 'Move this layer closer to the previous layer before adding it to receipt flow. Top margin supports offsets from -300 to 300 mm.'; return }
    transaction(() => { element.placement = 'flow'; setPrintFlowTop(element, roundMM(Math.max(-cursor, gap))) })
  }
}
function patch(id: string, values: Partial<QuoteDesignSection>) {
  const e = raw(id), node = nodes.value.find(n => n.id === id)
  if (!e || !node || unavailable.value || node.locked && Object.keys(values).some(key => key !== 'locked')) return
  const { kind, id: ignored, elements, frameWidth, frameHeight, imageHeight, ...style } = values
  patchPrintPresentation(e, style)
  if ('margin' in style || 'marginSides' in style) {
    delete e.gapBefore; delete e.gapAfter
    const parent = e.parentId ? design.value.elements.find(n => n.id === e.parentId) : undefined
    const [top, right, bottom, left] = printElementMargins(e)
    e.x = Math.max(0, -left, e.x)
    const availableWidth = (parent?.width || design.value.width) - e.x - left - Math.max(0, right)
    if (availableWidth >= 2) e.width = Math.min(e.width, roundMM(availableWidth))
    if (parent || design.value.kind === 'label' || e.placement === 'absolute') {
      e.y = Math.max(0, -top, e.y)
      const availableHeight = (parent?.height || (design.value.kind === 'label' || design.value.paperSize ? design.value.height : 1400)) - e.y - top - Math.max(0, bottom)
      if (availableHeight >= 2) e.height = Math.min(e.height, roundMM(availableHeight))
    }
  }
  if (frameWidth !== undefined) e.width = frameWidth
  if (frameHeight !== undefined) e.height = frameHeight
}
function transform(frames: { id: string; box: DesignerBox; original: DesignerBox; resize: boolean }[]) {
  const flowGaps = new Map<string, number>()
  if (design.value.kind === 'receipt') {
    const source = originals || design.value.elements, measured = originalBounds || bounds.value
    const targets = new Map(frames.filter(frame => !nodes.value.find(n => n.id === frame.id)?.locked).map(frame => [printElementId(frame.id), frame]))
    let cursor = 2
    for (const element of source) {
      const box = measured[element.id] || targets.get(element.id)?.original
      if (element.parentId || element.placement === 'absolute' || !box) continue
      const target = targets.get(element.id)
      let gap = printElementMargins(element, true)[0], height = box.height
      if (target) {
        const desiredY = box.y + target.box.y - target.original.y
        gap = roundMM(Math.max(-300, -cursor, Math.min(300, desiredY - cursor)))
        flowGaps.set(element.id, gap)
        if (target.resize) height = Math.min(297, Math.max(2, target.box.height))
      }
      if (!measured[element.id]) continue
      cursor = Math.max(0, cursor + gap) + height + printElementMargins(element, true)[2]
    }
  }
  for (const frame of frames) {
    const e = raw(frame.id), node = nodes.value.find(n => n.id === frame.id)
    if (!e || !node || node.locked || unavailable.value) continue
    const original = originals?.find(n => n.id === e.id) || clone(e), parent = e.parentId ? design.value.elements.find(n => n.id === e.parentId) : undefined
    const [marginTop, marginRight, marginBottom, marginLeft] = printElementMargins(original)
    const dx = frame.box.x - frame.original.x, dy = frame.box.y - frame.original.y
    const delta = transformLayerVector(layerAncestors(nodes.value, node.id).map(n => n.model), dx, dy, true)
    const moveSize = e.type === 'frame' ? printFrameMoveSize(design.value, original) : original
    const width = Math.min((parent?.width || design.value.width) - Math.max(0, marginLeft) - Math.max(0, marginRight), design.value.kind === 'label' ? 100 : 297, Math.max(2, frame.resize ? frame.box.width : moveSize.width)), height = Math.min(parent?.height || (design.value.kind === 'label' ? design.value.height : 297), Math.max(2, frame.resize ? frame.box.height : moveSize.height))
    const x = Math.max(0, -marginLeft, Math.min((parent?.width || design.value.width) - width - marginLeft - Math.max(0, marginRight), original.x + delta.x))
    e.x = roundMM(x)
    if (!parent && design.value.kind === 'receipt' && e.placement !== 'absolute') { const top = flowGaps.get(e.id); if (top !== undefined) setPrintFlowTop(e, top) }
    else e.y = roundMM(Math.max(0, -marginTop, Math.min((parent?.height || (design.value.kind === 'label' ? design.value.height : 1400)) - height - marginTop - Math.max(0, marginBottom), original.y + delta.y)))
    if (!frame.resize && e.type === 'frame') { e.width = width; e.height = height }
    if (frame.resize) {
      e.width = roundMM(width); e.height = roundMM(height); e.resizeMode = 'fixed'
      if (e.type === 'frame') {
        const descendants = nodes.value.filter(n => layerAncestors(nodes.value, n.id).some(a => a.id === node.id))
        for (const child of descendants) { const target = raw(child.id), start = originals?.find(n => n.id === target?.id); if (target && start) Object.assign(target, { x: roundMM(start.x * width/original.width), y: roundMM(start.y * height/original.height), width: roundMM(Math.max(2, start.width * width/original.width)), height: roundMM(Math.max(2, start.height * height/original.height)) }) }
      }
    }
  }
}
function frame(values: Partial<DesignerBox>) {
  if (!item.value || locked.value || !selected.value) return
  const old = canvas.value?.boxes[selected.value.id], local = canvas.value?.localBoxes[selected.value.id]
  if (!old || !local) return
  const dx = (values.x ?? local.x) - local.x, dy = (values.y ?? local.y) - local.y
  const delta = transformLayerVector(layerAncestors(nodes.value, selected.value.id).map(n => n.model), dx, dy)
  transaction(() => { originals = clone(design.value.elements); originalBounds = clone(bounds.value); transform([{ id: selected.value!.id, original: old, box: { ...old, ...values, x: old.x + delta.x, y: old.y + delta.y }, resize: values.width !== undefined || values.height !== undefined }]); originals = undefined; originalBounds = undefined })
}
function add(type: PrintElement['type']) {
  if (unavailable.value || design.value.elements.length >= 40) return
  tableInsert.value = false; codeInsert.value = false
  transaction(() => {
    const parent = item.value?.type === 'frame' && !locked.value && !['items', 'taxsummary'].includes(type) ? item.value : undefined, e = newElement(type, parent?.width || design.value.width)
    if (parent && (parent.width < 6 || parent.height < 6 || layerAncestors(nodes.value, selected.value!.id).length >= 7)) { localError.value = 'Enlarge this frame before adding a layer; nesting supports eight levels.'; return }
    if (type === 'frame') Object.assign(e, { width: Math.min(40, design.value.width - 4), height: Math.min(20, design.value.height - 4) })
    if (parent) { e.parentId = parent.id; e.width = Math.max(2, parent.width - 4); e.height = Math.min(e.height, Math.max(2, parent.height - 4)) }
    if (design.value.kind === 'label') e.height = Math.min(e.height, design.value.height - e.y)
    if (type === 'taxsummary') e.taxColumns = defaultTaxTableColumns()
    if (type === 'field') e.field = design.value.kind === 'label' ? 'product.name' : 'companyName'
    if (type === 'barcode' || type === 'qrcode') e.field = design.value.kind === 'label' ? 'barcode' : type === 'qrcode' && fieldValue(data.value, 'receiptUpiPayment') ? 'receiptUpiPayment' : 'invoiceNumber'
    if (type === 'shape') Object.assign(e, { shape: 'rectangle', background: '#e2e8f0' })
    design.value.elements.push(e); revealId = e.id; const node = flattenQuoteLayers(printLayerTree(design.value)).find(n => printElementId(n.id) === e.id)!; select(node.id)
  })
}
function changeCodeType(value: string) {
  if (!item.value || locked.value || !['barcode', 'qrcode'].includes(item.value.type)) return
  if (value === 'qrcode') editItem({ type: 'qrcode' })
  else if (barcodeFormats.includes(value as typeof barcodeFormats[number])) editItem({ type: 'barcode', barcodeFormat: value as typeof barcodeFormats[number] })
}
function changeTableSource(value: string) {
  if (!item.value || locked.value || !['items', 'taxsummary'].includes(item.value.type) || !tableSources.some(source => source.value === value)) return
  transaction(() => {
    item.value!.type = value as 'items' | 'taxsummary'
    if (value === 'taxsummary' && !item.value!.taxColumns) item.value!.taxColumns = defaultTaxTableColumns()
    if (value === 'items' && !item.value!.columns) Object.assign(item.value!, { columns: defaultTableColumns(), tableBorders: true, tablePadding: .5 })
  })
}
function descendants(ids: string[]) { return nodes.value.filter(n => ids.includes(n.id) || layerAncestors(nodes.value, n.id).some(a => ids.includes(a.id))) }
function command(action: string) {
  contextMenu.value = null
  if (unavailable.value) return
  canvas.value?.finishText()
  const chosen = selectedIds.value.map(id => raw(id)).filter(Boolean) as PrintElement[]
  if (action === 'copy') { clipboard = clone(descendants(selectedIds.value).map(n => raw(n.id)!)); return }
  if (locked.value && !['lock', 'paste'].includes(action)) return
  if (action === 'group') { group(); return }
  transaction(() => {
    if (action === 'delete' || action === 'cut') {
      const removed = descendants(selectedIds.value).map(n => raw(n.id)!)
      if (removed.length >= design.value.elements.length) { localError.value = 'Keep at least one layer in this design.'; return }
      if (action === 'cut') clipboard = clone(removed)
      design.value.elements = design.value.elements.filter(e => !removed.some(n => n.id === e.id)); selectedIds.value = []
    } else if (action === 'duplicate' || action === 'paste') {
      const copies = clone(action === 'paste' ? clipboard : descendants(selectedIds.value).map(n => raw(n.id)!))
      if (design.value.elements.length + copies.length > 40) { localError.value = 'A design can contain up to 40 layers.'; return }
      const keys = new Map(copies.map(e => [e.id, crypto.randomUUID()])), roots = copies.filter(e => !copies.some(p => p.id === e.parentId))
      if (action === 'paste') {
        const destination = item.value?.type === 'frame' && !locked.value ? item.value : undefined
        const destinationNode = destination && nodes.value.find(n => printElementId(n.id) === destination.id)
        if ((destinationNode ? layerAncestors(nodes.value, destinationNode.id).length + 1 : 0) + printTreeDepth(copies) > 8) { localError.value = 'Frames can be nested up to eight levels.'; return }
        if (destination && roots.some(e => e.width + 2 > destination.width || e.height + 2 > destination.height)) { localError.value = 'Enlarge the destination frame before pasting these layers.'; return }
        roots.forEach(e => { e.parentId = destination?.id; e.x = Math.min(e.x, (destination?.width || design.value.width) - e.width); e.y = Math.min(e.y, (destination?.height || design.value.height) - e.height) })
      }
      for (const e of copies) { const oldId = e.id; e.id = keys.get(oldId)!; if (roots.includes(e)) e.locked = false; e.groupId = undefined; if (e.parentId && keys.has(e.parentId)) e.parentId = keys.get(e.parentId); if (roots.includes(e)) { e.x = Math.min((e.parentId ? design.value.elements.find(n => n.id === e.parentId)?.width || design.value.width : design.value.width) - e.width, e.x + 1); if (design.value.kind === 'label' || e.parentId || e.placement === 'absolute') e.y = Math.min((e.parentId ? design.value.elements.find(n => n.id === e.parentId)?.height || design.value.height : design.value.height) - e.height, e.y + 1) } }
      design.value.elements.push(...copies); const next = flattenQuoteLayers(printLayerTree(design.value)); selectedIds.value = roots.map(e => next.find(n => printElementId(n.id) === e.id)!.id)
    } else if (action === 'lock') chosen.forEach(e => { e.locked = !e.locked })
    else if (action === 'hide') chosen.forEach(e => { e.visible = e.visible === false })
    else if (action === 'ungroup') {
      for (const e of chosen.filter(e => e.type === 'frame')) {
        if (e.rotation) { localError.value = 'Reset frame rotation before ungrouping.'; continue }
        const b = printLayerLocalBox(design.value, e, { ...emptyBounds.value, ...bounds.value })
        const children = design.value.elements.filter(n => n.parentId === e.id)
        if (design.value.kind === 'receipt' && !e.parentId && e.placement !== 'absolute') {
          const measured = children.map(child => ({ child, box: bounds.value[child.id] })).sort((a,b) => (a.box?.y || 0) - (b.box?.y || 0))
          if (measured.some((entry, index) => !entry.box || index > 0 && entry.box.y < measured[index-1].box!.y + measured[index-1].box!.height - .05)) { localError.value = 'Separate overlapping receipt layers before ungrouping a flow frame.'; continue }
          let cursor = bounds.value[e.id]?.y || 0
          measured.forEach(({child,box}, index) => { child.parentId = undefined; delete child.margin; delete child.marginSides; child.x = roundMM(box!.x); child.placement = 'flow'; child.gapBefore = roundMM(Math.max(-300, Math.min(300, Math.max(0, box!.y - cursor) + (index === 0 ? printElementMargins(e, true)[0] : 0)))); child.gapAfter = index === measured.length-1 ? Math.max(0, Math.min(30, printElementMargins(e, true)[2])) : 0; cursor = box!.y + box!.height })
          const index = design.value.elements.indexOf(e); design.value.elements = design.value.elements.filter(n => n.id !== e.id && !children.includes(n)); design.value.elements.splice(index, 0, ...measured.map(n => n.child))
        } else {
          children.forEach(child => { child.parentId = e.parentId; child.x += b?.x ?? e.x; child.y += b?.y ?? e.y; if (design.value.kind === 'receipt' && !e.parentId) child.placement = 'absolute' }); design.value.elements = design.value.elements.filter(n => n.id !== e.id)
        }
      }
    } else if (action === 'front' || action === 'back') {
      const other = design.value.elements.filter(e => !chosen.includes(e)); design.value.elements = action === 'front' ? [...other, ...chosen] : [...chosen, ...other]
    } else if (action === 'flow') chosen.forEach(e => { e.placement = 'flow'; e.rotation = 0; setPrintFlowTop(e, 0) })
  })
}
function group() {
  const chosen = selectedIds.value.map(id => raw(id)!).filter(Boolean)
  if (chosen.length < 2 || new Set(chosen.map(e => e.parentId || '')).size !== 1 || locked.value) return
  if (design.value.elements.length >= 40) { localError.value = 'Remove a layer before adding a frame.'; return }
  if (descendants(selectedIds.value).some(n => layerAncestors(nodes.value, n.id).length >= 7)) { localError.value = 'Frames can be nested up to eight levels.'; return }
  if (chosen.some(e => ['items', 'taxsummary'].includes(e.type))) { localError.value = 'Keep growing tables and tax summaries in receipt flow. Group the surrounding text separately.'; return }
  const measured = { ...emptyBounds.value, ...bounds.value }
  const boxes = chosen.map(element => printLayerLocalBox(design.value, element, measured)).filter(Boolean) as DesignerBox[]
  if (boxes.length !== chosen.length) return
  const union = boxUnion(boxes)
  if (union.height > 297 || design.value.kind === 'label' && (union.width > 100 || union.height > 100)) { localError.value = 'This selection is too large for a frame.'; return }
  transaction(() => {
    const first = design.value.elements.find(e => chosen.includes(e))!, last = design.value.elements.filter(e => chosen.includes(e)).at(-1)!
    const e = { ...newElement('frame', design.value.width), x: union.x, y: union.y, width: union.width, height: union.height, parentId: first.parentId, gapBefore: printElementMargins(first, true)[0], gapAfter: Math.max(0, Math.min(30, printElementMargins(last, true)[2])) }
    if (design.value.kind === 'receipt' && !first.parentId && first.placement !== 'absolute') Object.assign(e, { marginSides: { top: printElementMargins(first, true)[0], right: 0, bottom: printElementMargins(last, true)[2], left: 0 }, gapBefore: undefined, gapAfter: undefined })
    chosen.forEach((child, i) => { child.parentId = e.id; child.x = roundMM(boxes[i].x - union.x); child.y = roundMM(boxes[i].y - union.y); child.placement = 'flow'; delete child.margin; delete child.marginSides })
    design.value.elements.splice(design.value.elements.indexOf(first), 0, e); select(flattenQuoteLayers(printLayerTree(design.value)).find(n => printElementId(n.id) === e.id)!.id)
  })
}
function reorder(id: string, delta: number) { const e = raw(id); if (!e || nodes.value.find(n => n.id === id)?.locked) return; const siblings = design.value.elements.filter(n => n.parentId === e.parentId), other = siblings[siblings.indexOf(e) + delta]; if (other) transaction(() => { const a = design.value.elements.indexOf(e), b = design.value.elements.indexOf(other); design.value.elements.splice(a, 1); design.value.elements.splice(b, 0, e) }) }
function drop(id: string) {
  const source = raw(dragged.value), target = raw(id), sourceNode = nodes.value.find(n => n.id === dragged.value), targetNode = nodes.value.find(n => n.id === id)
  if (!source || !target || !sourceNode || !targetNode || sourceNode.locked || targetNode.locked || source.id === target.id) return
  if (target.type !== 'frame') { if (source.parentId === target.parentId) transaction(() => { const a = design.value.elements.indexOf(source), b = design.value.elements.indexOf(target); design.value.elements.splice(a, 1); design.value.elements.splice(b, 0, source) }); return }
  if (layerAncestors(nodes.value, targetNode.id).some(n => n.id === sourceNode.id) || ['items', 'taxsummary'].includes(source.type)) return
  const subtree = descendants([sourceNode.id]).map(n => raw(n.id)!)
  if (layerAncestors(nodes.value, targetNode.id).length + 1 + printTreeDepth(subtree) > 8) { localError.value = 'Frames can be nested up to eight levels.'; return }
  const a = canvas.value?.boxes[sourceNode.id], b = canvas.value?.boxes[targetNode.id]
  if (!a || !b) return
  const angle = -(canvas.value?.rotations[targetNode.id] || 0) * Math.PI / 180, dx = a.x + a.width/2 - b.x - b.width/2, dy = a.y + a.height/2 - b.y - b.height/2
  const [mt, mr, mb, ml] = printElementMargins(source)
  const x = b.width/2 + dx*Math.cos(angle) - dy*Math.sin(angle) - a.width/2 - ml, y = b.height/2 + dx*Math.sin(angle) + dy*Math.cos(angle) - a.height/2 - mt
  if (x < -.01 || y < -.01 || x + ml + a.width + Math.max(0,mr) > b.width + .01 || y + mt + a.height + Math.max(0,mb) > b.height + .01) { localError.value = 'Resize the frame to contain this layer and its margins before moving it inside.'; return }
  transaction(() => { Object.assign(source, { parentId: target.id, x: roundMM(Math.max(0, x)), y: roundMM(Math.max(0, y)), rotation: (canvas.value?.rotations[sourceNode.id] || 0) - (canvas.value?.rotations[targetNode.id] || 0) }); select(flattenQuoteLayers(printLayerTree(design.value)).find(n => printElementId(n.id) === source.id)!.id) })
}
function align(mode: string) {
  const ids = selectedIds.value, boxes = ids.map(id => canvas.value?.boxes[id]).filter(Boolean) as DesignerBox[]
  if (boxes.length !== ids.length || !boxes.length || locked.value) return
  const target = boxes.length > 1 ? boxUnion(boxes) : selected.value?.parentId ? canvas.value?.boxes[selected.value.parentId] || { x: 0, y: 0, ...dimensions.value } : { x: 0, y: 0, ...dimensions.value }
  transaction(() => { originals = clone(design.value.elements); transform(boxes.map((box, i) => ({ id: ids[i], original: box, resize: false, box: { ...box,
    x: mode === 'left' ? target.x : mode === 'center' ? target.x + (target.width-box.width)/2 : mode === 'right' ? target.x+target.width-box.width : box.x,
    y: mode === 'top' ? target.y : mode === 'middle' ? target.y+(target.height-box.height)/2 : mode === 'bottom' ? target.y+target.height-box.height : box.y } }))); originals = undefined })
}
function distribute(axis: 'x' | 'y') {
  const entries = selectedIds.value.map(id => ({ id, box: canvas.value?.boxes[id] })).filter(e => e.box) as { id: string; box: DesignerBox }[]
  if (entries.length < 3 || locked.value) return
  entries.sort((a,b) => a.box[axis] - b.box[axis]); const size = axis === 'x' ? 'width' : 'height', union = boxUnion(entries.map(e => e.box)), gap = (union[size] - entries.reduce((sum,e) => sum + e.box[size], 0))/(entries.length - 1)
  let cursor = union[axis]
  transaction(() => { originals = clone(design.value.elements); transform(entries.map(e => { const box = { ...e.box, [axis]: cursor }; cursor += e.box[size] + gap; return { id: e.id, box, original: e.box, resize: false } })); originals = undefined })
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0], target = item.value
  if (!file || !target || locked.value || unavailable.value) return
  uploading.value = true; localError.value = ''
  try { const image = await prepareDesignerImage(file); if (!design.value.elements.includes(target)) return; emit('gesture', true); target.image = image.data; target.field = ''; emit('gesture', false) }
  catch (cause: any) { localError.value = cause.message } finally { uploading.value = false; input.value = '' }
}
function paper(value: string) { const [width, height] = value.split('x').map(Number); transaction(() => { try { Object.assign(design.value, resizePrintPaper(design.value, width, height || design.value.height)); fit() } catch (cause: any) { localError.value = cause.message } }) }
function applyTemplate(name: string) { transaction(() => { const base = name === 'label' ? originalLabelTemplate() : name === 'no-tax' ? noTaxReceiptTemplate() : classicReceiptTemplate(); if (base.kind !== design.value.kind) return; Object.assign(design.value, { ...base, id: design.value.id, name: design.value.name }); selectedIds.value = []; fit() }) }
function duplicateDesign() { if (props.settings.templates.length >= 12) return; transaction(() => { const copy = clone(design.value); copy.id = crypto.randomUUID(); copy.name = `${copy.name.slice(0, 70)} copy`; props.settings.templates.push(copy); emit('select', copy.id) }) }
function removeDesign() { transaction(() => { const id = design.value.id; props.settings.templates = props.settings.templates.filter(t => t.id !== id); if (props.settings.labelId === id) props.settings.labelId = null; if (props.settings.receiptId === id) props.settings.receiptId = CLASSIC_RECEIPT_ID }); emit('close') }
function save() { canvas.value?.finishText(); if (!rendering.value && !renderError.value && !unavailable.value && props.canSave) emit('save') }
function keydown(event: KeyboardEvent) {
  if (unavailable.value || event.defaultPrevented || event.isComposing) return
  const key = event.key.toLowerCase(), mod = event.ctrlKey || event.metaKey
  if (mod && key === 's') { event.preventDefault(); save(); return }
  if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]')) return
  if (mod && ['z', 'y'].includes(key)) { event.preventDefault(); canvas.value?.cancel(); emit('history', key === 'y' || event.shiftKey ? 'redo' : 'undo'); return }
  if (mod && key === 'a') { event.preventDefault(); selectedIds.value = tree.value.filter(n => !n.locked).map(n => n.id); return }
  if (mod && ['d', 'c', 'x', 'v', 'g'].includes(key)) { event.preventDefault(); command(({ d: 'duplicate', c: 'copy', x: 'cut', v: 'paste', g: event.shiftKey ? 'ungroup' : 'group' } as Record<string,string>)[key]); return }
  if (mod && ['0', '1'].includes(key)) { event.preventDefault(); key === '0' ? fit() : zoom.value = 100; return }
  if (mod && event.shiftKey && key === 'l') { event.preventDefault(); command('lock'); return }
  if (mod && ['[', ']'].includes(key)) { event.preventDefault(); command(key === '[' ? 'back' : 'front'); return }
  if (key === 'delete' || key === 'backspace') { event.preventDefault(); command('delete'); return }
  if (event.code === 'Space') { event.preventDefault(); space.value = true; return }
  if (['arrowleft','arrowright','arrowup','arrowdown'].includes(key) && selectedIds.value.length) { event.preventDefault(); const step = event.shiftKey ? 1 : .1; transaction(() => { originals = clone(design.value.elements); transform(selectedIds.value.flatMap(id => { const b = canvas.value?.boxes[id]; return b ? [{ id, original: b, resize: false, box: { ...b, x: b.x + (key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0), y: b.y + (key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0) } }] : [] })); originals = undefined }); return }
  if (key === 'v') tool.value = 'select'; if (key === 'h') tool.value = 'hand'; if (key === 't') add('text'); if (key === 'r') add('shape'); if (key === '?') shortcuts.value = !shortcuts.value
}
function openContext(event: MouseEvent) { contextMenu.value = { x: Math.max(8, Math.min(event.clientX, window.innerWidth - 210)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 340)) } }
function keyup(event: KeyboardEvent) { if (event.code === 'Space') space.value = false }
function pan(event: PointerEvent) { if (!(tool.value === 'hand' || space.value || event.button === 1) || !viewport.value) return; event.preventDefault(); event.stopPropagation(); const el = viewport.value, x = event.clientX, y = event.clientY, left = el.scrollLeft, top = el.scrollTop; const move = (e: PointerEvent) => { el.scrollLeft = left + x - e.clientX; el.scrollTop = top + y - e.clientY }; const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); stopPan = undefined }; stopPan?.(); window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); stopPan = stop }
function wheel(event: WheelEvent) { if (!event.ctrlKey && !event.metaKey) return; event.preventDefault(); zoom.value = Math.max(25, Math.min(300, zoom.value + (event.deltaY < 0 ? 10 : -10))) }
function canvasBox(id: string) { const e = raw(id)!, b = bounds.value[e.id] || emptyBounds.value[e.id]; return b || { x: e.x, y: e.y, width: e.width, height: e.height } }
function boxStyle(id: string) { const b = canvasBox(id), angle = [...layerAncestors(nodes.value, id), nodes.value.find(n => n.id === id)!].reduce((sum, n) => sum + (n.model.rotation || 0), 0); return { left: `${b.x}mm`, top: `${b.y}mm`, width: `${b.width}mm`, height: `${b.height}mm`, transform: angle ? `rotate(${angle}deg)` : undefined } }
const activeColumns = computed({
  get: () => item.value?.type === 'taxsummary' ? item.value.taxColumns || [] : item.value?.columns || [],
  set: columns => { if (item.value) editItem(item.value.type === 'taxsummary' ? { taxColumns: columns } : { columns }) },
})
function standardColumns() { activeColumns.value = item.value?.type === 'taxsummary' ? defaultTaxTableColumns() : defaultTableColumns() }
const columnFields = computed(() => item.value?.type === 'taxsummary' ? receiptTaxTableVariables : [...receiptTableVariables, ...props.variables.filter(v => /^(product|variant)\./.test(v.key))])
const columnGroups = computed(() => [...new Set(columnFields.value.map(v => v.group))].map(group => ({ group, fields: columnFields.value.filter(v => v.group === group) })))
function columnSet(index: number) { const columns = activeColumns.value, column = columns[index]; return columns.filter(c => (c.line || 1) === (column?.line || 1)) }
function columnWidth(index: number) { const columns = columnSet(index); return columnPercentage(columns, columns.indexOf(activeColumns.value[index])) }
function setColumnWidth(index: number, value: number) { const columns = columnSet(index); setColumnPercentage(columns, columns.indexOf(activeColumns.value[index]), value, 1) }
function addColumn() { if (item.value && !locked.value && activeColumns.value.length < 12) activeColumns.value = [...activeColumns.value, { id: crypto.randomUUID(), header: 'Column', field: item.value.type === 'taxsummary' ? 'tax.total' : 'entry.description', width: 15, align: 'left' }] }
onMounted(() => { fit(); window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup) })
onBeforeUnmount(() => { productVersion++; generation++; clearTimeout(timer); stopPan?.(); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup) })
</script>
<template>
  <main class="document-design-page" :aria-label="`${design.kind} designer`">
    <div class="quote-designer" :class="{ 'layers-collapsed': !showLayers }" @pointerdown="contextMenu = null">
      <div class="editor-toolstrip" role="toolbar" aria-label="Design tools">
        <div class="tool-group"><button type="button" aria-label="Toggle layers panel" :aria-pressed="showLayers" @click="showLayers = !showLayers"><Layers /></button><button type="button" aria-label="Move tool" :aria-pressed="tool === 'select'" @click="tool = 'select'"><MousePointer2 /></button><button type="button" aria-label="Hand tool" :aria-pressed="tool === 'hand'" @click="tool = 'hand'"><Hand /></button></div>
        <div class="tool-group"><button v-for="(icon, type) in { text: Type, logo: ImageIcon, shape: Square, line: Minus, frame: Layers }" :key="type" type="button" :aria-label="`Add ${type === 'logo' ? 'image' : type} layer`" :title="`Add ${type === 'logo' ? 'image' : type}`" :disabled="unavailable || design.elements.length >= 40" @click="add(type as PrintElement['type'])"><component :is="icon" /></button><button type="button" :disabled="unavailable || design.elements.length >= 40" aria-label="Add barcode layer" title="Barcode" @click="add('barcode')">▥</button><button type="button" :disabled="unavailable || design.elements.length >= 40" aria-label="Add QR code layer" title="QR code" @click="add('qrcode')">▦</button></div>
        <div class="tool-group"><button v-for="action in alignActions" :key="action.value" type="button" :aria-label="`Align ${action.value}`" :title="`Align ${action.value}`" :disabled="!selectedIds.length || locked || unavailable" @click="align(action.value)"><component :is="action.icon" /></button><button type="button" aria-label="Distribute horizontal spacing" :disabled="selectedIds.length < 3 || locked || unavailable" @click="distribute('x')"><Columns3 /></button><button type="button" aria-label="Distribute vertical spacing" :disabled="selectedIds.length < 3 || locked || unavailable" @click="distribute('y')"><Rows3 /></button></div><div class="tool-group"><button type="button" aria-label="Duplicate selection" :disabled="!selectedIds.length || unavailable" @click="command('duplicate')"><Copy /></button><button type="button" aria-label="Group selection" :disabled="selectedIds.length < 2 || locked || unavailable" @click="command('group')"><Group /></button><button type="button" aria-label="Delete selection" :disabled="!selectedIds.length || locked || unavailable" @click="command('delete')"><Trash2 /></button></div>
        <div class="tool-group tool-options"><button type="button" aria-label="Snap to elements" :aria-pressed="snapping" @click="snapping = !snapping"><Magnet /></button><button type="button" aria-label="Show canvas grid" :aria-pressed="grid" @click="grid = !grid"><Grid2X2 /></button><button type="button" aria-label="Keyboard shortcuts" @click="shortcuts = !shortcuts"><Keyboard /></button></div>
      </div>
      <aside v-show="showLayers" class="layers-panel"><div class="layers-heading"><h3>Layers</h3><span>{{ design.elements.length }} / 40</span></div><p class="layers-hint">Double-click to select inside a frame</p><ol class="section-list" aria-label="Print design layers"><LayerTree v-for="(node, index) in tree" :key="node.id" :node="node" :index="index" :count="tree.length" :selected-ids="selectedIds" :disabled="unavailable" @select="select" @visibility="id => patch(id, { visible: raw(id)?.visible === false })" @lock="id => patch(id, { locked: !raw(id)?.locked })" @move="reorder" @drag="dragged = $event" @drop="drop" /></ol><div class="layers-footer"><span>Drag layers to reorder or nest</span><span>mm</span></div></aside>
      <div class="design-canvas-panel"><div class="canvas-toolbar"><CanvasToolbar :zoom="zoom" :label="`${design.width}${design.kind === 'label' ? ' × ' + design.height : ''} mm · ${design.kind === 'label' ? 'Label' : 'Receipt'} canvas`" @zoom="zoom = $event" @fit="fit" /></div>
        <div ref="viewport" class="canvas-scroll" :class="{ 'panning-canvas': tool === 'hand' || space }" @pointerdown.capture="pan" @wheel="wheel"><div class="scaled-paper" :style="{ zoom: zoom / 100, '--designer-zoom': zoom / 100 }"><QuoteCanvas ref="canvas" :design="facade" :layer-nodes="nodes" :dimensions="dimensions" :revision="revision" :text-limit="2000" :quote="data" :company="{}" :selected-ids="selectedIds" :disabled="unavailable" :snap="snapping" :grid="grid" :tool="tool" @update:selected-ids="selectedIds = $event" @gesture="gesture" @restore="restore" @transform="transform" @patch="patch" @command="command" @context="openContext">
          <div class="quote-paper print-paper" :style="{ width: `${dimensions.width}mm`, height: `${dimensions.height}mm` }"><img v-if="bitmap" :src="bitmap" alt="Print design preview" class="print-bitmap" draggable="false" /><div v-for="node in nodes" :key="node.id" class="print-hitbox" :class="{ 'frame-hitbox': node.kind === 'frame', 'hidden-hitbox': !node.visible, 'empty-hitbox': !!emptyBounds[printElementId(node.id)] && !selectedIds.includes(node.id) }" :data-layer-id="node.id" :data-section-id="node.section.id" :style="boxStyle(node.id)" /></div>
        </QuoteCanvas></div></div><div class="canvas-status"><span>{{ rendering ? 'Updating preview…' : renderError ? 'Fix the preview issue before saving or printing' : 'Drag to move · Shift to constrain · Alt to bypass snapping' }}</span><button type="button" @click="shortcuts = !shortcuts">Shortcuts</button></div>
      </div>
      <aside ref="inspector" class="design-properties"><div class="inspector-header"><div class="inspector-actions"><button type="button" class="design-button" :disabled="unavailable" @click="emit('close')">Back</button><button type="button" class="design-button save-design" :disabled="unavailable || !canSave || rendering || !!renderError" @click="save">{{ busy ? 'Saving…' : 'Save design' }}</button></div><p class="inspector-save-state" role="status">{{ dirty ? 'Unsaved changes' : 'All changes saved' }}</p><div class="output-actions"><button type="button" :disabled="unavailable || rendering || !!renderError" @click="emit('output', 'pdf')">Download PDF</button><button type="button" :disabled="unavailable || rendering || !!renderError" @click="emit('output', 'print')">Test print</button></div><div class="inspector-mode"><button type="button" :aria-pressed="tab === 'design'" @click="tab = 'design'">Design</button><button type="button" :aria-pressed="tab === 'setup'" @click="tab = 'setup'">Page setup</button></div></div>
        <p v-if="error || localError || renderError" class="design-error" role="alert">{{ localError || error || renderError }}</p><p v-if="message" class="print-message" role="status">{{ message }}</p>
        <details v-if="design.kind === 'label'" class="adapter-properties product-preview"><summary>Preview data: {{ actualProduct ? actualProduct.productName + ' - ' + actualProduct.size : 'Sample product' }}</summary><label>Find a product or barcode<input v-model="productQuery" type="search" aria-label="Preview product search" @keydown.enter.prevent="findProducts" /></label><button type="button" class="design-button" :disabled="searching || unavailable" @click="findProducts">{{ searching ? 'Searching...' : 'Find product' }}</button><button v-for="product in products" :key="product.id" type="button" class="product-result" :disabled="searching" @click="chooseProduct(product)">{{ product.variant?.product?.name }} · {{ product.variant?.name }} · {{ product.size }}<small>{{ product.barcode }}</small></button><p v-if="productError" role="alert">{{ productError }}</p><p v-if="productQuery && !searching && !products.length && !actualProduct && !productError">Choose a product from the search results to preview its actual data.</p><button v-if="actualProduct" type="button" class="design-button" @click="resetProduct">Use sample product</button></details>
        <fieldset :disabled="unavailable"><div v-if="tab === 'setup'" class="properties-fields page-settings"><h3>{{ design.kind === 'label' ? 'Label' : 'Receipt' }} setup</h3><label>Design name<input v-model="design.name" aria-label="Design name" maxlength="80" /></label><label>Paper size<select :value="`${design.width}x${design.height}`" aria-label="Print paper size" @change="paper(($event.target as HTMLSelectElement).value)"><option :value="`${design.width}x${design.height}`">{{ design.width }} × {{ design.height }} mm</option><option v-for="size in papers" :key="size.label" :value="`${size.width}x${'height' in size ? size.height : design.height}`">{{ size.label }}</option></select></label><div class="two-fields"><label>Width (mm)<input :value="design.width" type="number" min="25" :max="design.paperSize ? 216 : 100" aria-label="Print paper width" @change="paper(`${Number(($event.target as HTMLInputElement).value)}x${design.height}`)" /></label><label v-if="design.kind === 'label'">Height (mm)<input :value="design.height" type="number" min="15" max="150" aria-label="Print paper height" @change="paper(`${design.width}x${Number(($event.target as HTMLInputElement).value)}`)" /></label></div><label>Resolution<select v-model="design.dpi" aria-label="Print resolution"><option value="203">203 DPI</option><option value="300">300 DPI</option></select></label><label>Page font<select v-model="design.fontFamily" aria-label="Page font"><option value="sans">Arial (standard)</option><option value="thermal">Condensed thermal</option><option v-for="font in designerFonts" :key="font" :value="font">{{ font }}</option></select></label><label><input v-model="settings[design.kind === 'label' ? 'labelId' : 'receiptId']" type="radio" :value="design.id" /> Use as default {{ design.kind }}</label><label>Start from a template<select value="" aria-label="Apply print template" @change="applyTemplate(($event.target as HTMLSelectElement).value)"><option value="" disabled>Choose template</option><option v-if="design.kind === 'label'" value="label">Standard label</option><template v-else><option value="tax">Tax Receipt</option><option value="no-tax">No Tax Receipt</option></template></select></label><button type="button" class="design-button" :disabled="settings.templates.length >= 12" @click="duplicateDesign">Duplicate design</button><button type="button" class="design-button" @click="removeDesign">Delete design</button><p>Match the paper and DPI to your printer. Printing uses your chosen fonts and layout as a rendered image.</p></div>
        <div v-else class="properties-fields">
          <section class="content-insert" aria-label="Add content" @keydown.esc.stop="tableInsert = false">
            <h3>Add content</h3>
            <div class="quick-insert" :class="{ 'has-tables': design.kind === 'receipt' }">
              <button type="button" class="design-button" :disabled="design.elements.length >= 40" @click="add('text')">+ Text</button>
              <button type="button" class="design-button" :disabled="design.elements.length >= 40" @click="add('field')">+ Linked data</button>
              <button type="button" class="design-button" :disabled="design.elements.length >= 40" @click="add('logo')">+ Image</button>
              <button type="button" class="design-button" :disabled="design.elements.length >= 40" :aria-expanded="codeInsert" aria-controls="code-insert-types" @click="codeInsert = !codeInsert; tableInsert = false">+ Codes</button>
              <button v-if="design.kind === 'receipt'" type="button" class="design-button" :disabled="design.elements.length >= 40" :aria-expanded="tableInsert" aria-controls="table-insert-sources" @click="tableInsert = !tableInsert; codeInsert = false">+ Table</button>
            </div>
            <div v-if="codeInsert" id="code-insert-types" class="table-sources">
              <h3>Codes</h3>
              <button type="button" class="table-source" aria-label="Add QR code" :disabled="design.elements.length >= 40" @click="add('qrcode')"><QrCode /><span>QR code<small>Links, payment details or any text.</small></span></button>
              <button type="button" class="table-source" aria-label="Add barcode" :disabled="design.elements.length >= 40" @click="add('barcode')"><Barcode /><span>Barcode<small>Product codes and invoice numbers. Choose a format after adding.</small></span></button>
            </div>
            <div v-if="tableInsert && design.kind === 'receipt'" id="table-insert-sources" class="table-sources">
              <h3>Table data</h3>
              <button v-for="source in tableSources" :key="source.value" type="button" class="table-source" :aria-label="`Add table from ${source.label.toLowerCase()}`" :disabled="design.elements.length >= 40" @click="add(source.value)"><Grid2X2 /><span>{{ source.label }}<small>{{ source.description }}</small></span></button>
            </div>
          </section>
          <template v-if="selected && item && selectedIds.length === 1">
            <ElementProperties :rule-fields="visibilityFields" :rule-resolver="ruleResolver" :section="{ ...selected.model, locked: selected.locked }" :box="canvas?.localBoxes[selected.id]" :page-width="design.width" :disabled="unavailable" :kind="['items', 'taxsummary'].includes(item.type) ? 'table' : ['barcode', 'qrcode'].includes(item.type) ? item.type : selected.kind" :nested="true" :parent-name="nodes.find(n => n.id === selected?.parentId)?.name || 'Page'" :inherited-locked="selected.locked && !item.locked" :text-limit="2000" :font-min="6" :font-max="32" font-unit="pt" :flow-position="flowing" :margin-values="printElementMargins(item, flowing)" :reset-label="design.kind === 'label' ? 'Reset rotation' : 'Reset to section flow'" @patch="patch(selected.id, $event)" @frame="frame" @align="align" @command="command">
              <template #content>
                <DataBinding v-if="['text', 'field', 'logo', 'barcode', 'qrcode'].includes(item.type)" :key="item.id" :kind="item.type === 'logo' ? 'image' : 'text'" :binding="item.field" :text="item.text" :fields="fields" :preview="valuePreview" :preview-label="actualProduct ? 'Selected product' : design.kind === 'label' ? 'Sample product' : 'Sample receipt'" :maxlength="2000" :search-placeholder="design.kind === 'label' ? 'Search product, price, barcode...' : 'Search customer, total, payment...'" upload-label="Upload design image" :manual-label="['barcode', 'qrcode'].includes(item.type) ? 'Code value' : undefined" nested @binding="changeBinding" @text="editItem({ text: $event })" @upload="upload">
                  <template v-if="['barcode', 'qrcode'].includes(item.type)" #before>
                    <label>Code type<select :value="item.type === 'qrcode' ? 'qrcode' : item.barcodeFormat || 'CODE128'" aria-label="Code type" @change="changeCodeType(($event.target as HTMLSelectElement).value)"><option value="qrcode">QR code</option><optgroup label="Barcodes"><option v-for="format in barcodeFormatOptions" :key="format.value" :value="format.value">{{ format.label }}</option></optgroup></select></label>
                    <p class="property-help">{{ item.type === 'qrcode' ? 'Use a data field or a custom value. Choose UPI payment link to use the receipt payment QR.' : barcodeFormatInfo(item.barcodeFormat).hint + ' Example: ' + barcodeFormatInfo(item.barcodeFormat).example }}</p>
                    <label v-if="item.type === 'barcode'" class="property-check"><input :checked="item.barcodeDisplayValue !== false" type="checkbox" aria-label="Show barcode value" @change="editItem({ barcodeDisplayValue: ($event.target as HTMLInputElement).checked })" /> Show readable value</label>
                  </template>
                  <template v-if="['field', 'barcode', 'qrcode'].includes(item.type)" #format>
                    <label>Text before value<input :value="item.text" maxlength="2000" aria-label="Text before value" placeholder="e.g. Total: " @input="editItem({ text: ($event.target as HTMLInputElement).value })" /></label>
                    <label>Text after value<input :value="item.suffix || ''" maxlength="2000" aria-label="Text after value" placeholder="e.g.  incl. tax" @input="editItem({ suffix: ($event.target as HTMLInputElement).value })" /></label>
                    <p v-if="['barcode', 'qrcode'].includes(item.type)" class="property-help">Text before and after the value is included in the code.</p>
                  </template>
                  <p v-if="['barcode', 'qrcode'].includes(item.type)" class="property-help">{{ item.type === 'barcode' ? 'Keep enough space around the bars for scanning. Print a sample to check this size.' : 'QR code uses the complete value shown above.' }}</p>
                  <p v-if="design.kind === 'receipt' && ['text', 'field'].includes(item.type) && !valuePreview" class="property-help">No preview value. You can still style this empty text box with Background and Stroke.</p>
                </DataBinding>
                <section v-else-if="['items', 'taxsummary'].includes(item.type)" class="adapter-properties table-data"><h3>Content</h3><label>Table data source<select :value="item.type" aria-label="Table data source" :disabled="locked" @change="changeTableSource(($event.target as HTMLSelectElement).value)"><option v-for="source in tableSources" :key="source.value" :value="source.value">{{ source.label }}</option></select></label><p>{{ tableSources.find(source => source.value === item?.type)?.description }}</p></section>
                <section v-else-if="item.type === 'frame'" class="adapter-properties"><h3>Content</h3><p>Add a layer inside this frame.</p><div class="add-section"><button v-for="type in (['text','field','logo','shape','frame'] as const)" :key="type" type="button" class="design-button" :disabled="design.elements.length >= 40" @click="add(type)">{{ type === 'field' ? 'Linked data' : type === 'logo' ? 'Image' : type }}</button></div><button type="button" class="design-button" @click="command('ungroup')">Ungroup frame</button></section>
              </template>
              <template #placement>
                <div class="placement-properties"><label v-if="design.kind === 'receipt' && !item.parentId">Placement<select :value="item.placement || 'flow'" aria-label="Receipt element placement" @change="changePlacement(($event.target as HTMLSelectElement).value)"><option value="flow">In receipt flow</option><option value="absolute">Fixed on page</option></select></label><p v-else class="property-help">{{ item.parentId ? 'Position is relative to the parent frame.' : 'Fixed position on the label.' }}</p><p v-if="design.kind === 'receipt' && !item.parentId" class="property-help">{{ flowing ? 'Follows the previous layer as tables grow. Move with Y, canvas dragging or the top margin.' : 'Stays at X and Y on the page, independently of other layers.' }}</p></div>
              </template>

              <template v-if="['text', 'items', 'taxsummary'].includes(item.type)" #typography>
                <label v-if="['items', 'taxsummary'].includes(item.type)">Font<select :value="item.fontFamily || ''" aria-label="Table font" @change="editItem({ fontFamily: (($event.target as HTMLSelectElement).value || undefined) as PrintElement['fontFamily'] })"><option value="">Page font</option><option v-for="font in designerFonts" :key="font">{{ font }}</option></select></label>
                <label v-if="['items', 'taxsummary'].includes(item.type)">Text size (pt)<input :value="item.fontSize" type="number" min="6" max="32" aria-label="Receipt section font size" @input="editItem({ fontSize: Number(($event.target as HTMLInputElement).value) })" /></label>
                <TextProperties v-if="item.type === 'text'" :text="item.text" :heading="item.heading" :maxlength="2000" hide-text hide-border @update:text="editItem({ text: $event })" @update:heading="editItem({ heading: $event })" />
              </template>
              <template #stroke>
                <label v-if="item.type === 'text'" class="property-check"><input :checked="item.border" type="checkbox" aria-label="Text section border" @change="editItem({ border: ($event.target as HTMLInputElement).checked })" /> Section border</label>
                <label v-if="item.type === 'line'" class="property-check"><input :checked="item.doubleLine" type="checkbox" aria-label="Double line" @change="editItem({ doubleLine: ($event.target as HTMLInputElement).checked })" /> Double line</label>
              </template>
              <template v-if="['items', 'taxsummary'].includes(item.type)" #properties>
            <section class="adapter-properties">
              <h3>Columns</h3>
              <button type="button" class="design-button" @click="standardColumns">Standard columns</button>
              <button v-if="item.type === 'items'" type="button" class="design-button" @click="activeColumns = twoLineTableColumns()">Two-line layout</button>
              <TableProperties v-model="item.tableStyle" :defaults="{ cellPadding: item.tablePadding ?? .5, fontSize: item.fontSize, borderWidth: .2 }" />
              <label class="property-check"><input v-model="item.tableBorders" type="checkbox" /> Cell borders</label>
              <label class="property-check"><input v-model="item.tableTotals" type="checkbox" /> Column totals</label>
              <label class="property-check"><input v-model="item.tableHeaderBold" type="checkbox" /> Bold headings</label>
              <label class="property-check"><input v-model="item.tableRules" type="checkbox" /> Row rules</label>
              <label class="property-check"><input v-model="item.tableDashedRules" type="checkbox" /> Dashed rules</label>
              <label>Space between rows (mm)<input v-model.number="item.tableItemGap" type="number" min="0" max="10" step=".5" /></label>
              <div v-for="(column, index) in activeColumns" :key="column.id" class="column-properties">
                <label>Heading<textarea v-model="column.header" maxlength="200" :aria-label="`Table column ${index + 1} heading`" /></label>
                <label>Link to row data<select v-model="column.field" :aria-label="`Table column ${index + 1} field`"><optgroup v-for="group in columnGroups" :key="group.group" :label="group.group"><option v-for="field in group.fields" :key="field.key" :value="field.key">{{ field.label }}</option></optgroup></select></label>
                <ColumnWidth :model-value="columnWidth(index)" :minimum="1" :maximum="100 - (columnSet(index).length - 1)" :label="`Table column ${index + 1} width`" @update:model-value="setColumnWidth(index, $event)" />
                <label>Alignment<select v-model="column.align"><option>left</option><option>center</option><option>right</option></select></label>
                <label>Line<input v-model.number="column.line" type="number" min="1" max="3" /></label>
                <label>Text after value<input v-model="column.suffix" maxlength="20" :aria-label="`Table column ${index + 1} suffix`" /></label>
                <label class="property-check"><input v-model="column.total" type="checkbox" /> Show total</label>
                <label>Total row label<input v-model="column.totalLabel" maxlength="40" :aria-label="`Table column ${index + 1} total label`" /></label>
                <div class="add-section"><button type="button" class="design-button" :disabled="index === 0" @click="activeColumns.splice(index - 1, 0, activeColumns.splice(index, 1)[0])">Move left</button><button type="button" class="design-button" :disabled="activeColumns.length <= 1" @click="activeColumns.splice(index, 1)">Remove</button></div>
              </div>
              <button type="button" class="design-button" :disabled="activeColumns.length >= 12" @click="addColumn">Add column</button>
            </section>
              </template>
            </ElementProperties>
          </template><p v-else class="empty-selection">{{ selectedIds.length ? selectedIds.length + ' layers selected. Move, resize, group or align them together.' : 'Select a layer to change its content, data source and position.' }}</p>
          <section v-if="variableError" class="adapter-properties"><p>{{ variableError }} <button type="button" @click="emit('retryVariables')">Retry</button></p></section>
        </div></fieldset>
      </aside>
      <div v-if="contextMenu" class="canvas-context-menu" role="menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @pointerdown.stop><button v-for="action in ['copy','cut','paste','duplicate','group','ungroup','lock','front','back','delete']" :key="action" type="button" role="menuitem" :disabled="unavailable || !selectedIds.length && action !== 'paste'" @click="command(action)">{{ action }}</button></div>
      <div v-if="shortcuts" class="shortcut-panel"><div class="layers-heading"><h3>Keyboard shortcuts</h3><button type="button" @click="shortcuts = false">Close</button></div><dl><dt>Ctrl/⌘ Z · Ctrl Y</dt><dd>Undo · Redo</dd><dt>Ctrl/⌘ S</dt><dd>Save design</dd><dt>Ctrl/⌘ D</dt><dd>Duplicate</dd><dt>Ctrl/⌘ C/X/V</dt><dd>Copy / Cut / Paste</dd><dt>Ctrl/⌘ G · Shift G</dt><dd>Group / Ungroup</dd><dt>Arrows · Shift arrows</dt><dd>Move 0.1 / 1 mm</dd><dt>V / H · Space</dt><dd>Move / Hand · Pan</dd><dt>Ctrl/⌘ 0 / 1</dt><dd>Fit / 100%</dd><dt>Ctrl/⌘ wheel</dt><dd>Zoom</dd></dl></div>
    </div>
  </main>
</template>
<style scoped src="./workspace.css"></style>
<style scoped>
.properties-fields label{display:grid;gap:5px;font-size:10px;color:#777}.properties-fields .property-check{display:flex;align-items:center;gap:6px}.properties-fields input:not([type=checkbox]),.properties-fields select{box-sizing:border-box;width:100%;min-width:0;padding:8px;border:1px solid #eee;border-radius:4px;background:#f5f5f5;color:#333;font-size:11px}.property-help{margin:0;font-size:10px;line-height:1.5;color:#888}.placement-properties{display:grid;gap:8px}.property-check{display:flex;gap:6px;align-items:center}.content-insert{padding:12px;border-bottom:1px solid #e8e8e8}.content-insert h3{margin:0 0 9px}.content-insert .quick-insert{padding:0;border:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.content-insert .quick-insert.has-tables>.design-button:last-child{grid-column:1/-1}.content-insert .design-button{padding:8px}.table-sources{margin-top:12px;padding-top:12px;border-top:1px solid #eee}.table-source{display:flex;align-items:flex-start;gap:8px;width:100%;padding:9px 8px;border-radius:5px;text-align:left;font-size:11px}.table-source:hover,.table-source:focus-visible{background:#f1f5f9}.table-source svg{width:16px;height:16px;flex-shrink:0;color:#64748b}.table-source small{display:block;margin-top:4px;color:#888;font-size:10px;line-height:1.5}.product-preview summary{font-size:11px;cursor:pointer}.product-preview[open]{display:block}.product-preview[open]>*:not(summary){margin-top:10px}.product-result{display:block;width:100%;padding:8px;border:1px solid #eee;border-radius:4px;text-align:left;font-size:11px}.product-result small{display:block;color:#999}.print-paper{position:relative;background:white;box-shadow:0 2px 10px #0001}.print-bitmap{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.print-hitbox{position:absolute;box-sizing:border-box;min-height:1mm;cursor:move;z-index:2}.print-hitbox:hover{outline:1px solid #0d99ff66}.frame-hitbox{z-index:1}.hidden-hitbox{visibility:hidden}.empty-hitbox{pointer-events:none}.adapter-properties{display:grid;gap:10px;padding:14px 16px;border-top:1px solid #e8e8e8}.adapter-properties h3{margin:0}.adapter-properties p{margin:0;font-size:10px;line-height:1.5;color:#888}.save-design{background:#f97316;color:white;border-color:#f97316;font-weight:600}.output-actions{display:flex;gap:6px;margin:8px 0}.output-actions button{flex:1;font-size:10px;padding:6px;border:1px solid #eee;border-radius:4px}.print-message{padding:10px 16px;color:#15803d;font-size:11px}.canvas-toolbar>select{width:auto;max-width:130px;margin-left:8px;font-size:10px}.quote-designer{position:relative}.adapter-properties input[type=checkbox],.page-settings input[type=radio]{width:auto}
</style>
