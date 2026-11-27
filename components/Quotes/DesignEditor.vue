<script setup lang="ts">
import { transformLayerVector } from '~/utils/designer-presentation'
import { nextTick, onBeforeUnmount, onMounted } from 'vue'
import { MousePointer2, Hand, Type, Image as ImageIcon, Square, Minus, Eye, EyeOff, Lock, LockOpen, Layers, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, Columns3, Rows3, Copy, Trash2, Group, Keyboard, Grid2X2, Magnet } from 'lucide-vue-next'
import QuoteCanvas from '~/components/DocumentDesigner/QuoteCanvas.vue'
import { quoteRulesProtected } from '~/utils/quote-rule-guards'
import ElementProperties from '~/components/DocumentDesigner/ElementProperties.vue'
import LayerTree from '~/components/DocumentDesigner/LayerTree.vue'
import { quoteLayers, quoteLayerTree, findQuoteLayer, patchQuoteLayer, setQuoteLayerBinding, restoreQuoteLayer, independentLayerIds, layerAncestors, type QuoteLayerNode } from '~/utils/quote-layers'
import { quoteLayerHasRowData } from '~/utils/quote-layer-definitions'
import { quoteBindingFields, quoteBindingLabel, quoteDocumentBindingValues, quoteItemBindingValues, quoteDocumentRuleValues, quoteItemRuleValues } from '~/utils/quote-bindings'
import type { QuoteDesignElement } from '~/utils/quote-design'
import { boxUnion, constrainBox, roundMM, type DesignerBox } from '~/utils/designer-geometry'
import { useDocumentSections } from '~/utils/document-designer-sections'
import TableProperties from '~/components/DocumentDesigner/TableProperties.vue'
import ColumnWidth from '~/components/DocumentDesigner/ColumnWidth.vue'
import { columnPercentage, setColumnPercentage } from '~/utils/document-table'
import CanvasToolbar from '~/components/DocumentDesigner/CanvasToolbar.vue'
import DesignerTools from '~/components/DocumentDesigner/Tools.vue'
import TextProperties from '~/components/DocumentDesigner/TextProperties.vue'
import { sheetSizes, sheetDimensions, type CustomDocumentSection } from '~/utils/document-designer'
import { prepareDesignerImage } from '~/utils/designer-image.client'
import { useDesignerHistory } from '~/utils/designer-history'
import { defaultQuoteDesign, quoteDesignTemplate, newQuoteDesignSection, normalizeQuoteDesign, quoteSectionLabels, type QuoteDesign, type QuoteDesignSection, type QuoteSectionKind } from '~/utils/quote-design'
const props = defineProps<{ modelValue: QuoteDesign; company: any; busy: boolean; error?: string; savedDesign: string; documentKind?: 'quote' | 'sales-order' }>()
const emit = defineEmits<{ 'update:modelValue': [design: QuoteDesign]; close: []; save: [] }>()
const isSalesOrder = props.documentKind === 'sales-order'
const documentTitle = isSalesOrder ? 'Sales order' : 'Quote'
const draft = ref<QuoteDesign>(JSON.parse(JSON.stringify(props.modelValue)))
const history = useDesignerHistory(draft)
const selectedIds = ref<string[]>([draft.value.sections[0].id])
const selectedId = computed({ get: () => selectedIds.value[0] || '', set: id => { selectedIds.value = id ? [id] : [] } })
const tab = ref('design'), zoom = ref(75), draggedId = ref(''), uploadError = ref('')
const canvas = ref<InstanceType<typeof QuoteCanvas> | null>(null), showLayers = ref(true), tool = ref('select'), snapping = ref(true), grid = ref(false), shortcuts = ref(false)
const contextMenu = ref<{ x: number; y: number } | null>(null), clipboard = ref<QuoteDesignSection[]>([])
const nestedClipboard = ref<QuoteDesignElement[]>([])
const allLayers = computed(() => quoteLayers(draft.value)), tree = computed(() => quoteLayerTree(draft.value))
const selectedNode = computed(() => allLayers.value.find(n => n.id === selectedId.value))
const mutableSelection = computed(() => allLayers.value.filter(s => selectedIds.value.includes(s.id) && !s.locked).map(n => n.model))
const selectionLocked = computed(() => allLayers.value.some(s => selectedIds.value.includes(s.id) && s.locked))
const selectionBox = computed(() => canvas.value?.bounds || null)
const alignActions = [
  { value: 'left', label: 'Align left', icon: AlignStartVertical }, { value: 'center', label: 'Align horizontal centers', icon: AlignCenterVertical }, { value: 'right', label: 'Align right', icon: AlignEndVertical },
  { value: 'top', label: 'Align top', icon: AlignStartHorizontal }, { value: 'middle', label: 'Align vertical centers', icon: AlignCenterHorizontal }, { value: 'bottom', label: 'Align bottom', icon: AlignEndHorizontal },
]
const unavailable = computed(() => props.busy || uploading.value)
const selected = computed(() => selectedNode.value?.model)
const inspectorModel = computed(() => selected.value && { ...selected.value, ...(canvas.value?.presentation[selectedId.value] || {}), ...(selectedNode.value?.element || {}), kind: selected.value.kind, id: selected.value.id, locked: selectionLocked.value })
const inspectorBox = computed(() => canvas.value?.localBoxes[selectedId.value])
const dirty = computed(() => JSON.stringify(draft.value) !== props.savedDesign)
const canvasViewport = ref<HTMLElement | null>(null)
const propertiesPanel = ref<HTMLElement | null>(null), sectionProperties = ref<HTMLElement | null>(null), tableProperties = ref<HTMLElement | null>(null)
function fitCanvas() {
  const viewport = canvasViewport.value
  if (!viewport) return
  const style = getComputedStyle(viewport), available = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  zoom.value = Math.max(10, Math.min(300, Math.floor(available / (page.value.width * 96 / 25.4) * 100)))
}
const uploading = ref(false)
const page = computed(() => sheetDimensions(draft.value.paperSize))
const templateOptions = [{ value: 'standard', label: 'Standard business' }, { value: 'professional', label: 'Professional proposal' }, { value: 'compact', label: 'Compact' }]
function applyTemplate(name: string) {
  if (props.busy || uploading.value) return
  history.begin()
  const paperSize = draft.value.paperSize
  draft.value = quoteDesignTemplate(name); draft.value.paperSize = paperSize
  if (isSalesOrder) draft.value.sections.at(-1)!.text = 'Thank you for your order.'
  selectedId.value = draft.value.sections[0].id; tab.value = 'design'
  history.end()
}
function setPaper(size: string) {
  if (props.busy || uploading.value) return
  history.begin()
  draft.value.paperSize = sheetDimensions(size).value
  const paper = page.value
  for (const section of draft.value.sections.filter(s => s.placement === 'absolute')) {
    if (section.frameWidth) section.frameWidth = Math.min(section.frameWidth, paper.width)
    section.x = Math.max(0, Math.min(section.x || 0, paper.width - (section.frameWidth ?? paper.width * section.width / 100)))
    if (section.kind === 'image' && !section.frameWidth) section.y = Math.min(section.y || 0, paper.height - section.imageHeight)
  }
  history.end()
}
function addCustom(section: CustomDocumentSection) {
  if (props.busy || uploading.value || draft.value.sections.length >= 30) return
  history.begin(); add('text'); Object.assign(selected.value!, section); history.end()
}

