<script setup lang="ts">
import { nextTick } from 'vue'
import { useDocumentSections } from '~/utils/document-designer-sections'
import TableProperties from '~/components/DocumentDesigner/TableProperties.vue'
import ColumnWidth from '~/components/DocumentDesigner/ColumnWidth.vue'
import { columnPercentage, setColumnPercentage } from '~/utils/document-table'
import CanvasToolbar from '~/components/DocumentDesigner/CanvasToolbar.vue'
import DesignerTools from '~/components/DocumentDesigner/Tools.vue'
import TextProperties from '~/components/DocumentDesigner/TextProperties.vue'
import { sheetSizes, sheetDimensions, type CustomDocumentSection } from '~/utils/document-designer'
import DesignerWorkspace from '~/components/PrinterDesignerWorkspace.vue'
import QuoteDocument from '~/components/Quotes/Document.vue'
import { prepareDesignerImage } from '~/utils/designer-image.client'
import { useDesignerHistory } from '~/utils/designer-history'
import { defaultQuoteDesign, quoteDesignTemplate, newQuoteDesignSection, normalizeQuoteDesign, quoteDesignFields, quoteSectionLabels, type QuoteDesign, type QuoteSectionKind } from '~/utils/quote-design'
const props = defineProps<{ modelValue: QuoteDesign; company: any; busy: boolean; error?: string; savedDesign: string; documentKind?: 'quote' | 'sales-order' }>()
const emit = defineEmits<{ 'update:modelValue': [design: QuoteDesign]; close: []; save: [] }>()
const isSalesOrder = props.documentKind === 'sales-order'
const documentTitle = isSalesOrder ? 'Sales order' : 'Quote'
const draft = ref<QuoteDesign>(JSON.parse(JSON.stringify(props.modelValue)))
const history = useDesignerHistory(draft)
const selectedId = ref(draft.value.sections[0].id), tab = ref('content'), zoom = ref(75), draggedId = ref(''), uploadError = ref('')
const selected = computed(() => draft.value.sections.find(s => s.id === selectedId.value))
const dirty = computed(() => JSON.stringify(draft.value) !== props.savedDesign)
const canvasViewport = ref<HTMLElement | null>(null)
const propertiesPanel = ref<HTMLElement | null>(null), sectionProperties = ref<HTMLElement | null>(null), tableProperties = ref<HTMLElement | null>(null)
function fitCanvas() { if (canvasViewport.value) zoom.value = Math.max(10, Math.min(200, Math.floor((canvasViewport.value.clientWidth - 48) / (page.value.width * 96 / 25.4) * 100))) }
const uploading = ref(false)
const page = computed(() => sheetDimensions(draft.value.paperSize))
const templateOptions = [{ value: 'standard', label: 'Standard business' }, { value: 'professional', label: 'Professional proposal' }, { value: 'compact', label: 'Compact' }]
function applyTemplate(name: string) {
  if (props.busy || uploading.value) return
  history.begin()
  const paperSize = draft.value.paperSize
  draft.value = quoteDesignTemplate(name); draft.value.paperSize = paperSize
  if (isSalesOrder) draft.value.sections.at(-1)!.text = 'Thank you for your order.'
  selectedId.value = draft.value.sections[0].id
  history.end()
}
function setPaper(size: string) {
  if (props.busy || uploading.value) return
  history.begin()
  draft.value.paperSize = sheetDimensions(size).value
  const paper = page.value
  for (const section of draft.value.sections.filter(s => s.placement === 'absolute')) {
    section.x = Math.min(section.x || 0, paper.width * (1 - section.width / 100))
    section.y = Math.min(section.y || 0, paper.height - section.imageHeight)
  }
  history.end()
}
function addCustom(section: CustomDocumentSection) {
  if (props.busy || uploading.value || draft.value.sections.length >= 30) return
  history.begin(); add('text'); Object.assign(selected.value!, section); history.end()
}

