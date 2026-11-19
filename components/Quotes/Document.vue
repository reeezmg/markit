<script setup lang="ts">
import { quoteLineAmount, quoteTotals } from '~/utils/erp-quote'
import { visibleQuoteItems } from '~/utils/quote-preferences'
import { defaultQuoteDesign, type QuoteDesign, type QuoteDesignSection } from '~/utils/quote-design'
const props = defineProps<{ quote: any; company: any; design?: QuoteDesign; documentTitle?: string; selectedId?: string; editable?: boolean }>()
const emit = defineEmits<{ select: [id: string]; move: [id: string, x: number, y: number]; gesture: [active: boolean] }>()
const paper = ref<HTMLElement | null>(null)
let endDrag: (() => void) | undefined
onBeforeUnmount(() => endDrag?.())
function dragImage(event: PointerEvent, section: QuoteDesignSection) {
  if (!props.editable || section.kind !== 'image' || section.placement !== 'absolute' || event.button !== 0 || !paper.value) return
  endDrag?.(); event.preventDefault(); emit('select', section.id); emit('gesture', true)
  const target = event.currentTarget as HTMLElement, scale = paper.value.getBoundingClientRect().width / 210
  target.focus({ preventScroll: true }); target.setPointerCapture(event.pointerId)
  const x = section.x || 0, y = section.y || 0
  const move = (next: PointerEvent) => emit('move', section.id, Math.max(0, Math.min(210 - section.width * 2.1, Math.round((x + (next.clientX - event.clientX) / scale) * 10) / 10)), Math.max(0, Math.min(297 - section.imageHeight, Math.round((y + (next.clientY - event.clientY) / scale) * 10) / 10)))
  const stop = (end?: Event) => {
    target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', stop); target.removeEventListener('pointercancel', stop); target.removeEventListener('lostpointercapture', stop)
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
    if (end?.type !== 'pointerup') emit('move', section.id, x, y)
    endDrag = undefined; emit('gesture', false)
  }
  endDrag = stop; target.addEventListener('pointermove', move); target.addEventListener('pointerup', stop); target.addEventListener('pointercancel', stop); target.addEventListener('lostpointercapture', stop)
}
const design = computed(() => props.design || props.quote.documentDesign || defaultQuoteDesign())
const totals = computed(() => quoteTotals(props.quote))
const items = computed(() => visibleQuoteItems(props.quote))
const columns = computed(() => design.value.columns.filter(c => c.visible))
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: props.company?.currency || 'INR' }).format(value || 0)
const companyName = computed(() => props.company?.companyName || props.company?.name || '')
const companyPhone = computed(() => props.company?.companyPhone || props.company?.phone || '')
const content = (section: QuoteDesignSection) => ({ paymentTerms: props.quote.paymentTerms, deliveryEstimate: props.quote.deliveryEstimate, notes: props.quote.notes, terms: props.quote.termsAndConditions } as any)[section.kind]
const heading = (kind: string) => ({ paymentTerms: 'Payment terms', deliveryEstimate: props.documentTitle === 'SALES ORDER' ? 'Delivery method' : 'Delivery estimate', notes: 'Notes', terms: 'Terms and conditions' } as any)[kind]
function field(key: string) {
  if (key === 'companyName') return companyName.value
  if (key === 'companyPhone') return companyPhone.value
  if (key === 'gstin') return props.company?.gstin
  return key === 'total' ? money(props.quote.total) : props.quote[key]
}
function cell(line: any, key: string, index: number) {
  if (key === 'number') return index + 1
  if (key === 'quantity') return `${line.quantity} ${line.unit || ''}`
  if (key === 'amount') return money(line.amount ?? quoteLineAmount(line))
  if (key === 'rate') return money(line.rate)
  if (key === 'discount' || key === 'tax') return `${line[key] || 0}%`
  return line[key]
}
function sectionStyle(section: QuoteDesignSection) {
  if (section.placement === 'absolute') return { position: 'absolute' as const, left: `${section.x || 0}mm`, top: `${section.y || 0}mm`, width: `${section.width * 2.1}mm`, '--quote-image-left': `${section.x || 0}mm`, '--quote-image-top': `${section.y || 0}mm`, margin: '0', zIndex: 1 }
  return { marginTop: `${section.gapBefore}mm`, marginBottom: `${section.gapAfter}mm`, fontSize: ['text', 'field'].includes(section.kind) ? `${section.fontSize}px` : undefined,
    textAlign: section.align, fontWeight: section.bold ? '700' : undefined }
}
</script>
<template>
  <article ref="paper" class="quote-paper" :style="{ '--quote-accent': design.accentColor, '--quote-cell-padding': `${design.tablePadding}mm`, '--quote-page-padding': `${design.padding}mm`, padding: `${design.padding}mm`, fontFamily: design.fontFamily, fontSize: `${design.fontSize}px` }">
    <template v-for="section in design.sections" :key="section.id">
      <section v-if="section.visible || editable" class="quote-design-section" :class="{ 'selected-section': editable && selectedId === section.id, 'editable-section': editable, 'hidden-section': !section.visible }" :style="sectionStyle(section)" :data-section-id="section.id" :tabindex="editable ? 0 : undefined" @pointerdown="dragImage($event, section)" @click="editable && emit('select', section.id)">
        <header v-if="section.kind === 'header'" class="quote-heading"><div><h2>{{ companyName }}</h2><p>{{ companyPhone }}</p><p v-if="company?.gstin">GSTIN: {{ company.gstin }}</p></div><div class="quote-heading-right"><h1>{{ documentTitle || 'QUOTATION' }}</h1><strong>{{ quote.quoteNumber }}</strong><p>Date: {{ quote.quoteDate }}</p><p v-if="quote.expiryDate">{{ documentTitle === 'SALES ORDER' ? 'Expected shipment' : documentTitle?.startsWith('INVOICE') ? 'Due date' : 'Valid until' }}: {{ quote.expiryDate }}</p></div></header>
        <div v-else-if="section.kind === 'customer'" class="quote-customer"><p class="quote-label">Prepared for</p><h3>{{ quote.clientName }}</h3><p>{{ quote.clientPhone }}</p><p v-if="quote.referenceNumber">Reference: {{ quote.referenceNumber }}</p><p v-if="quote.salesperson">Prepared by: {{ quote.salesperson }}</p></div>
        <h3 v-else-if="section.kind === 'subject'" class="quote-subject">{{ quote.subject }}</h3>
        <table v-else-if="section.kind === 'items'" :class="{ bordered: design.tableBorders }">
          <colgroup><col v-for="column in columns" :key="column.field" :style="{ width: `${column.width / columns.reduce((n, c) => n + c.width, 0) * 100}%` }" /></colgroup>
          <thead><tr><th v-for="column in columns" :key="column.field" :style="{ textAlign: column.align }">{{ column.label }}</th></tr></thead>
          <tbody><tr v-for="(line, index) in items" :key="line.id"><td v-for="column in columns" :key="column.field" :style="{ textAlign: column.align }"><template v-if="column.field === 'name'"><strong>{{ line.name }}</strong><p v-if="line.description" class="preserve-lines">{{ line.description }}</p><p v-if="line.size">Size: {{ line.size }}</p></template><template v-else>{{ cell(line, column.field, index) }}</template></td></tr></tbody>
        </table>
        <div v-else-if="section.kind === 'totals'" class="quote-totals"><div><span>Subtotal</span><span>{{ money(quote.subTotal ?? totals.subTotal) }}</span></div><div><span>Discount</span><span>− {{ money(totals.discountAmount) }}</span></div><div v-if="quote.adjustment"><span>Adjustment</span><span>{{ money(quote.adjustment) }}</span></div><div><span>Tax included</span><span>{{ money(totals.includedTax) }}</span></div><div class="quote-grand-total"><strong>Total</strong><strong>{{ money(quote.total ?? totals.total) }}</strong></div></div>
        <template v-else-if="heading(section.kind)"><h3 v-if="content(section)" class="section-heading">{{ heading(section.kind) }}</h3><p class="preserve-lines">{{ content(section) }}</p></template>
        <p v-else-if="section.kind === 'text'" class="preserve-lines">{{ section.text }}</p>
        <p v-else-if="section.kind === 'field'" class="preserve-lines">{{ field(section.field) || (editable ? 'Choose a live field' : '') }}</p>
        <template v-else-if="section.kind === 'image'"><img v-if="section.image" :src="section.image" :alt="section.text" draggable="false" :style="{ width: section.placement === 'absolute' ? '100%' : `${section.width}%`, height: `${section.imageHeight}mm`, marginLeft: section.align === 'left' ? '0' : 'auto', marginRight: section.align === 'right' ? '0' : 'auto' }" /><p v-else-if="editable" class="image-placeholder">Upload a header, footer or logo image</p></template>
        <hr v-else-if="section.kind === 'line'" />
      </section>
    </template>
  </article>