const sample = { quoteNumber: isSalesOrder ? 'SO-00001' : 'QT-00001', quoteDate: '2026-10-29', expiryDate: '2026-11-29', clientName: 'Sample Customer', clientPhone: '9876543210', referenceNumber: 'Project reference', salesperson: 'Alex', subject: isSalesOrder ? 'Your sales order' : 'Your quotation', notes: isSalesOrder ? 'Thank you for your order.' : 'Thank you for your enquiry.', termsAndConditions: 'Prices are valid until the date shown.', paymentTerms: 'Due within 30 days', deliveryEstimate: 'Within 7 working days', discount: 0, discountType: 'amount', adjustment: 0, subTotal: 2360, total: 2360, items: [{ id: 'sample', name: 'Sample product', description: 'Product description', size: 'M', quantity: 2, unit: 'pcs', rate: 1180, tax: 18, discount: 0, amount: 2360 }] }
const rowData = computed(() => !!selectedNode.value && quoteLayerHasRowData(selectedNode.value.section, selectedNode.value.key))
const ruleValues = computed(() => ({...quoteDocumentRuleValues(sample, props.company || {}), ...(rowData.value ? quoteItemRuleValues(sample.items[0],0) : {})}))
const ruleResolver = (key: string) => ruleValues.value[key]
const ruleFields = computed(() => quoteBindingFields.filter(field => !field.row || rowData.value).map(field => ({...field,label:quoteBindingLabel(field,isSalesOrder)})))
const dataPreview = computed(() => ({ ...quoteDocumentBindingValues(sample, props.company || {}, draft.value.layout === 'professional'), ...(rowData.value ? quoteItemBindingValues(sample.items[0], 0, props.company?.currency || 'INR') : {}) })[selectedNode.value?.binding || ''] || '')
const inspectorText = computed(() => {
  const node = selectedNode.value
  if (!node) return ''
  if (!node.key && node.section.kind === 'text' && !node.binding) return node.section.text
  return node.element?.text ?? (!node.key && node.section.kind === 'field' ? node.section.elements?.find(e => e.key === 'field-value')?.text : undefined) ?? canvas.value?.renderedText[selectedId.value] ?? ''
})
function changeBinding(value: string) {
  if (unavailable.value) return
  history.begin(); setQuoteLayerBinding(draft.value, selectedId.value, value, selectedNode.value?.binding ? dataPreview.value : inspectorText.value); history.end()
}
function quickAdd(kind: 'text' | 'field' | 'image') {
  if (selectedNode.value?.kind === 'frame' && selectedIds.value.length === 1) addInside(kind === 'field' ? 'text' : kind)
  else add(kind)
  if (kind === 'field') nextTick(() => propertiesPanel.value?.querySelector<HTMLSelectElement>('[aria-label="Link to data"]')?.focus())
}
watch(draft, value => emit('update:modelValue', JSON.parse(JSON.stringify(value))), { deep: true })
function selectIds(ids: string[]) {
  selectedIds.value = independentLayerIds(allLayers.value, ids); tab.value = ids.length ? 'design' : 'setup'; uploadError.value = ''
  nextTick(() => { if (propertiesPanel.value) propertiesPanel.value.scrollTop = 0 })
}
const select = (id: string, event?: MouseEvent) => {
  const section = findQuoteLayer(draft.value, id)?.model
  const ids = section?.groupId ? allLayers.value.filter(s => s.model.groupId === section.groupId).map(s => s.id) : [id]
  selectIds(event?.shiftKey ? selectedIds.value.includes(id) ? selectedIds.value.filter(key => !ids.includes(key)) : [...selectedIds.value, ...ids] : ids)
}
function add(kind: QuoteSectionKind, position = 'after') {
  if (unavailable.value || draft.value.sections.length >= 30) return
  const section = newQuoteDesignSection(kind, crypto.randomUUID())
  const index = position === 'start' ? 0 : position === 'end' ? draft.value.sections.length : draft.value.sections.findIndex(s => s.id === selectedNode.value?.section.id) + 1
  if (kind === 'image' && position === 'after') Object.assign(section, { placement: 'absolute', x: 10, y: 10, width: 25 })
  draft.value.sections.splice(index, 0, section); select(section.id)
}
function setColumnWidth(field: string, percent: number) {
  const columns = draft.value.columns.filter(column => column.visible)
  setColumnPercentage(columns, columns.findIndex(column => column.field === field), percent, 3)
}
function resizeColumns(columns: { field: string; width: number }[]) {
  if (props.busy || uploading.value || draft.value.sections.find(s => s.kind === 'items')?.locked) return
  for (const column of columns) { const target = draft.value.columns.find(c => c.field === column.field); if (target) target.width = column.width }
}
function setPlacement(value: string) {
  if (!selected.value) return
  Object.assign(selected.value, { placement: value, x: 10, y: 10, width: value === 'absolute' ? Math.min(80, selected.value.width) : selected.value.width })
}
function setColumn(value: string) {
  if (selected.value) selected.value.column = value === 'left' || value === 'right' ? value : undefined
}
function setFieldRole(value: string) {
  if (selected.value) selected.value.role = value === 'signature' || value === 'contact' ? value : undefined
}
const sections = useDocumentSections({ sections: computed(() => draft.value.sections), selectedId,
  locked: () => props.busy || uploading.value, limit: 30, minimum: 2,
  protected: section => ['items', 'totals'].includes(section.kind) })
