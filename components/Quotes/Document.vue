<script setup lang="ts">
import { quoteLineAmount, quoteTotals } from '~/utils/erp-quote'
import { visibleQuoteItems } from '~/utils/quote-preferences'
import { defaultQuoteDesign, type QuoteDesign, type QuoteDesignSection } from '~/utils/quote-design'
import { resizeAdjacentColumns } from '~/utils/document-table'
import { sheetDimensions } from '~/utils/document-designer'
import { quoteDocumentAddress, quoteDocumentImage } from '~/utils/quote-document'
const props = defineProps<{ quote: any; company: any; design?: QuoteDesign; documentTitle?: string; selectedId?: string; editable?: boolean }>()
const emit = defineEmits<{ select: [id: string]; move: [id: string, x: number, y: number]; gesture: [active: boolean]; resizeColumns: [columns: { field: string; width: number }[]] }>()
const paper = ref<HTMLElement | null>(null)
let endDrag: (() => void) | undefined
onBeforeUnmount(() => endDrag?.())
function dragColumn(event: PointerEvent, index: number) {
  if (!props.editable || event.button !== 0) return
  const target = event.currentTarget as HTMLElement, width = target.closest('table')!.getBoundingClientRect().width
  if (!width) return
  endDrag?.(); event.preventDefault(); emit('gesture', true)
  const original = columns.value.map(column => ({ ...column }))
  target.setPointerCapture(event.pointerId)
  const move = (next: PointerEvent) => emit('resizeColumns', resizeAdjacentColumns(original, index, (next.clientX - event.clientX) / width * 100))
  const stop = (end?: Event) => {
    target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', stop); target.removeEventListener('pointercancel', stop); target.removeEventListener('lostpointercapture', stop)
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
    if (end?.type !== 'pointerup') emit('resizeColumns', original)
    endDrag = undefined; emit('gesture', false)
  }
  endDrag = stop; target.addEventListener('pointermove', move); target.addEventListener('pointerup', stop); target.addEventListener('pointercancel', stop); target.addEventListener('lostpointercapture', stop)
}
function resizeColumnKey(event: KeyboardEvent, index: number) {
  if (!props.editable || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault(); emit('gesture', true)
  emit('resizeColumns', resizeAdjacentColumns(columns.value, index, (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 5 : 1)))
  emit('gesture', false)
}
function dragImage(event: PointerEvent, section: QuoteDesignSection) {
  if (!props.editable || section.kind !== 'image' || section.placement !== 'absolute' || event.button !== 0 || !paper.value) return
  endDrag?.(); event.preventDefault(); emit('select', section.id); emit('gesture', true)
  const target = event.currentTarget as HTMLElement, scale = paper.value.getBoundingClientRect().width / dimensions.value.width
  target.focus({ preventScroll: true }); target.setPointerCapture(event.pointerId)
  const x = section.x || 0, y = section.y || 0
  const move = (next: PointerEvent) => emit('move', section.id, Math.max(0, Math.min(dimensions.value.width * (1 - section.width / 100), Math.round((x + (next.clientX - event.clientX) / scale) * 10) / 10)), Math.max(0, Math.min(dimensions.value.height - section.imageHeight, Math.round((y + (next.clientY - event.clientY) / scale) * 10) / 10)))
  const stop = (end?: Event) => {
    target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', stop); target.removeEventListener('pointercancel', stop); target.removeEventListener('lostpointercapture', stop)
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
    if (end?.type !== 'pointerup') emit('move', section.id, x, y)
    endDrag = undefined; emit('gesture', false)
  }
  endDrag = stop; target.addEventListener('pointermove', move); target.addEventListener('pointerup', stop); target.addEventListener('pointercancel', stop); target.addEventListener('lostpointercapture', stop)
}
const design = computed(() => props.design || props.quote.documentDesign || defaultQuoteDesign())
const dimensions = computed(() => sheetDimensions(design.value.paperSize))
const professional = computed(() => design.value.layout === 'professional')
const companyData = computed(() => props.quote.documentCompany || props.company || {})
const blocks = computed(() => {
  const sections = design.value.sections.filter(section => (section.visible || props.editable) &&
    (props.editable || section.role !== 'contact' || field(section.field)))
  const result: { id: string; paired: boolean; sections: QuoteDesignSection[] }[] = []
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index], next = sections[index + 1]
    const paired = section.kind === 'text' && section.column === 'left' && next?.kind === 'text' && next.column === 'right'
    result.push({ id: section.id, paired, sections: paired ? [section, sections[++index]] : [section] })
  }
  return result
})
const totals = computed(() => quoteTotals(props.quote))
const items = computed(() => visibleQuoteItems(props.quote))
const columns = computed(() => design.value.columns.filter(c => c.visible))
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: companyData.value.currency || 'INR' }).format(value || 0)
const companyName = computed(() => companyData.value.companyName || companyData.value.name || '')
const companyPhone = computed(() => companyData.value.companyPhone || companyData.value.phone || '')
const companyLogo = computed(() => quoteDocumentImage(companyData.value.logo))
const companyAddress = computed(() => quoteDocumentAddress(companyData.value.address))
const content = (section: QuoteDesignSection) => ({ paymentTerms: props.quote.paymentTerms, deliveryEstimate: props.quote.deliveryEstimate, notes: props.quote.notes, terms: props.quote.termsAndConditions } as any)[section.kind]
const heading = (kind: string) => ({ paymentTerms: 'Payment terms', deliveryEstimate: props.documentTitle === 'SALES ORDER' ? 'Delivery method' : 'Delivery estimate', notes: 'Notes', terms: 'Terms and conditions' } as any)[kind]
function field(key: string) {
  if (key === 'companyName') return companyName.value
  if (key === 'companyPhone') return companyPhone.value
  if (key === 'gstin') return companyData.value.gstin
  return key === 'total' ? money(props.quote.total) : props.quote[key]
}
function date(value: string) {
  if (!professional.value || !/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value
  const parsed = new Date(value + 'T00:00:00Z')
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed)
}
const textTitle = (section: QuoteDesignSection) => section.heading ? section.text.split('\n')[0] : ''
const textBody = (section: QuoteDesignSection) => section.heading ? section.text.split('\n').slice(1).join('\n') : section.text
function cell(line: any, key: string, index: number) {
  if (key === 'number') return index + 1
  if (key === 'quantity') return `${line.quantity} ${line.unit || ''}`
  if (key === 'amount') return money(line.amount ?? quoteLineAmount(line))
  if (key === 'rate') return money(line.rate)
  if (key === 'discount' || key === 'tax') return `${line[key] || 0}%`
  return line[key]
}
function sectionStyle(section: QuoteDesignSection) {
  if (section.placement === 'absolute') return { position: 'absolute' as const, left: `${section.x || 0}mm`, top: `${section.y || 0}mm`, width: `${section.width / 100 * dimensions.value.width}mm`, '--quote-image-left': `${section.x || 0}mm`, '--quote-image-top': `${section.y || 0}mm`, margin: '0', zIndex: 1 }
  return { marginTop: `${section.gapBefore}mm`, marginBottom: `${section.gapAfter}mm`, fontSize: ['text', 'field'].includes(section.kind) ? `${section.fontSize}px` : undefined,
    textAlign: section.align, fontWeight: section.bold ? '700' : undefined }
}
</script>
<template>
  <article ref="paper" class="quote-paper" :class="{ 'quote-professional': professional }" :style="{ '--quote-paper-width': `${dimensions.width}mm`, '--quote-paper-height': `${dimensions.height}mm`, '--quote-accent': design.accentColor, '--quote-cell-padding': `${design.tableStyle?.cellPadding ?? design.tablePadding}mm`, '--table-image-width': `${design.tableStyle?.imageWidth ?? 13}mm`, '--table-image-height': `${design.tableStyle?.imageHeight ?? 13}mm`, '--table-image-fit': design.tableStyle?.imageFit || 'contain', '--table-border-width': design.tableStyle?.borderWidth ? `${design.tableStyle.borderWidth}mm` : '1px', '--quote-page-padding': `${design.padding}mm`, padding: `${design.padding}mm`, fontFamily: design.fontFamily, fontSize: `${design.fontSize}px` }">
    <div v-for="block in blocks" :key="block.id" :class="{ 'quote-text-columns': block.paired }" :style="block.paired ? undefined : { display: 'contents' }">
    <template v-for="section in block.sections" :key="section.id">
      <section v-if="section.visible || editable" class="quote-design-section" :class="{ 'section-border': section.border, 'selected-section': editable && selectedId === section.id, 'editable-section': editable, 'hidden-section': !section.visible }" :style="sectionStyle(section)" :data-section-id="section.id" :tabindex="editable ? 0 : undefined" @pointerdown="dragImage($event, section)" @click="editable && emit('select', section.id)">
        <header v-if="section.kind === 'header'" class="quote-heading"><div class="quote-brand"><img v-if="professional && companyLogo" :src="companyLogo" :alt="`${companyName} logo`" class="company-logo" referrerpolicy="no-referrer" /><div><h2>{{ companyName }}</h2><p v-if="professional && companyAddress" class="preserve-lines company-address">{{ companyAddress }}</p><p v-if="companyPhone">{{ companyPhone }}</p><p v-if="professional && companyData.companyEmail">{{ companyData.companyEmail }}</p><p v-if="companyData.gstin">GSTIN: {{ companyData.gstin }}</p></div></div><div class="quote-heading-right"><h1>{{ documentTitle || 'QUOTATION' }}</h1><strong>{{ quote.quoteNumber }}</strong><p>Date: {{ date(quote.quoteDate) }}</p><p v-if="quote.expiryDate">{{ documentTitle === 'SALES ORDER' ? 'Expected shipment' : documentTitle?.startsWith('INVOICE') ? 'Due date' : 'Valid until' }}: {{ date(quote.expiryDate) }}</p></div></header>
        <div v-else-if="section.kind === 'customer'" class="quote-customer"><p class="quote-label">{{ section.text || 'Prepared for' }}</p><h3>{{ quote.clientName }}</h3><p>{{ quote.clientPhone }}</p><p v-if="professional && quote.clientAddress" class="preserve-lines">{{ quoteDocumentAddress(quote.clientAddress) }}</p><p v-if="quote.referenceNumber">Reference: {{ quote.referenceNumber }}</p><p v-if="quote.salesperson">Prepared by: {{ quote.salesperson }}</p></div>
        <h3 v-else-if="section.kind === 'subject'" class="quote-subject">{{ quote.subject }}</h3>
        <table v-else-if="section.kind === 'items'" :style="{ width: `${section.width}%`, marginLeft: section.align === 'left' ? '0' : 'auto', marginRight: section.align === 'right' ? '0' : 'auto' }" :class="{ bordered: design.tableBorders, 'images-above': design.tableStyle?.imagePlacement === 'above' }">
          <colgroup><col v-for="column in columns" :key="column.field" :style="{ width: `${column.width / columns.reduce((n, c) => n + c.width, 0) * 100}%` }" /></colgroup>
          <thead><tr><th v-for="column in columns" :key="column.field" :style="{ textAlign: column.align, fontSize: design.tableStyle?.headerFontSize ? `${design.tableStyle.headerFontSize}pt` : undefined, height: design.tableStyle?.headerHeight ? `${design.tableStyle.headerHeight}mm` : undefined }">{{ column.label }}<button v-if="editable && columns.indexOf(column) < columns.length - 1" type="button" class="column-divider" :aria-label="`Resize ${column.label} column`" @pointerdown.stop="dragColumn($event, columns.indexOf(column))" @keydown.stop="resizeColumnKey($event, columns.indexOf(column))" @click.stop /></th></tr></thead>
          <tbody><tr v-for="(line, index) in items" :key="line.id" :style="{ height: design.tableStyle?.rowHeight ? `${design.tableStyle.rowHeight}mm` : undefined }"><td v-for="column in columns" :key="column.field" :style="{ textAlign: column.align, verticalAlign: design.tableStyle?.verticalAlign, fontSize: design.tableStyle?.fontSize ? `${design.tableStyle.fontSize}pt` : undefined }"><div v-if="column.field === 'name'" class="quote-item-content"><div v-if="design.showItemImages" class="quote-item-image"><img v-if="quoteDocumentImage(line.image)" :src="quoteDocumentImage(line.image)" :alt="line.name" referrerpolicy="no-referrer" /><span v-else>Image</span></div><div><strong>{{ line.name }}</strong><p v-if="line.description" class="preserve-lines">{{ line.description }}</p><p v-if="line.size">Size: {{ line.size }}</p></div></div><template v-else>{{ cell(line, column.field, index) }}</template></td></tr></tbody>
        </table>
        <div v-else-if="section.kind === 'totals'" class="quote-totals"><div><span>{{ professional ? 'Gross total' : 'Subtotal' }}</span><span>{{ money(quote.subTotal ?? totals.subTotal) }}</span></div><div><span>Discount<template v-if="professional && quote.discountType === 'percent'"> ({{ quote.discount }}%)</template></span><span>− {{ money(totals.discountAmount) }}</span></div><div v-if="quote.adjustment || professional"><span>{{ professional ? 'Other' : 'Adjustment' }}</span><span>{{ money(quote.adjustment) }}</span></div><div v-if="!professional || totals.includedTax"><span>Tax included</span><span>{{ money(totals.includedTax) }}</span></div><div class="quote-grand-total"><strong>{{ professional ? 'Net total' : 'Total' }}</strong><strong>{{ money(quote.total ?? totals.total) }}</strong></div></div>
        <template v-else-if="heading(section.kind)"><h3 v-if="content(section)" class="section-heading">{{ section.text || heading(section.kind) }}</h3><p class="preserve-lines">{{ content(section) }}</p></template>
        <template v-else-if="section.kind === 'text'"><h3 v-if="textTitle(section)" class="section-heading">{{ textTitle(section) }}</h3><p class="preserve-lines">{{ textBody(section) }}</p></template>
        <div v-else-if="section.kind === 'field' && section.role === 'signature'" class="quote-signature"><div><p>{{ section.text || 'With best regards,' }}</p><strong>{{ field(section.field) || companyName }}</strong></div><div class="signature-line">Authorised signature</div></div>
        <p v-else-if="section.kind === 'field' && section.role === 'contact'" class="quote-contact"><span>{{ section.text || 'Customer care' }}</span><strong>{{ field(section.field) || (editable ? 'Company contact' : '') }}</strong></p>
        <p v-else-if="section.kind === 'field'" class="preserve-lines">{{ field(section.field) || (editable ? 'Choose a live field' : '') }}</p>
        <template v-else-if="section.kind === 'image'"><img v-if="section.image" :src="section.image" :alt="section.text" draggable="false" :style="{ width: section.placement === 'absolute' ? '100%' : `${section.width}%`, height: `${section.imageHeight}mm`, marginLeft: section.align === 'left' ? '0' : 'auto', marginRight: section.align === 'right' ? '0' : 'auto' }" /><p v-else-if="editable" class="image-placeholder">Upload a header, footer or logo image</p></template>
        <hr v-else-if="section.kind === 'line'" />
      </section>
    </template>
    </div>
  </article>