</template>
<style scoped>
.quote-paper { position: relative; box-sizing: border-box; width: 210mm; min-height: 297mm; margin: auto; background: white; color: #111827; line-height: 1.5; box-shadow: 0 2px 10px #0001; }
.editable-section[style*="absolute"] { touch-action: none; cursor: move; }
.quote-design-section { position: relative; overflow-wrap: anywhere; min-height: 1px; }
.editable-section { cursor: pointer; outline: 1px dashed transparent; }
.editable-section:hover { outline-color: #94a3b8; }
.selected-section { outline: 2px solid #f97316 !important; outline-offset: 2px; }
.hidden-section { opacity: .35; }
.quote-heading { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid var(--quote-accent); padding-bottom: 5mm; }
.quote-heading h1 { font-size: 24px; letter-spacing: 2px; color: var(--quote-accent); }
.quote-heading h2 { font-size: 20px; font-weight: 700; }
.quote-heading-right { text-align: right; }
.quote-customer h3, .quote-subject { font-size: 15px; font-weight: 700; }
.quote-label { color: #6b7280; font-size: 11px; text-transform: uppercase; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { background: #f3f4f6; font-size: .85em; font-weight: bold; }
th, td { padding: var(--quote-cell-padding); border-bottom: 1px solid #e5e7eb; vertical-align: top; overflow-wrap: anywhere; }
.bordered th, .bordered td { border: 1px solid #d1d5db; }
td p { font-size: .9em; color: #4b5563; }
.quote-totals { width: 280px; max-width: 100%; margin-left: auto; break-inside: avoid; }
.quote-totals > div { display: flex; justify-content: space-between; gap: 20px; padding: 5px 0; }
.quote-grand-total { border-top: 2px solid var(--quote-accent); margin-top: 8px; font-size: 17px; }
.section-heading { font-weight: 700; }
.preserve-lines { white-space: pre-wrap; overflow-wrap: anywhere; }
img { object-fit: contain; display: block; max-width: 100%; break-inside: avoid; }
.image-placeholder { border: 1px dashed #94a3b8; padding: 6mm; color: #64748b; text-align: center; }
hr { border: 0; border-top: 1px solid var(--quote-accent); }
@media print { .quote-paper { width: 100%; min-height: 0; margin: 0; padding: 0 !important; box-shadow: none; } .quote-design-section { outline: none !important; } .quote-design-section[style*="absolute"] { left: calc(var(--quote-image-left) - var(--quote-page-padding)) !important; top: calc(var(--quote-image-top) - var(--quote-page-padding)) !important; } }
</style>