const move = sections.move
function drop(id: string) {
  const source = findQuoteLayer(draft.value, draggedId.value), target = findQuoteLayer(draft.value, id)
  if (source?.key && source.element?.kind && target?.kind === 'frame' && target.section.id === source.section.id && !target.locked && !source.locked && !layerAncestors(allLayers.value, target.id).some(n => n.id === source.id) && source.id !== target.id) {
    const moved = [source, ...allLayers.value.filter(n => layerAncestors(allLayers.value, n.id).some(a => a.id === source.id))]
    if (!quoteLayerHasRowData(target.section, target.key) && moved.some(n => quoteBindingFields.some(field => field.key === n.binding && field.row))) { uploadError.value = 'Product fields must stay inside Product details · each row.'; draggedId.value = ''; return }
    const descendantDepth = Math.max(0, ...allLayers.value.filter(n => layerAncestors(allLayers.value, n.id).some(a => a.id === source.id)).map(n => layerAncestors(allLayers.value, n.id).length - layerAncestors(allLayers.value, source.id).length))
    if (layerAncestors(allLayers.value, target.id).length + 1 + descendantDepth > 8) { uploadError.value = 'Frames can be nested up to eight levels.'; draggedId.value = ''; return }
    const box = canvas.value?.boxes[source.id], parent = canvas.value?.boxes[target.id]
    if (box && parent) {
      const angle = -(canvas.value?.rotations[target.id] || 0) * Math.PI / 180, dx = box.x + box.width / 2 - parent.x - parent.width / 2, dy = box.y + box.height / 2 - parent.y - parent.height / 2
      const rotation = (canvas.value?.rotations[source.id] || 0) - (canvas.value?.rotations[target.id] || 0)
      history.begin(); Object.assign(source.element, canvas.value?.presentation[source.id], { parent: target.key || undefined, x: roundMM(parent.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle) - box.width / 2), y: roundMM(parent.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) - box.height / 2), rotation: (rotation + 540) % 360 - 180 }); history.end()
    }
  } else if (source && target && !source.key && !target.key) sections.drop(source.id, target.id)
  draggedId.value = ''
}
function remove() { command('delete') }
function duplicate() { command('duplicate') }
function patch(id: string, value: Partial<QuoteDesignSection>) {
  if (unavailable.value) return
  const node = findQuoteLayer(draft.value, id)
  if (value.fillOpacity !== undefined && node?.kind === 'text' && !(node.key ? node.element?.color : node.section.color)) value = { ...value, color: canvas.value?.presentation[id]?.color || '#111827' }
  if (value.text !== undefined && node && !node.key && ['field', 'subject'].includes(node.section.kind) && !node.binding) {
    setQuoteLayerBinding(draft.value, id, '', value.text)
    patchQuoteLayer(draft.value, `${node.section.id}::${node.section.kind === 'field' ? 'field-value' : 'subject-text'}`, value); return
  }
  if (value.text !== undefined && node && !node.key && node.section.kind === 'text' && !node.binding) {
    const body = node.section.elements?.find(e => e.key === 'text-body')
    if (body) delete body.text
  }
  patchQuoteLayer(draft.value, id, value)
}
function transform(frames: { id: string; box: DesignerBox; original: DesignerBox; resize: boolean; initial?: QuoteDesignSection | QuoteDesignElement | null }[]) {
  if (unavailable.value) return
  frames.forEach(({ id, box, original, resize, initial }) => {
    const node = findQuoteLayer(draft.value, id), section = node?.section
    if (!node || !section || node.locked) return
    if (node.key) {
      const bounded = constrainBox(box, page.value.width, 5000), dx = bounded.x - original.x, dy = bounded.y - original.y, baseline = initial === undefined ? node.element : initial
      const delta = transformLayerVector(layerAncestors(allLayers.value, id).map(n => n.model), dx, dy, true)
      const x = (baseline?.x || 0) + delta.x, y = (baseline?.y || 0) + delta.y
      patch(id, { x: roundMM(x), y: roundMM(y), ...(resize ? { frameWidth: roundMM(bounded.width), frameHeight: roundMM(bounded.height), resizeMode: 'fixed' as const } : {}) })
      if (resize && !node.element?.kind && ['image', 'text'].includes(node.kind)) {
        const element = node.section.elements?.find(e => e.key === node.key)
        if (element) { element.slotWidth ??= roundMM(original.width); element.slotHeight ??= roundMM(original.height) }
      }
      return
    }
    const next = constrainBox(box, page.value.width, 5000)
    if (section.placement !== 'absolute') section.flowHeight = roundMM(original.height)
    Object.assign(section, { placement: 'absolute', x: next.x, y: next.y, frameWidth: next.width,
      ...(resize ? { frameHeight: next.height, resizeMode: 'fixed' as const } : {}) })
  })
}
function editFrame(frame: Partial<DesignerBox>) {
  if (!selected.value || !canvas.value?.boxes[selectedId.value]) return
  const original = canvas.value.boxes[selectedId.value]
  const local = inspectorBox.value || original
  const dx = (frame.x ?? local.x) - local.x, dy = (frame.y ?? local.y) - local.y
  const delta = transformLayerVector(layerAncestors(allLayers.value, selectedId.value).map(n => n.model), dx, dy)
  const world = { ...original, ...frame, x: original.x + delta.x, y: original.y + delta.y }
  history.begin(); transform([{ id: selectedId.value, box: world, original, resize: frame.width !== undefined || frame.height !== undefined }]); history.end()
}
function editSelection(frame: Partial<DesignerBox>) {
  if (!selectionBox.value || selectionLocked.value || unavailable.value) return
  const union = selectionBox.value
  history.begin()
  transform(mutableSelection.value.flatMap(section => {
    const original = canvas.value?.boxes[section.id]
    return original ? [{ id: section.id, original, resize: false, box: { ...original, x: original.x + (frame.x ?? union.x) - union.x, y: original.y + (frame.y ?? union.y) - union.y } }] : []
  }))
  history.end()
}
function align(value: string) {
  if (selectionLocked.value || unavailable.value) return
  canvas.value?.refresh()
  const elements = mutableSelection.value.flatMap(s => canvas.value?.boxes[s.id] ? [{ id: s.id, box: { ...canvas.value.boxes[s.id] } }] : [])
  if (!elements.length) return
  const node = elements.length === 1 ? findQuoteLayer(draft.value, elements[0].id) : undefined
  const local = node?.parentId ? canvas.value?.localBoxes[node.id] : undefined, parent = node?.parentId ? canvas.value?.boxes[node.parentId] : undefined
  if (local && parent) {
    editFrame({ x: value === 'left' ? 0 : value === 'center' ? (parent.width - local.width) / 2 : value === 'right' ? parent.width - local.width : local.x,
      y: value === 'top' ? 0 : value === 'middle' ? (parent.height - local.height) / 2 : value === 'bottom' ? parent.height - local.height : local.y }); return
  }
  const union = boxUnion(elements.map(e => e.box)), target = elements.length === 1 ? { x: draft.value.padding, y: draft.value.padding, width: page.value.width - draft.value.padding * 2, height: page.value.height - draft.value.padding * 2 } : union
  const frames = elements.map(({ id, box }) => ({ id, original: box, resize: false, box: { ...box,
    x: value === 'left' ? target.x : value === 'center' ? target.x + (target.width - box.width) / 2 : value === 'right' ? target.x + target.width - box.width : box.x,
    y: value === 'top' ? target.y : value === 'middle' ? target.y + (target.height - box.height) / 2 : value === 'bottom' ? target.y + target.height - box.height : box.y } }))
  history.begin(); transform(frames); history.end()
}
function distribute(axis: 'x' | 'y') {
  if (selectionLocked.value || unavailable.value) return
  const size = axis === 'x' ? 'width' : 'height'
  const elements = mutableSelection.value.flatMap(s => canvas.value?.boxes[s.id] ? [{ id: s.id, box: { ...canvas.value.boxes[s.id] } }] : []).sort((a, b) => a.box[axis] - b.box[axis])
  if (elements.length < 3) return
  const union = boxUnion(elements.map(e => e.box)), gap = (union[size] - elements.reduce((sum, e) => sum + e.box[size], 0)) / (elements.length - 1)
  let cursor = union[axis]
  history.begin(); transform(elements.map(({ id, box }) => { const next = { ...box, [axis]: cursor }; cursor += box[size] + gap; return { id, original: box, box: next, resize: false } })); history.end()
}
function addInside(kind: 'text' | 'image' | 'shape' | 'frame') {
  const node = selectedNode.value
  if (!node || node.locked || node.kind !== 'frame' || unavailable.value) return
  if (layerAncestors(allLayers.value, node.id).length >= 8) { uploadError.value = 'Frames can be nested up to eight levels.'; return }
  if ((node.section.elements?.length || 0) >= 100) { uploadError.value = 'This section can contain up to 100 nested layers.'; return }
  if (draft.value.sections.reduce((count, s) => count + (s.elements?.length || 0), 0) >= 300) { uploadError.value = 'This design can contain up to 300 nested layer edits.'; return }
  const key = crypto.randomUUID()
  history.begin(); (node.section.elements ||= []).push({ key, kind, parent: node.key || undefined, x: 4, y: 4, frameWidth: kind === 'frame' ? 60 : 35, frameHeight: kind === 'text' ? 12 : 20, ...(kind === 'text' ? { text: 'Your text here', fontSize: 12 } : {}), ...(kind === 'shape' ? { background: '#e2e8f0' } : {}) }); history.end()
  select(`${node.section.id}::${key}`)
}
function captureNested(nodes: QuoteLayerNode[]) {
  const result: QuoteDesignElement[] = [], groups = new Map<string, string>()
  function capture(node: QuoteLayerNode, parent?: string) {
    const key = crypto.randomUUID(), box = canvas.value?.localBoxes[node.id]
    if (!box && !node.element?.kind) return
    const kind = node.children.length ? 'frame' : node.kind
    const binding = node.binding === 'field' ? node.section.field || (node.section.role === 'signature' ? 'companyName' : undefined) : node.binding
    const { id: unusedId, kind: unusedKind, elements: unusedElements, ...style } = node.model
    if (node.model.groupId && !groups.has(node.model.groupId)) groups.set(node.model.groupId, crypto.randomUUID())
    result.push({ ...style, ...(canvas.value?.presentation[node.id] || {}), ...node.element, key, kind, parent,
      binding: binding as QuoteDesignElement['binding'], text: kind === 'frame' || kind === 'image' || binding ? undefined : canvas.value?.renderedText[node.id] || node.model.text,
      x: box?.x || 0, y: box?.y || 0, frameWidth: box?.width || 35, frameHeight: box?.height || 12, locked: parent ? node.model.locked : false, groupId: node.model.groupId ? groups.get(node.model.groupId) : undefined })
    node.children.forEach(child => capture(child, key))
  }
  nodes.filter(n => !n.protected && n.section.kind !== 'items').forEach(node => capture(node))
  return result
}
function nestedCommand(action: string) {
  const chosen = allLayers.value.filter(n => selectedIds.value.includes(n.id)), editable = chosen.filter(n => !n.locked)
  if (['copy', 'cut', 'duplicate'].includes(action) && chosen.every(n => n.protected || n.section.kind === 'items')) return
  if (action === 'copy' || action === 'cut') { nestedClipboard.value = captureNested(chosen); clipboard.value = []; if (action === 'copy') return }
  history.begin()
  if (action === 'delete' || action === 'cut') {
    for (const node of editable.filter(n => !n.protected && (action !== 'cut' || n.section.kind !== 'items'))) {
      if (node.element?.kind) {
        const remove = new Set([node.key, ...allLayers.value.filter(n => layerAncestors(allLayers.value, n.id).some(a => a.id === node.id)).map(n => n.key)])
        node.section.elements = node.section.elements?.filter(e => !remove.has(e.key))
      } else patch(node.id, { visible: false })
    }
    selectedIds.value = []
  } else if (action === 'duplicate' || action === 'paste') {
    const source = action === 'paste' ? JSON.parse(JSON.stringify(nestedClipboard.value)) as QuoteDesignElement[] : captureNested(chosen)
    const destination = selectedNode.value, section = destination?.section
    if (destination && section && (section.elements?.length || 0) + source.length <= 100 && draft.value.sections.reduce((count, s) => count + (s.elements?.length || 0), source.length) <= 300) {
      const rootKeys = source.filter(e => !e.parent).map(e => e.key), keys = new Map(source.map(e => [e.key, crypto.randomUUID()]))
      const parent = destination.key ? destination.kind === 'frame' && action === 'paste' ? destination.key : destination.parent : undefined
      const parentNode = parent ? allLayers.value.find(n => n.section.id === section.id && n.key === parent) : undefined
      if (!quoteLayerHasRowData(section, parent || '') && source.some(e => quoteBindingFields.some(field => field.key === e.binding && field.row))) { uploadError.value = 'Product fields must stay inside Product details · each row.'; history.end(); return }
      const relativeDepth = Math.max(0, ...source.map(e => { let depth = 1, ancestor = e.parent; while (ancestor) { depth++; ancestor = source.find(n => n.key === ancestor)?.parent } return depth }))
      if ((parentNode ? layerAncestors(allLayers.value, parentNode.id).length : 0) + relativeDepth > 8) { uploadError.value = 'Frames can be nested up to eight levels.'; history.end(); return }
      const groups = new Map<string, string>()
      source.forEach(e => { const root = !e.parent; if (e.groupId) { if (!groups.has(e.groupId)) groups.set(e.groupId, crypto.randomUUID()); e.groupId = groups.get(e.groupId) } e.key = keys.get(e.key)!; e.parent = e.parent ? keys.get(e.parent) : parent; if (root) { e.x = (e.x || 0) + 4; e.y = (e.y || 0) + 4 } })
      ;(section.elements ||= []).push(...source); selectIds(rootKeys.map(key => `${section.id}::${keys.get(key)}`))
    } else uploadError.value = 'This section can contain up to 100 nested layers.'
  } else if (action === 'lock') { const locked = !chosen.some(n => n.model.locked); chosen.forEach(n => patch(n.id, { locked })) }
  else if (action === 'hide') editable.filter(n => !n.protected).forEach(n => patch(n.id, { visible: !n.model.visible }))
  else if (action === 'group' && editable.length > 1) { const groupId = crypto.randomUUID(); editable.forEach(n => patch(n.id, { groupId })) }
  else if (action === 'ungroup') editable.forEach(n => patch(n.id, { groupId: undefined }))
  else if (action === 'front' || action === 'back') {
    const siblings = allLayers.value.filter(n => n.parentId === chosen[0]?.parentId), selected = new Set(editable.map(n => n.id)), other = siblings.filter(n => !selected.has(n.id))
    const order = action === 'front' ? [...other, ...editable] : [...editable, ...other]
    order.forEach((n, index) => patch(n.id, { zIndex: index }))
  } else if (action === 'flow') editable.forEach(n => patch(n.id, { x: undefined, y: undefined, frameWidth: undefined, frameHeight: undefined, rotation: undefined }))
  history.end()
}
function command(action: string) {
  contextMenu.value = null
  if (unavailable.value) return
  canvas.value?.finishText()
  if (selectedIds.value.some(id => findQuoteLayer(draft.value, id)?.key) || action === 'paste' && nestedClipboard.value.length) { nestedCommand(action); return }
  const chosen = draft.value.sections.filter(s => selectedIds.value.includes(s.id)), editable = chosen.filter(s => !s.locked)
  const copyable = chosen.filter(s => !['items', 'totals'].includes(s.kind))
  if (action === 'copy' || action === 'cut') {
    nestedClipboard.value = []
    clipboard.value = JSON.parse(JSON.stringify(copyable))
    if (action === 'copy') return
  }
  history.begin()
  if (action === 'delete' || action === 'cut') {
    const ids = new Set(editable.filter(s => !['items', 'totals'].includes(s.kind)).map(s => s.id))
    draft.value.sections = draft.value.sections.filter(s => !ids.has(s.id)); selectedIds.value = selectedIds.value.filter(id => !ids.has(id))
  } else if (action === 'duplicate' || action === 'paste') {
    const source = action === 'paste' ? clipboard.value : copyable
    if (draft.value.sections.length + source.length > 30 || draft.value.sections.reduce((count, s) => count + (s.elements?.length || 0), source.reduce((count, s) => count + (s.elements?.length || 0), 0)) > 300) uploadError.value = 'A design can contain up to 30 sections and 300 nested layer edits. Remove a layer before duplicating or pasting.'
    else {
      const groups = new Map<string, string>(), copies: QuoteDesignSection[] = []
      source.forEach(section => {
        const copy: QuoteDesignSection = JSON.parse(JSON.stringify(section)); copy.id = crypto.randomUUID(); copy.locked = false
        const box = canvas.value?.boxes[section.id]
        if (section.groupId) { if (!groups.has(section.groupId)) groups.set(section.groupId, crypto.randomUUID()); copy.groupId = groups.get(section.groupId) }
        for (const element of copy.elements || []) if (element.groupId) { if (!groups.has(element.groupId)) groups.set(element.groupId, crypto.randomUUID()); element.groupId = groups.get(element.groupId) }
        if (box || copy.placement === 'absolute') {
          const next = constrainBox({ ...(box || { x: copy.x || 0, y: copy.y || 0, width: copy.frameWidth || 50, height: copy.frameHeight || 15 }), x: (box?.x ?? copy.x ?? 0) + 4, y: (box?.y ?? copy.y ?? 0) + 4 }, page.value.width, 5000)
          Object.assign(copy, { placement: 'absolute', x: next.x, y: next.y, frameWidth: next.width, flowHeight: undefined })
        }
        copies.push(copy)
      })
      draft.value.sections.push(...copies); selectIds(copies.map(s => s.id))
    }
  } else if (action === 'lock') {
    const locked = !chosen.some(s => s.locked); chosen.forEach(s => { s.locked = locked })
  } else if (action === 'hide') editable.filter(s => !['items', 'totals'].includes(s.kind)).forEach(s => { s.visible = !s.visible })
  else if (action === 'group' && editable.length > 1) { const id = crypto.randomUUID(); editable.forEach(s => { s.groupId = id }) }
  else if (action === 'ungroup') editable.forEach(s => { s.groupId = undefined })
  else if (action === 'front' || action === 'back') {
    // Normalize stack values rather than changing the document's flow order.
    const order = [...draft.value.sections].sort((a, b) => (a.zIndex ?? (a.placement === 'absolute' ? 1 : 0)) - (b.zIndex ?? (b.placement === 'absolute' ? 1 : 0)))
    const selected = new Set(editable.map(s => s.id)), other = order.filter(s => !selected.has(s.id)), moving = order.filter(s => selected.has(s.id))
    ;(action === 'front' ? [...other, ...moving] : [...moving, ...other]).forEach((s, i) => { s.zIndex = i })
  } else if (action === 'flow') editable.forEach(s => { s.placement = 'flow'; s.x = undefined; s.y = undefined; s.frameWidth = s.kind === 'shape' ? 60 : undefined; s.frameHeight = s.kind === 'shape' ? 25 : undefined; s.flowHeight = undefined; s.rotation = undefined })
  history.end()
}
function layerVisibility(id: string) { select(id); command('hide') }
function layerLock(id: string) { select(id); command('lock') }
watch(() => allLayers.value.map(s => s.id), ids => { selectedIds.value = selectedIds.value.filter(id => ids.includes(id)) })
let stopPan: (() => void) | undefined
const spaceDown = ref(false)
function pan(event: PointerEvent) {
  if (event.button !== 1 && tool.value !== 'hand' && !spaceDown.value) return
  if ((event.target as HTMLElement).closest('button,textarea,input,select')) return
  event.preventDefault(); event.stopPropagation(); stopPan?.()
  const viewport = canvasViewport.value!, left = viewport.scrollLeft, top = viewport.scrollTop
  viewport.setPointerCapture(event.pointerId)
  const move = (next: PointerEvent) => { viewport.scrollLeft = left - next.clientX + event.clientX; viewport.scrollTop = top - next.clientY + event.clientY }
  const stop = () => { viewport.removeEventListener('pointermove', move); viewport.removeEventListener('pointerup', stop); viewport.removeEventListener('pointercancel', stop); viewport.removeEventListener('lostpointercapture', stop); stopPan = undefined; if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId) }
  stopPan = stop; viewport.addEventListener('pointermove', move); viewport.addEventListener('pointerup', stop); viewport.addEventListener('pointercancel', stop); viewport.addEventListener('lostpointercapture', stop)
}
function wheel(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault(); zoom.value = Math.max(10, Math.min(300, zoom.value + (event.deltaY < 0 ? 10 : -10)))
}
function keyup(event: KeyboardEvent) { if (event.code === 'Space') spaceDown.value = false }
function blur() { spaceDown.value = false; stopPan?.() }
function openContext(event: MouseEvent) { contextMenu.value = { x: Math.max(8, Math.min(event.clientX, window.innerWidth - 210)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 350)) } }
onMounted(() => { showLayers.value = window.innerWidth > 1100; window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', blur) })
onBeforeUnmount(() => { stopPan?.(); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur) })
async function upload(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0], id = selectedId.value
  uploadError.value = ''
  if (!file) return
  uploading.value = true
  try {
    const image = await prepareDesignerImage(file)
    const node = findQuoteLayer(draft.value, id), section = node?.section
    if (node?.key && !props.busy && !node.locked) { history.begin(); setQuoteLayerBinding(draft.value, id, ''); patchQuoteLayer(draft.value, id, { image: image.data }); history.end(); return }
    if (section && !props.busy && !node?.locked) {
      setQuoteLayerBinding(draft.value, id, '')
      section.image = image.data
      const width = section.width / 100 * (section.placement === 'absolute' ? page.value.width : page.value.width - draft.value.padding * 2)
      section.imageHeight = Math.max(5, Math.min(100, page.value.height - (section.y || 0), width * image.height / image.width))
    }
  } catch (e: any) { uploadError.value = e.message }
  finally { input.value = ''; uploading.value = false }
}
function save() {
  if (props.busy || uploading.value) return
  uploadError.value = ''
  try { const value = normalizeQuoteDesign(draft.value); draft.value = value; history.commit(); emit('update:modelValue', value); emit('save') }
  catch (e: any) { uploadError.value = e.message }
}
function keydown(event: KeyboardEvent) {
  if (unavailable.value || event.isComposing || event.defaultPrevented) return
  const key = event.key.toLowerCase(), mod = event.ctrlKey || event.metaKey
  if (mod && key === 's') { event.preventDefault(); canvas.value?.finishText(); save(); return }
  if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]')) return
  if (mod) {
    const actions: Record<string, string> = { d: 'duplicate', c: 'copy', x: 'cut', v: 'paste', g: event.shiftKey ? 'ungroup' : 'group' }
    if (key === 'z' || key === 'y') { event.preventDefault(); canvas.value?.cancel(); key === 'y' || event.shiftKey ? history.redo() : history.undo(); return }
    if (key === 'a') { event.preventDefault(); selectIds(draft.value.sections.filter(s => s.visible && !s.locked).map(s => s.id)); return }
    if (event.shiftKey && key === 'l') { event.preventDefault(); command('lock'); return }
    if (actions[key]) { event.preventDefault(); command(actions[key]); return }
    if (key === ']' || key === '[') { event.preventDefault(); command(key === ']' ? 'front' : 'back'); return }
    if (key === '0' || key === '1') { event.preventDefault(); key === '0' ? fitCanvas() : zoom.value = 100; return }
  }
  if (key === 'escape') { canvas.value?.cancel(); contextMenu.value = null; shortcuts.value = false; selectedIds.value = []; event.stopPropagation(); event.preventDefault(); return }
  if (key === 'delete' || key === 'backspace') { event.preventDefault(); command('delete'); return }
  if (event.code === 'Space' && !(event.target as HTMLElement).closest('button')) { event.preventDefault(); spaceDown.value = true; return }
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key) && selectionBox.value) {
    event.preventDefault(); const step = event.shiftKey ? 5 : .5
    editSelection({ x: selectionBox.value.x + (key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0), y: selectionBox.value.y + (key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0) }); return
  }
  if (!mod && !event.altKey) {
    if (key === 'v') tool.value = 'select'
    if (key === 'h') tool.value = 'hand'
    if (key === 't') add('text')
    if (key === 'r') add('shape')
    if (key === 'l') add('line')
    if (key === '?') shortcuts.value = !shortcuts.value
  }
}
</script>
<template>
  <main class="document-design-page" :aria-label="`${documentTitle} designer`">
    <div class="quote-designer" :class="{ 'layers-collapsed': !showLayers }" @pointerdown="contextMenu = null">
      <div class="editor-toolstrip" role="toolbar" aria-label="Design tools">
        <div class="tool-group"><button type="button" title="Layers" aria-label="Toggle layers panel" :aria-pressed="showLayers" @click="showLayers = !showLayers"><Layers /></button><button type="button" title="Move (V)" aria-label="Move tool" :aria-pressed="tool === 'select'" @click="tool = 'select'"><MousePointer2 /></button><button type="button" title="Hand (H) · Hold Space to pan" aria-label="Hand tool" :aria-pressed="tool === 'hand'" @click="tool = 'hand'"><Hand /></button></div>
        <div class="tool-group"><button type="button" title="Text (T)" aria-label="Add text layer" :disabled="unavailable || draft.sections.length >= 30" @click="add('text')"><Type /></button><button type="button" title="Image" aria-label="Add image layer" :disabled="unavailable || draft.sections.length >= 30" @click="add('image')"><ImageIcon /></button><button type="button" title="Rectangle / ellipse (R)" aria-label="Add shape layer" :disabled="unavailable || draft.sections.length >= 30" @click="add('shape')"><Square /></button><button type="button" title="Divider (L)" aria-label="Add divider layer" :disabled="unavailable || draft.sections.length >= 30" @click="add('line')"><Minus /></button></div>
        <div class="tool-group"><button v-for="action in alignActions" :key="action.value" type="button" :title="action.label" :aria-label="action.label" :disabled="!selectedIds.length || selectionLocked || unavailable" @click="align(action.value)"><component :is="action.icon" /></button><button type="button" title="Distribute horizontal spacing" aria-label="Distribute horizontal spacing" :disabled="selectedIds.length < 3 || selectionLocked || unavailable" @click="distribute('x')"><Columns3 /></button><button type="button" title="Distribute vertical spacing" aria-label="Distribute vertical spacing" :disabled="selectedIds.length < 3 || selectionLocked || unavailable" @click="distribute('y')"><Rows3 /></button></div>
        <div class="tool-group"><button type="button" title="Duplicate (Ctrl/⌘ D)" aria-label="Duplicate selection" :disabled="!selectedIds.length || unavailable" @click="duplicate"><Copy /></button><button type="button" title="Group (Ctrl/⌘ G)" aria-label="Group selection" :disabled="selectedIds.length < 2 || selectionLocked || unavailable" @click="command('group')"><Group /></button><button type="button" title="Delete" aria-label="Delete selection" :disabled="!selectedIds.length || selectionLocked || unavailable" @click="remove"><Trash2 /></button></div>
        <div class="tool-group tool-options"><button type="button" title="Snap to edges and centers · Alt to bypass" aria-label="Snap to elements" :aria-pressed="snapping" @click="snapping = !snapping"><Magnet /></button><button type="button" title="5 mm grid" aria-label="Show canvas grid" :aria-pressed="grid" @click="grid = !grid"><Grid2X2 /></button><button type="button" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" :aria-expanded="shortcuts" @click="shortcuts = !shortcuts"><Keyboard /></button></div>
      </div>
      <aside v-show="showLayers" class="layers-panel">
        <div class="layers-heading"><h3>Layers</h3><span>{{ draft.sections.length }} / 30</span></div>
        <p class="layers-hint">Double-click to select inside a frame</p>
        <ol class="section-list" aria-label="Quote design sections"><LayerTree v-for="(node, index) in tree" :key="node.id" :node="node" :index="index" :count="tree.length" :selected-ids="selectedIds" :disabled="unavailable" @select="select" @visibility="layerVisibility" @lock="layerLock" @move="move" @drag="draggedId = $event" @drop="drop" /></ol>
        <div class="layers-footer"><span>Drag custom layers into frames</span><span>mm</span></div>
      </aside>
      <div class="design-canvas-panel"><div class="canvas-toolbar"><CanvasToolbar :zoom="zoom" :label="`${page.value} · ${selectedIds.length > 1 ? selectedIds.length + ' layers selected' : 'Design canvas'}`" @zoom="zoom = $event" @fit="fitCanvas" /></div>
        <div ref="canvasViewport" class="canvas-scroll" :class="{ 'panning-canvas': spaceDown || tool === 'hand' }" @pointerdown.capture="pan" @wheel="wheel"><div class="scaled-paper" :style="{ zoom: zoom / 100, '--designer-zoom': zoom / 100 }"><div class="ruler-x" aria-hidden="true"><span v-for="tick in Math.floor(page.width / 20) + 1" :key="tick" :style="{ left: `${(tick - 1) * 20}mm` }">{{ (tick - 1) * 20 }}</span></div><div class="ruler-y" aria-hidden="true"><span v-for="tick in Math.floor(page.height / 20) + 1" :key="tick" :style="{ top: `${(tick - 1) * 20}mm` }">{{ (tick - 1) * 20 }}</span></div><QuoteCanvas ref="canvas" :quote="sample" :company="company" :design="draft" :document-title="isSalesOrder ? 'SALES ORDER' : undefined" :selected-ids="selectedIds" :disabled="unavailable" :snap="snapping" :grid="grid" :tool="spaceDown ? 'hand' : tool" @update:selected-ids="selectIds" @transform="transform" @patch="patch" @restore="(id, snapshot) => restoreQuoteLayer(draft, id, snapshot)" @resize-columns="resizeColumns" @gesture="value => value ? history.begin() : history.end()" @context="openContext" /></div></div>
        <div class="canvas-status"><span>{{ selectionLocked ? 'Selection locked · Unlock in Layers to edit' : 'Drag to move · Shift to constrain · Alt to bypass snapping' }}</span><button type="button" @click="shortcuts = !shortcuts">Shortcuts</button></div>
        <div v-if="shortcuts" class="shortcut-panel" role="region" aria-label="Designer keyboard shortcuts"><div class="layers-heading"><h3>Keyboard shortcuts</h3><button type="button" aria-label="Close keyboard shortcuts" @click="shortcuts = false">×</button></div><dl><dt>V / H</dt><dd>Move / hand tool</dd><dt>T / R / L</dt><dd>Text / shape / divider</dd><dt>Shift-click / drag empty area</dt><dd>Multiple selection</dd><dt>Arrow / Shift + Arrow</dt><dd>Move 0.5 / 5 mm</dd><dt>Shift + resize</dt><dd>Keep proportions</dd><dt>Alt + resize</dt><dd>Resize from center</dd><dt>Space + drag / middle drag</dt><dd>Pan canvas</dd><dt>Ctrl/⌘ + wheel</dt><dd>Zoom canvas</dd><dt>Ctrl/⌘ + A / D</dt><dd>Select all / duplicate</dd><dt>Ctrl/⌘ + C / X / V</dt><dd>Copy / cut / paste layers</dd><dt>Ctrl/⌘ + G / Shift + G</dt><dd>Group / ungroup</dd><dt>Ctrl/⌘ + Shift + L</dt><dd>Lock / unlock</dd><dt>Ctrl/⌘ + [ / ]</dt><dd>Send to back / bring to front</dd><dt>Ctrl/⌘ + Z / Shift + Z</dt><dd>Undo / redo</dd><dt>Ctrl/⌘ + 0 / 1</dt><dd>Fit width / 100%</dd><dt>Ctrl/⌘ + S</dt><dd>Save design</dd><dt>Double-click text</dt><dd>Edit on canvas · Esc cancels</dd></dl></div>
      </div>
      <aside ref="propertiesPanel" class="design-properties">
        <div class="inspector-header">
          <div class="inspector-actions"><UButton color="gray" :disabled="unavailable" :aria-label="`Back from ${isSalesOrder ? 'sales order' : 'quote'} designer`" @click="emit('close')">Back</UButton><UButton :loading="unavailable" @click="canvas?.finishText(); save()">Save design</UButton></div>
          <p class="inspector-save-state" role="status">{{ dirty ? 'Unsaved changes' : 'All changes saved' }}</p>
          <div class="inspector-mode"><button type="button" :aria-pressed="tab !== 'setup'" @click="tab = 'design'">Design</button><button type="button" :aria-pressed="tab === 'setup'" @click="tab = 'setup'">Page setup</button></div>
        </div>
        <p v-if="error || uploadError" role="alert" class="design-error">{{ uploadError || error }}</p>
        <fieldset :disabled="busy || uploading">
          <div v-if="tab === 'setup'" class="properties-fields page-settings">
            <DesignerTools :templates="templateOptions" :papers="sheetSizes.map(p => ({ value: p.value, label: p.label }))" :paper="draft.paperSize || 'A4'" :disabled="busy || uploading" :limit-reached="draft.sections.length >= 30" @template="applyTemplate" @paper="setPaper" @section="addCustom" /><h3>Page style</h3><label>Accent colour<input v-model="draft.accentColor" type="color" aria-label="Quote accent colour" /></label>
            <label>Layout<select :value="draft.layout || 'standard'" aria-label="Quote layout style" @change="draft.layout = ($event.target as HTMLSelectElement).value === 'professional' ? 'professional' : 'standard'"><option value="standard">Standard</option><option value="professional">Professional proposal</option></select></label>
            <label><input v-model="draft.showItemImages" type="checkbox" aria-label="Show quote product images" /> Show product photos in material descriptions</label>
            <p v-if="draft.layout === 'professional'">Company logo, name, address and contact details use your current company settings. Add or update them there to refresh this design.</p>
            <label>Font<select v-model="draft.fontFamily" aria-label="Quote design font"><option>Arial</option><option>Georgia</option><option>Verdana</option></select></label>
            <label>Text size (px)<input v-model.number="draft.fontSize" type="number" min="9" max="18" aria-label="Quote design text size" /></label>
            <label>Page margin (mm)<input v-model.number="draft.padding" type="number" min="6" max="25" aria-label="Quote page margin" /></label>
            <p>This company uses one {{ isSalesOrder ? 'sales order' : 'quote' }} design. Saved changes apply to printed documents.</p>
            <button type="button" class="design-button" @click="draft = defaultQuoteDesign(); if (isSalesOrder) draft.sections.at(-1)!.text = 'Thank you for your order.'; selectedId = draft.sections[0].id">Reset design</button>
          </div>
          <div v-else class="properties-fields"><div class="quick-insert" aria-label="Add content"><button type="button" class="design-button" :disabled="unavailable || selectionLocked" @click="quickAdd('text')">+ Text</button><button type="button" class="design-button" :disabled="unavailable || selectionLocked" @click="quickAdd('field')">+ Linked data</button><button type="button" class="design-button" :disabled="unavailable || selectionLocked" @click="quickAdd('image')">+ Image</button></div>
            <ElementProperties :rule-fields="ruleFields" :rule-resolver="ruleResolver" :rules-protected="!!selectedNode && quoteRulesProtected(selectedNode.section, selectedNode.key)" v-if="inspectorModel && selectedNode && selectedIds.length === 1" :section="inspectorModel" :box="inspectorBox" :nested="!!selectedNode.key" :kind="selectedNode.kind" :parent-name="allLayers.find(n => n.id === selectedNode?.parentId)?.name || 'Page'" :binding="selectedNode.binding" :text-value="inspectorText" :data-preview="dataPreview" :row-data="rowData" :binding-protected="!!selectedNode.protected && !!selectedNode.binding" :sales-order="isSalesOrder" @binding="changeBinding" @upload="upload" :inherited-locked="selectionLocked && !selected?.locked" :page-width="page.width" :disabled="unavailable" @patch="patch(selectedId, $event)" @frame="editFrame" @command="command" @align="align" />
            <section v-if="selectedNode?.kind === 'frame' && selectedIds.length === 1" class="child-insert"><h3>Add inside this frame</h3><div class="add-section"><button v-for="kind in (['text','image','shape','frame'] as const)" :key="kind" type="button" class="design-button" :disabled="selectionLocked || unavailable" :aria-label="`Add ${kind} inside selection`" @click="addInside(kind)"><Type v-if="kind === 'text'" /><ImageIcon v-else-if="kind === 'image'" /><Square v-else-if="kind === 'shape'" /><Layers v-else />{{ kind }}</button></div></section>
            <p v-if="selectedNode?.key && selectedNode.section.kind === 'items'" class="row-template-note">Changes to this layer apply to each product row.</p>
            <section v-if="selectedIds.length > 1" class="multi-selection"><h3>{{ selectedIds.length }} layers selected</h3><p>Move and resize this selection together. Alignment uses the selection bounds.</p><div class="add-section"><button type="button" class="design-button" :disabled="selectionLocked" @click="command('group')">Group selection</button><button type="button" class="design-button" :disabled="selectionLocked" @click="command('ungroup')">Ungroup</button><button type="button" class="design-button" @click="command('lock')">{{ selectionLocked ? 'Unlock' : 'Lock' }}</button></div></section>
            <p v-if="!selectedIds.length" class="empty-selection">Select a layer on the page or in Layers to edit it. Drag an empty area to select several.</p>
            <details class="inspector-insert"><summary>Insert new section</summary><DesignerTools :templates="templateOptions" :papers="sheetSizes.map(p => ({ value: p.value, label: p.label }))" :paper="draft.paperSize || 'A4'" :disabled="busy || uploading" :limit-reached="draft.sections.length >= 30" @template="applyTemplate" @paper="setPaper" @section="addCustom" /><div class="add-section"><button type="button" class="design-button" :disabled="draft.sections.length >= 30" @click="add('image', 'start')">Add header image</button><button type="button" class="design-button" :disabled="draft.sections.length >= 30" @click="add('image', 'end')">Add footer image</button><button v-for="kind in (['text', 'field', 'image', 'line'] as const)" :key="kind" type="button" class="design-button" :disabled="draft.sections.length >= 30" @click="add(kind)">Add {{ quoteSectionLabels[kind].toLowerCase() }}</button></div></details>
            <fieldset v-if="selected && !selectedNode?.key && selectedIds.length === 1 && !['header','customer','totals','line','shape'].includes(selected.kind)" :disabled="selected.locked" class="section-content-properties"><h3 ref="sectionProperties">{{ selected.kind === 'items' ? 'Table' : 'Content' }}</h3>
              <label><input v-model="selected.visible" type="checkbox" :disabled="['items', 'totals'].includes(selected.kind)" /> Show section</label>
              <TextProperties text-label="Quote design text" :hide-text="true" v-if="selected.kind === 'text' && !selectedNode?.binding" v-model:text="selected.text" v-model:heading="selected.heading" v-model:border="selected.border" />
              <template v-if="selected.kind === 'text'"><label>Text position<select :value="selected.column || ''" aria-label="Quote text column" @change="setColumn(($event.target as HTMLSelectElement).value)"><option value="">Full width</option><option value="left">Left column</option><option value="right">Right column</option></select></label><p>Place a left-column text section immediately before a right-column text section to show them side by side.</p></template>
              <template v-if="selected.kind === 'field'"><label>Field presentation<select :value="selected.role || ''" aria-label="Quote field presentation" @change="setFieldRole(($event.target as HTMLSelectElement).value)"><option value="">Plain value</option><option value="signature">Signature and sign-off</option><option value="contact">Customer-care footer</option></select></label><label v-if="selected.role">Label<input v-model="selected.text" maxlength="100" aria-label="Quote live field label" /></label></template>
              <label v-if="['customer', 'notes', 'terms', 'paymentTerms', 'deliveryEstimate'].includes(selected.kind)">Section heading<input v-model="selected.text" maxlength="100" aria-label="Quote section heading" /></label>
              <template v-if="selected.kind === 'image'"><label>Image placement<select :value="selected.placement || 'flow'" aria-label="Quote image placement" @change="setPlacement(($event.target as HTMLSelectElement).value)"><option value="flow">In section order</option><option value="absolute">Anywhere on the page (drag to position)</option></select></label><div v-if="selected.placement === 'absolute'" class="two-fields"><label>From left (mm)<input v-model.number="selected.x" type="number" min="0" :max="page.width" step="0.5" aria-label="Quote image left" /></label><label>From top (mm)<input v-model.number="selected.y" type="number" min="0" :max="page.height" step="0.5" aria-label="Quote image top" /></label></div><label>Image description<input v-model="selected.text" maxlength="5000" aria-label="Quote image description" /></label><label v-if="!selected.frameWidth">Width (%)<input v-model.number="selected.width" type="number" min="10" max="100" aria-label="Quote image width" /></label><label v-if="!selected.frameWidth">Height (mm)<input v-model.number="selected.imageHeight" type="number" min="5" max="100" aria-label="Quote image height" /></label><button v-if="selected.image" type="button" class="design-button" @click="selected.image = ''">Remove image</button></template>
              <label>Alignment<select v-model="selected.align" aria-label="Quote section alignment"><option>left</option><option>center</option><option>right</option></select></label>
              <template v-if="['text', 'field'].includes(selected.kind)"><label>Text size (px)<input v-model.number="selected.fontSize" type="number" min="8" max="120" aria-label="Quote section font size" /></label><label><input v-model="selected.bold" type="checkbox" aria-label="Quote section bold" /> Bold</label></template>
              <div class="two-fields"><label>Space above (mm)<input v-model.number="selected.gapBefore" type="number" min="0" max="80" aria-label="Quote section space above" /></label><label>Space below (mm)<input v-model.number="selected.gapAfter" type="number" min="0" max="80" aria-label="Quote section space below" /></label></div>
              <template v-if="selected.kind === 'items'"><h3 ref="tableProperties">Table columns</h3><label v-if="!selected.frameWidth">Table width (%)<input v-model.number="selected.width" type="number" min="10" max="100" aria-label="Quote table width" /></label><label><input v-model="draft.tableBorders" type="checkbox" aria-label="Quote table borders" /> Cell borders</label><label><input v-model="draft.showItemImages" type="checkbox" aria-label="Show table product images" /> Show product images</label><TableProperties v-model="draft.tableStyle" :images="true" :defaults="{ cellPadding: draft.tablePadding, fontSize: draft.layout === 'professional' ? 9 : draft.fontSize * .75, headerFontSize: draft.layout === 'professional' ? 7.5 : draft.fontSize * .75 * .85, borderWidth: .2 }" /><p>Drag a divider in the table header or use each column’s width slider.</p><div v-for="(column, index) in draft.columns" :key="column.field" class="column-properties"><label><input v-model="column.visible" type="checkbox" :disabled="['name', 'amount'].includes(column.field)" /> {{ column.field }}</label><label>Heading<textarea v-model="column.label" maxlength="60" rows="2" :aria-label="`Quote ${column.field} column heading`" /></label><div class="two-fields"><ColumnWidth :model-value="columnPercentage(draft.columns.filter(c => c.visible), draft.columns.filter(c => c.visible).findIndex(c => c.field === column.field))" :minimum="3" :maximum="100 - 3 * (draft.columns.filter(c => c.visible).length - 1)" :disabled="!column.visible" :label="`Quote ${column.field} column width`" @update:model-value="setColumnWidth(column.field, $event)" /><label>Alignment<select v-model="column.align"><option>left</option><option>center</option><option>right</option></select></label></div><button type="button" class="design-button" :disabled="index === 0" @click="draft.columns.splice(index - 1, 0, draft.columns.splice(index, 1)[0])">Move column left</button></div></template>
              <div v-if="!['items', 'totals'].includes(selected.kind)" class="add-section"><button type="button" class="design-button" :disabled="draft.sections.length >= 30" @click="duplicate">Duplicate section</button><button type="button" class="design-button" @click="remove">Delete section</button></div>
            </fieldset>
          </div>
        </fieldset>
      </aside>
      <div v-if="contextMenu" class="canvas-context-menu" role="menu" aria-label="Layer actions" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @pointerdown.stop @keydown.esc.stop.prevent="contextMenu = null">
        <button type="button" role="menuitem" :disabled="!selectedIds.length" @click="command('copy')">Copy <kbd>Ctrl/⌘ C</kbd></button><button type="button" role="menuitem" :disabled="!selectedIds.length || selectionLocked" @click="command('cut')">Cut <kbd>Ctrl/⌘ X</kbd></button><button type="button" role="menuitem" :disabled="!clipboard.length && !nestedClipboard.length" @click="command('paste')">Paste <kbd>Ctrl/⌘ V</kbd></button><button type="button" role="menuitem" :disabled="!selectedIds.length" @click="duplicate">Duplicate <kbd>Ctrl/⌘ D</kbd></button>
        <hr /><button type="button" role="menuitem" :disabled="selectedIds.length < 2 || selectionLocked" @click="command('group')">Group selection</button><button type="button" role="menuitem" :disabled="!selected?.groupId || selectionLocked" @click="command('ungroup')">Ungroup</button><button type="button" role="menuitem" :disabled="!selectedIds.length" @click="command('lock')">{{ selectionLocked ? 'Unlock' : 'Lock' }} selection</button><button type="button" role="menuitem" :disabled="!selectedIds.length || selectionLocked" @click="command('hide')">Toggle visibility</button><hr />
        <button type="button" role="menuitem" :disabled="!selectedIds.length || selectionLocked" @click="command('front')">Bring to front</button><button type="button" role="menuitem" :disabled="!selectedIds.length || selectionLocked" @click="command('back')">Send to back</button><button type="button" role="menuitem" :disabled="!selectedIds.length || selectionLocked" @click="remove">Delete <kbd>⌫</kbd></button>
      </div>
    </div>
  </main>
</template>
<style scoped src="../DocumentDesigner/workspace.css"></style>