</template>
<style scoped>
.quote-paper { position: relative; box-sizing: border-box; width: var(--quote-paper-width, 210mm); min-height: var(--quote-paper-height, 297mm); margin: auto; background: white; color: #111827; line-height: 1.5; box-shadow: 0 2px 10px #0001; }
.editable-section[style*="absolute"] { touch-action: none; cursor: move; }
.section-border { border: 1px solid var(--quote-accent); padding: 2mm; }
.quote-design-section { position: relative; overflow-wrap: anywhere; min-height: 1px; }
.editable-section { cursor: pointer; outline: 1px dashed transparent; }
.editable-section:hover { outline-color: #94a3b8; }
.selected-section { outline: 2px solid #f97316 !important; outline-offset: 2px; }
.hidden-section { opacity: .35; }
.quote-heading { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid var(--quote-accent); padding-bottom: 5mm; }
.quote-heading h1 { font-size: 24px; letter-spacing: 2px; color: var(--quote-accent); }
.quote-heading h2 { font-size: 20px; font-weight: 700; }
.quote-heading-right { text-align: right; }
.quote-brand { display: flex; align-items: flex-start; gap: 4mm; min-width: 0; }
.company-logo { width: 19mm; height: 19mm; flex: none; }
.quote-item-content { display: flex; gap: 3mm; }
.quote-item-content > div:last-child { min-width: 0; }
.quote-item-image { box-sizing: border-box; display: flex; width: var(--table-image-width, 13mm); height: var(--table-image-height, 13mm); min-width: 0; max-width: 100%; flex: none; align-items: center; justify-content: center; border: 1px solid #e2e8f0; border-radius: 3px; color: #94a3b8; font-size: 9px; }
.quote-item-image img { object-fit: var(--table-image-fit, contain); width: 100%; height: 100%; }
.quote-item-content { flex-wrap: wrap; }
.quote-item-content > div:last-child { flex: 1; min-width: min(100%, 22mm); }
.images-above .quote-item-content { flex-direction: column; align-items: flex-start; }
th { position: relative; white-space: pre-wrap; }
.column-divider { position: absolute; right: -4px; top: 0; bottom: 0; width: 9px; cursor: col-resize; touch-action: none; background: transparent; border: 0; border-right: 2px solid #f97316; z-index: 2; }
.column-divider:focus { outline: 2px solid #f97316; }
@media print { .column-divider { display: none; } }
.quote-text-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 5mm; break-inside: avoid; }
.quote-signature { display: flex; align-items: flex-end; justify-content: space-between; gap: 8mm; break-inside: avoid; }
.signature-line { width: 48mm; border-top: 1px solid #94a3b8; padding-top: 2mm; text-align: center; color: #64748b; font-size: 10px; }
.quote-contact { display: flex; justify-content: center; gap: 4mm; border-top: 1px solid #e2e8f0; padding-top: 3mm; }
.quote-professional { line-height: 1.45; color: #243648; }
.quote-professional .quote-heading { border-bottom: 2px solid #0f766e; padding-bottom: 4mm; gap: 5mm; }
.quote-professional .quote-heading h2 { color: var(--quote-accent); font-size: 25px; letter-spacing: -.5px; }
.quote-professional .quote-heading h1 { font-size: 21px; letter-spacing: 2px; font-weight: 700; margin-bottom: 2mm; }
.quote-professional .quote-heading-right { flex: none; font-size: 11px; line-height: 1.65; }
.quote-professional .quote-heading-right > strong { display: inline-block; background: #eff4f7; color: var(--quote-accent); padding: 1mm 3mm; border-radius: 3px; font-size: 12px; margin-bottom: 1mm; }
.quote-professional .company-address { font-size: 10px; color: #64748b; }
.quote-professional .quote-customer { border-left: 3px solid #0f766e; background: #f5f8fa; padding: 3mm 4mm; }
.quote-professional .quote-label { color: #0f766e; letter-spacing: 1.4px; font-size: 9px; font-weight: 700; margin-bottom: 1mm; }
.quote-professional .quote-customer h3 { color: var(--quote-accent); font-size: 13px; }
.quote-professional .quote-subject { color: var(--quote-accent); font-size: 14px; }
.quote-professional th { background: var(--quote-accent); color: white; font-size: 10px; letter-spacing: .2px; }
.quote-professional td { font-size: 12px; }
.quote-professional tbody tr:nth-child(even) { background: #f7fafb; }
.quote-professional .quote-totals { width: 74mm; font-size: 11px; }
.quote-professional .quote-totals > div { padding: 1.3mm 0; }
.quote-professional .quote-grand-total { border-top: 0; border-radius: 4px; padding: 3mm 4mm !important; background: var(--quote-accent); color: white; font-size: 15px; margin-top: 2mm; }
.quote-professional .section-heading { color: #0f766e; font-size: 10px; text-transform: uppercase; letter-spacing: .7px; margin-bottom: 2mm; }
.quote-professional .quote-text-columns > section { border-top: 1px solid #dce7eb; padding-top: 3mm; font-size: 10px; }
.quote-customer h3, .quote-subject { font-size: 15px; font-weight: 700; }
.quote-label { color: #6b7280; font-size: 11px; text-transform: uppercase; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { background: #f3f4f6; font-size: .85em; font-weight: bold; }
th, td { padding: var(--quote-cell-padding); border-bottom: 1px solid #e5e7eb; vertical-align: top; overflow-wrap: anywhere; }
.bordered th, .bordered td { border: var(--table-border-width, 1px) solid #d1d5db; }
td p { font-size: .9em; color: #4b5563; }
.quote-totals { width: 280px; max-width: 100%; margin-left: auto; break-inside: avoid; }
.quote-totals > div { display: flex; justify-content: space-between; gap: 20px; padding: 5px 0; }
.quote-grand-total { border-top: 2px solid var(--quote-accent); margin-top: 8px; font-size: 17px; }
.section-heading { font-weight: 700; }
.preserve-lines { white-space: pre-wrap; overflow-wrap: anywhere; }
img { object-fit: contain; display: block; max-width: 100%; break-inside: avoid; }
.image-placeholder { border: 1px dashed #94a3b8; padding: 6mm; color: #64748b; text-align: center; }
hr { border: 0; border-top: 1px solid var(--quote-accent); }
@media print { .quote-paper { width: 100%; min-height: 0; margin: 0; padding: 0 !important; box-shadow: none; } .section-border { border: 1px solid var(--quote-accent); padding: 2mm; }
.quote-design-section { outline: none !important; } .quote-design-section[style*="absolute"] { left: calc(var(--quote-image-left) - var(--quote-page-padding)) !important; top: calc(var(--quote-image-top) - var(--quote-page-padding)) !important; } }
</style>