const sample = { quoteNumber: isSalesOrder ? 'SO-00001' : 'QT-00001', quoteDate: '2026-10-29', expiryDate: '2026-11-29', clientName: 'Sample Customer', clientPhone: '9876543210', referenceNumber: 'Project reference', salesperson: 'Alex', subject: isSalesOrder ? 'Your sales order' : 'Your quotation', notes: isSalesOrder ? 'Thank you for your order.' : 'Thank you for your enquiry.', termsAndConditions: 'Prices are valid until the date shown.', paymentTerms: 'Due within 30 days', deliveryEstimate: 'Within 7 working days', discount: 0, discountType: 'amount', adjustment: 0, subTotal: 2360, total: 2360, items: [{ id: 'sample', name: 'Sample product', description: 'Product description', size: 'M', quantity: 2, unit: 'pcs', rate: 1180, tax: 18, discount: 0, amount: 2360 }] }
watch(draft, value => emit('update:modelValue', JSON.parse(JSON.stringify(value))), { deep: true })
const select = (id: string) => {
  selectedId.value = id; tab.value = 'content'; uploadError.value = ''
  nextTick(() => {
    const target = selected.value?.kind === 'items' ? tableProperties.value : sectionProperties.value, panel = propertiesPanel.value
    if (selectedId.value === id && target && panel) panel.scrollTop += target.getBoundingClientRect().top - panel.getBoundingClientRect().top - 12
  })
}
function add(kind: QuoteSectionKind, position = 'after') {
  if (props.busy || draft.value.sections.length >= 30) return
  const section = newQuoteDesignSection(kind, crypto.randomUUID())
  const index = position === 'start' ? 0 : position === 'end' ? draft.value.sections.length : draft.value.sections.findIndex(s => s.id === selectedId.value) + 1
  if (kind === 'image' && position === 'after') Object.assign(section, { placement: 'absolute', x: 10, y: 10, width: 25 })
  draft.value.sections.splice(index, 0, section); select(section.id)
}
function setColumnWidth(field: string, percent: number) {
  const columns = draft.value.columns.filter(column => column.visible)
  setColumnPercentage(columns, columns.findIndex(column => column.field === field), percent, 3)
}
function resizeColumns(columns: { field: string; width: number }[]) {
  if (props.busy || uploading.value) return
  for (const column of columns) { const target = draft.value.columns.find(c => c.field === column.field); if (target) target.width = column.width }
}
function moveImage(id: string, x: number, y: number) {
  if (props.busy || uploading.value) return
  const section = draft.value.sections.find(s => s.id === id)
  if (section) Object.assign(section, { x, y })
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
function drop(id: string) { sections.drop(draggedId.value, id); draggedId.value = '' }
const remove = sections.remove
function duplicate() { sections.duplicate(); tab.value = 'content' }
async function upload(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0], id = selectedId.value
  uploadError.value = ''
  if (!file) return
  uploading.value = true
  try {
    const image = await prepareDesignerImage(file)
    const section = draft.value.sections.find(s => s.id === id)
    if (section && !props.busy) {
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
  try { const value = normalizeQuoteDesign(draft.value); history.commit(); emit('update:modelValue', value); emit('save') }
  catch (e: any) { uploadError.value = e.message }
}
function keydown(event: KeyboardEvent) {
  if (props.busy || uploading.value || (event.target as HTMLElement)?.closest('input,textarea,select') || (!event.ctrlKey && !event.metaKey)) return
  if (event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? history.redo() : history.undo() }
  if (event.key.toLowerCase() === 'y') { event.preventDefault(); history.redo() }
}
</script>
<template>
  <DesignerWorkspace fullscreen open :kind="isSalesOrder ? 'sales-order' : 'quote'" :title="`${documentTitle} design`" :busy="busy || uploading" :dirty="dirty" @close="emit('close')">
    <template #actions><UButton color="gray" :disabled="busy || uploading || !history.canUndo.value" @click="history.undo">Undo</UButton><UButton color="gray" :disabled="busy || uploading || !history.canRedo.value" @click="history.redo">Redo</UButton><UButton :loading="busy || uploading" @click="save">Save design</UButton></template>
    <div class="quote-designer" @keydown="keydown">
      <div class="design-canvas-panel"><div class="canvas-toolbar"><CanvasToolbar :zoom="zoom" :label="`${page.value} · Live preview`" @zoom="zoom = $event" @fit="fitCanvas" /></div>
        <div ref="canvasViewport" class="canvas-scroll"><div class="scaled-paper" :style="{ zoom: zoom / 100 }"><QuoteDocument :quote="sample" :company="company" :design="draft" :document-title="isSalesOrder ? 'SALES ORDER' : undefined" editable :selected-id="selectedId" @select="select" @resize-columns="resizeColumns" @move="moveImage" @gesture="value => value ? history.begin() : history.end()" /></div></div>
      </div>
      <aside ref="propertiesPanel" class="design-properties"><p v-if="error || uploadError" role="alert" class="design-error">{{ uploadError || error }}</p>
        <nav class="design-tabs"><button type="button" :aria-pressed="tab === 'setup'" @click="tab = 'setup'">Page setup</button><button type="button" :aria-pressed="tab === 'content'" @click="tab = 'content'">Content</button></nav>
        <fieldset :disabled="busy || uploading">
          <div v-if="tab === 'setup'" class="properties-fields">
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
          <div v-else class="properties-fields">
            <DesignerTools :templates="templateOptions" :papers="sheetSizes.map(p => ({ value: p.value, label: p.label }))" :paper="draft.paperSize || 'A4'" :disabled="busy || uploading" :limit-reached="draft.sections.length >= 30" @template="applyTemplate" @paper="setPaper" @section="addCustom" /><div class="add-section"><button type="button" class="design-button" :disabled="draft.sections.length >= 30" @click="add('image', 'start')">Add header image</button><button type="button" class="design-button" :disabled="draft.sections.length >= 30" @click="add('image', 'end')">Add footer image</button><button v-for="kind in (['text', 'field', 'image', 'line'] as const)" :key="kind" type="button" class="design-button" :disabled="draft.sections.length >= 30" @click="add(kind)">Add {{ quoteSectionLabels[kind].toLowerCase() }}</button></div>
            <h3>Sections</h3><ol class="section-list" aria-label="Quote design sections"><li v-for="(section, index) in draft.sections" :key="section.id" :draggable="!busy" @dragstart="draggedId = section.id" @dragover.prevent @drop.prevent="drop(section.id)"><button type="button" :aria-pressed="section.id === selectedId" :aria-label="`Select quote section ${section.id}`" @click="select(section.id)"><span>⋮⋮ {{ section.kind === 'text' ? section.text.slice(0, 24) || 'Text' : quoteSectionLabels[section.kind] }}{{ section.visible ? '' : ' (hidden)' }}</span></button><button type="button" :disabled="index === 0" :aria-label="`Move section ${section.id} up`" @click="move(section.id, -1)">↑</button><button type="button" :disabled="index === draft.sections.length - 1" :aria-label="`Move section ${section.id} down`" @click="move(section.id, 1)">↓</button></li></ol>
            <template v-if="selected"><h3 ref="sectionProperties">{{ quoteSectionLabels[selected.kind] }} properties</h3>
              <label><input v-model="selected.visible" type="checkbox" :disabled="['items', 'totals'].includes(selected.kind)" /> Show section</label>
              <TextProperties text-label="Quote design text" v-if="selected.kind === 'text'" v-model:text="selected.text" v-model:heading="selected.heading" v-model:border="selected.border" />
              <template v-if="selected.kind === 'text'"><label>Text position<select :value="selected.column || ''" aria-label="Quote text column" @change="setColumn(($event.target as HTMLSelectElement).value)"><option value="">Full width</option><option value="left">Left column</option><option value="right">Right column</option></select></label><p>Place a left-column text section immediately before a right-column text section to show them side by side.</p></template>
              <label v-if="selected.kind === 'field'">Live field<select v-model="selected.field" aria-label="Quote design live field"><option value="">Choose a field</option><option v-for="[key, label] in quoteDesignFields" :key="key" :value="key">{{ isSalesOrder ? label.replace('Quote', 'Order').replace('Valid until', 'Expected shipment date') : label }}</option></select></label>
              <template v-if="selected.kind === 'field'"><label>Field presentation<select :value="selected.role || ''" aria-label="Quote field presentation" @change="setFieldRole(($event.target as HTMLSelectElement).value)"><option value="">Plain value</option><option value="signature">Signature and sign-off</option><option value="contact">Customer-care footer</option></select></label><label v-if="selected.role">Label<input v-model="selected.text" maxlength="100" aria-label="Quote live field label" /></label></template>
              <label v-if="['customer', 'notes', 'terms', 'paymentTerms', 'deliveryEstimate'].includes(selected.kind)">Section heading<input v-model="selected.text" maxlength="100" aria-label="Quote section heading" /></label>
              <template v-if="selected.kind === 'image'"><label>PNG, JPEG or WebP (up to 10 MB)<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload quote design image" @change="upload" /></label><label>Image placement<select :value="selected.placement || 'flow'" aria-label="Quote image placement" @change="setPlacement(($event.target as HTMLSelectElement).value)"><option value="flow">In section order</option><option value="absolute">Anywhere on the page (drag to position)</option></select></label><div v-if="selected.placement === 'absolute'" class="two-fields"><label>From left (mm)<input v-model.number="selected.x" type="number" min="0" :max="page.width" step="0.5" aria-label="Quote image left" /></label><label>From top (mm)<input v-model.number="selected.y" type="number" min="0" :max="page.height" step="0.5" aria-label="Quote image top" /></label></div><label>Image description<input v-model="selected.text" maxlength="5000" aria-label="Quote image description" /></label><label>Width (%)<input v-model.number="selected.width" type="number" min="10" max="100" aria-label="Quote image width" /></label><label>Height (mm)<input v-model.number="selected.imageHeight" type="number" min="5" max="100" aria-label="Quote image height" /></label><button v-if="selected.image" type="button" class="design-button" @click="selected.image = ''">Remove image</button></template>
              <label>Alignment<select v-model="selected.align" aria-label="Quote section alignment"><option>left</option><option>center</option><option>right</option></select></label>
              <template v-if="['text', 'field'].includes(selected.kind)"><label>Text size (px)<input v-model.number="selected.fontSize" type="number" min="8" max="40" aria-label="Quote section font size" /></label><label><input v-model="selected.bold" type="checkbox" aria-label="Quote section bold" /> Bold</label></template>
              <div class="two-fields"><label>Space above (mm)<input v-model.number="selected.gapBefore" type="number" min="0" max="80" aria-label="Quote section space above" /></label><label>Space below (mm)<input v-model.number="selected.gapAfter" type="number" min="0" max="80" aria-label="Quote section space below" /></label></div>
              <template v-if="selected.kind === 'items'"><h3 ref="tableProperties">Table columns</h3><label>Table width (%)<input v-model.number="selected.width" type="number" min="10" max="100" aria-label="Quote table width" /></label><label><input v-model="draft.tableBorders" type="checkbox" aria-label="Quote table borders" /> Cell borders</label><label><input v-model="draft.showItemImages" type="checkbox" aria-label="Show table product images" /> Show product images</label><TableProperties v-model="draft.tableStyle" :images="true" :defaults="{ cellPadding: draft.tablePadding, fontSize: draft.layout === 'professional' ? 9 : draft.fontSize * .75, headerFontSize: draft.layout === 'professional' ? 7.5 : draft.fontSize * .75 * .85, borderWidth: .2 }" /><p>Drag a divider in the table header or use each column’s width slider.</p><div v-for="(column, index) in draft.columns" :key="column.field" class="column-properties"><label><input v-model="column.visible" type="checkbox" :disabled="['name', 'amount'].includes(column.field)" /> {{ column.field }}</label><label>Heading<textarea v-model="column.label" maxlength="60" rows="2" :aria-label="`Quote ${column.field} column heading`" /></label><div class="two-fields"><ColumnWidth :model-value="columnPercentage(draft.columns.filter(c => c.visible), draft.columns.filter(c => c.visible).findIndex(c => c.field === column.field))" :minimum="3" :maximum="100 - 3 * (draft.columns.filter(c => c.visible).length - 1)" :disabled="!column.visible" :label="`Quote ${column.field} column width`" @update:model-value="setColumnWidth(column.field, $event)" /><label>Alignment<select v-model="column.align"><option>left</option><option>center</option><option>right</option></select></label></div><button type="button" class="design-button" :disabled="index === 0" @click="draft.columns.splice(index - 1, 0, draft.columns.splice(index, 1)[0])">Move column left</button></div></template>
              <div v-if="!['items', 'totals'].includes(selected.kind)" class="add-section"><button type="button" class="design-button" :disabled="draft.sections.length >= 30" @click="duplicate">Duplicate section</button><button type="button" class="design-button" @click="remove">Delete section</button></div>
            </template>
          </div>
        </fieldset>
      </aside>
    </div>
  </DesignerWorkspace>
</template>
<style scoped>
.quote-designer { height: 100%; display: grid; grid-template-columns: minmax(0, 1fr) 350px; gap: 20px; }
.design-canvas-panel { min-width: 0; min-height: 0; display: flex; flex-direction: column; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; }
.canvas-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: white; color: #334155; font-size: 13px; }
.canvas-scroll { flex: 1; overflow: auto; padding: 24px; background: #e2e8f0; }
.scaled-paper { width: fit-content; margin: auto; }
.design-properties { overflow: auto; padding: 0 4px 20px; }
.design-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.design-tabs button { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; }
button[aria-pressed="true"] { background: #fff7ed; border-color: #f97316; color: #9a3412; }
.properties-fields { display: flex; flex-direction: column; gap: 14px; }
h3 { font-size: 14px; font-weight: 650; }
label { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 13px; }
input:not([type="checkbox"]), select, textarea { display: block; width: 100%; padding: 7px 9px; border: 1px solid #cbd5e1; border-radius: 6px; background: white; color: #111827; }
input[type="color"] { height: 38px; }
.add-section { display: flex; flex-wrap: wrap; gap: 7px; }
.design-button { padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; }
button:disabled { opacity: .45; cursor: default; }
.section-list { max-height: 230px; overflow: auto; border: 1px solid #cbd5e1; border-radius: 8px; }
.section-list li { display: flex; font-size: 12px; border-bottom: 1px solid #e2e8f0; }
.section-list li > button { padding: 8px; }
.section-list li > button:first-child { flex: 1; text-align: left; }
.two-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.column-properties { border: 1px solid #cbd5e1; padding: 10px; border-radius: 8px; display: grid; gap: 8px; }
p { font-size: 12px; color: #64748b; }
.design-error { padding: 10px; color: #b91c1c; background: #fef2f2; border-radius: 8px; margin-bottom: 12px; }
@media (max-width: 1000px) { .quote-designer { grid-template-columns: minmax(0, 1fr) 300px; gap: 12px; } }
@media (max-width: 760px) { .quote-designer { height: auto; display: flex; flex-direction: column; } .design-canvas-panel { height: 55vh; flex: none; } .design-properties { overflow: visible; } }
</style>
