<script setup lang="ts">
import { paintColor, compositeFills, layerBoxStyle } from '~/utils/designer-presentation'
import { applyDesignerRules } from '~/utils/designer-rules'
import QuoteLayer from '~/components/DocumentDesigner/QuoteLayer.vue'
import { provide } from 'vue'
import { quoteLineAmount, quoteTotals } from '~/utils/erp-quote'
import { visibleQuoteItems } from '~/utils/quote-preferences'
import { defaultQuoteDesign, type QuoteDesign, type QuoteDesignSection } from '~/utils/quote-design'
import { resizeAdjacentColumns } from '~/utils/document-table'
import { sheetDimensions } from '~/utils/document-designer'
import { quoteDocumentAddress, quoteDocumentImage } from '~/utils/quote-document'
import { quoteDocumentBindingValues, quoteItemBindingValues, quoteDocumentRuleValues, quoteItemRuleValues } from '~/utils/quote-bindings'
const props = defineProps<{ quote: any; company: any; design?: QuoteDesign; documentTitle?: string; selectedId?: string; editable?: boolean; canvasManaged?: boolean }>()
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
  const sections = design.value.sections.map(section => applyDesignerRules(section, key => conditionValues.value[key])).filter(section => (section.visible || (props.editable && !props.canvasManaged)) &&
    (props.editable || section.role !== 'contact' || field(section.field) || hasContentOverride(section, 'field-value')))
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
  return bindingValues.value[key] ?? ''
}
function date(value: string) {
  if (!professional.value || !/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value
  const parsed = new Date(value + 'T00:00:00Z')
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed)
}
const textTitle = (section: QuoteDesignSection) => section.heading ? section.text.split('\n')[0] : ''
const textBody = (section: QuoteDesignSection) => section.heading ? section.text.split('\n').slice(1).join('\n') : section.text
const layerImage = (section: QuoteDesignSection, key: string, fallback: string) => section.elements?.find(e => e.key === key)?.image || fallback
const bindingValues = computed(() => quoteDocumentBindingValues(props.quote, companyData.value, professional.value))
provide('quote-layer-values', bindingValues)
const conditionValues = computed(() => quoteDocumentRuleValues(props.quote, companyData.value))
provide('quote-condition-values', conditionValues)
const rowRuleValues = quoteItemRuleValues
const rowValues = (line: any, index: number) => quoteItemBindingValues(line, index, companyData.value.currency || 'INR')
const hasContentOverride = (section: QuoteDesignSection, key: string) => section.elements?.some(e => e.key === key && (e.binding !== undefined || e.text !== undefined || !!e.image))
const sectionImage = (section: QuoteDesignSection) => section.binding ? quoteDocumentImage(bindingValues.value[section.binding]) : section.image
function cell(line: any, key: string, index: number) {
  if (key === 'number') return index + 1
  if (key === 'quantity') return `${line.quantity} ${line.unit || ''}`
  if (key === 'amount') return money(line.amount ?? quoteLineAmount(line))
  if (key === 'rate') return money(line.rate)
  if (key === 'discount' || key === 'tax') return `${line[key] || 0}%`
  return line[key]
}
function sectionStyle(section: QuoteDesignSection) {
  const absolute = section.placement === 'absolute'
  const text = ['text', 'field'].includes(section.kind), autoWidth = text && section.resizeMode === 'auto-width', autoHeight = text && (section.resizeMode === 'auto-height' || autoWidth)
  const vertical = text && !!section.frameHeight && !autoHeight && !!section.textVerticalAlign
  return {
    ...(autoWidth ? { width: 'max-content', whiteSpace: 'pre', maxWidth: 'none' } : {}),
    ...(autoHeight ? { height: 'auto' } : {}),
    ...(vertical ? { display: 'flex', flexDirection: 'column', justifyContent: section.textVerticalAlign === 'bottom' ? 'flex-end' : section.textVerticalAlign === 'middle' ? 'center' : 'flex-start' } : {}),
    ...(absolute ? { position: 'absolute' as const, left: `${section.x || 0}mm`, top: `${section.y || 0}mm`, width: autoWidth ? 'max-content' : `${section.frameWidth ?? section.width / 100 * dimensions.value.width}mm`, '--quote-image-left': `${section.x || 0}mm`, '--quote-image-top': `${section.y || 0}mm`, margin: '0', zIndex: section.zIndex ?? 1 }
      : { marginTop: `${section.gapBefore}mm`, marginBottom: `${section.gapAfter}mm`,
        width: autoWidth ? 'max-content' : section.frameWidth ? `${section.frameWidth}mm` : ['items', 'image'].includes(section.kind) ? `${section.width}%` : section.kind === 'totals' ? professional.value ? '74mm' : '280px' : undefined,
        maxWidth: autoWidth ? 'none' : '100%', marginLeft: section.kind === 'totals' || (['items', 'image'].includes(section.kind) && section.align !== 'left') ? 'auto' : undefined,
        marginRight: ['items', 'image'].includes(section.kind) && section.align !== 'right' ? 'auto' : undefined, zIndex: section.zIndex }),
    minHeight: autoHeight ? '0' : section.frameHeight ? `${section.frameHeight}mm` : undefined,
    height: !autoHeight && section.frameHeight && (vertical || section.resizeMode === 'fixed') ? `${section.frameHeight}mm` : autoHeight ? 'auto' : undefined,
    fontSize: ['text', 'field'].includes(section.kind) ? `${section.fontSize}px` : undefined,
    textAlign: section.align, fontWeight: section.fontWeight ?? (section.bold ? '700' : undefined),
    fontFamily: section.fontFamily, fontStyle: section.italic ? 'italic' : undefined, textDecoration: [section.underline ? 'underline' : '', section.strike ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
    lineHeight: section.lineHeight, letterSpacing: section.letterSpacing ? section.letterSpacingUnit === 'percent' ? `${section.letterSpacing / 100}em` : `${section.letterSpacing}px` : undefined,
    color: text && section.fills ? compositeFills(section.fills).css : ['text','field'].includes(section.kind) ? paintColor(section.color || (section.fillOpacity !== undefined ? '#111827' : undefined), section.fillOpacity, section.fillVisible) : section.color, backgroundColor: !text && section.fills ? compositeFills(section.fills).css : ['text','field'].includes(section.kind) ? paintColor(section.background, section.backgroundOpacity, section.backgroundVisible) : paintColor(section.background, section.fillOpacity, section.fillVisible), opacity: section.opacity,
    borderColor: section.borderColor, borderWidth: section.borderWidth !== undefined ? `${section.borderWidth}mm` : undefined,
    borderStyle: section.borderWidth ? 'solid' : undefined,
    ...layerBoxStyle(section),
    transform: section.rotation || section.flipX || section.flipY ? `rotate(${section.rotation || 0}deg) scale(${section.flipX ? -1 : 1}, ${section.flipY ? -1 : 1})` : undefined,
  }
}
</script>
<template>
  <article ref="paper" class="quote-paper" :class="{ 'quote-professional': professional }" :style="{ '--quote-paper-width': `${dimensions.width}mm`, '--quote-paper-height': `${dimensions.height}mm`, '--quote-accent': design.accentColor, '--quote-cell-padding': `${design.tableStyle?.cellPadding ?? design.tablePadding}mm`, '--table-image-width': `${design.tableStyle?.imageWidth ?? 13}mm`, '--table-image-height': `${design.tableStyle?.imageHeight ?? 13}mm`, '--table-image-fit': design.tableStyle?.imageFit || 'contain', '--table-border-width': design.tableStyle?.borderWidth ? `${design.tableStyle.borderWidth}mm` : '1px', '--quote-page-padding': `${design.padding}mm`, padding: `${design.padding}mm`, fontFamily: design.fontFamily, fontSize: `${design.fontSize}px` }">
    <div v-for="block in blocks" :key="block.id" :class="{ 'quote-text-columns': block.paired }" :style="block.paired ? undefined : { display: 'contents' }">
    <template v-for="section in block.sections" :key="section.id">
      <div v-if="section.placement === 'absolute' && section.flowHeight !== undefined" aria-hidden="true" :style="{ height: `${section.flowHeight}mm`, marginTop: `${section.gapBefore}mm`, marginBottom: `${section.gapAfter}mm`, visibility: 'hidden' }" />
      <QuoteLayer v-if="section.visible || editable" tag="section" :section="section" layer-key="" class="quote-design-section" :class="{ 'section-border': section.border, 'selected-section': editable && !canvasManaged && selectedId === section.id, 'editable-section': editable, 'hidden-section': !section.visible, 'managed-section': canvasManaged, 'styled-text': !!section.color, 'framed-section': !!section.frameWidth }" :style="sectionStyle(section)" :data-section-id="section.id" :tabindex="editable && !canvasManaged ? 0 : undefined" @pointerdown="!canvasManaged && dragImage($event, section)" @click="editable && !canvasManaged && emit('select', section.id)">
        <header v-if="section.kind === 'header'" class="quote-heading">
          <QuoteLayer :section="section" layer-key="brand" class="quote-brand">
            <QuoteLayer v-if="professional && layerImage(section, 'logo', companyLogo) || hasContentOverride(section, 'logo')" tag="img" :section="section" layer-key="logo" :source="companyLogo" :alt="`${companyName} logo`" class="company-logo" referrerpolicy="no-referrer" />
            <QuoteLayer :section="section" layer-key="company-info">
              <QuoteLayer tag="h2" :section="section" layer-key="company-name">{{ companyName }}</QuoteLayer>
              <QuoteLayer v-if="professional && companyAddress || hasContentOverride(section, 'company-address')" tag="p" :section="section" layer-key="company-address" class="preserve-lines company-address">{{ companyAddress }}</QuoteLayer>
              <QuoteLayer v-if="companyPhone || hasContentOverride(section, 'company-phone')" tag="p" :section="section" layer-key="company-phone">{{ companyPhone }}</QuoteLayer>
              <QuoteLayer v-if="professional && companyData.companyEmail || hasContentOverride(section, 'company-email')" tag="p" :section="section" layer-key="company-email">{{ companyData.companyEmail }}</QuoteLayer>
              <QuoteLayer v-if="companyData.gstin || hasContentOverride(section, 'company-gstin')" tag="p" :section="section" layer-key="company-gstin">GSTIN: {{ companyData.gstin }}</QuoteLayer>
            </QuoteLayer>
          </QuoteLayer>
          <QuoteLayer :section="section" layer-key="document-info" class="quote-heading-right">
            <QuoteLayer tag="h1" :section="section" layer-key="document-title">{{ documentTitle || 'QUOTATION' }}</QuoteLayer>
            <QuoteLayer tag="strong" :section="section" layer-key="document-number">{{ quote.quoteNumber }}</QuoteLayer>
            <QuoteLayer tag="p" :section="section" layer-key="document-date">Date: {{ date(quote.quoteDate) }}</QuoteLayer>
            <QuoteLayer v-if="quote.expiryDate || hasContentOverride(section, 'document-expiry')" tag="p" :section="section" layer-key="document-expiry">{{ documentTitle === 'SALES ORDER' ? 'Expected shipment' : documentTitle?.startsWith('INVOICE') ? 'Due date' : 'Valid until' }}: {{ date(quote.expiryDate) }}</QuoteLayer>
          </QuoteLayer>
        </header>
        <QuoteLayer v-else-if="section.kind === 'customer'" :section="section" layer-key="customer-box" class="quote-customer">
          <QuoteLayer tag="p" :section="section" layer-key="customer-label" class="quote-label">{{ section.text || 'Prepared for' }}</QuoteLayer>
          <QuoteLayer tag="h3" :section="section" layer-key="customer-name">{{ quote.clientName }}</QuoteLayer>
          <QuoteLayer tag="p" :section="section" layer-key="customer-phone">{{ quote.clientPhone }}</QuoteLayer>
          <QuoteLayer v-if="professional && quote.clientAddress || hasContentOverride(section, 'customer-address')" tag="p" :section="section" layer-key="customer-address" class="preserve-lines">{{ quoteDocumentAddress(quote.clientAddress) }}</QuoteLayer>
          <QuoteLayer v-if="quote.referenceNumber || hasContentOverride(section, 'customer-reference')" tag="p" :section="section" layer-key="customer-reference">Reference: {{ quote.referenceNumber }}</QuoteLayer>
          <QuoteLayer v-if="quote.salesperson || hasContentOverride(section, 'customer-salesperson')" tag="p" :section="section" layer-key="customer-salesperson">Prepared by: {{ quote.salesperson }}</QuoteLayer>
        </QuoteLayer>
        <QuoteLayer v-else-if="section.kind === 'subject'" tag="h3" :section="section" layer-key="subject-text" class="quote-subject">{{ quote.subject }}</QuoteLayer>
        <table v-else-if="section.kind === 'items'" :class="{ bordered: design.tableBorders, 'images-above': design.tableStyle?.imagePlacement === 'above' }">
          <colgroup><col v-for="column in columns" :key="column.field" :style="{ width: `${column.width / columns.reduce((n, c) => n + c.width, 0) * 100}%` }" /></colgroup>
          <thead><tr><th v-for="column in columns" :key="column.field" :style="{ textAlign: column.align, fontSize: design.tableStyle?.headerFontSize ? `${design.tableStyle.headerFontSize}pt` : undefined, height: design.tableStyle?.headerHeight ? `${design.tableStyle.headerHeight}mm` : undefined }"><QuoteLayer tag="span" :section="section" :layer-key="`column-heading-${column.field}`">{{ column.label }}</QuoteLayer><button v-if="editable && !section.locked && columns.indexOf(column) < columns.length - 1" type="button" class="column-divider" :aria-label="`Resize ${column.label} column`" @pointerdown.stop="dragColumn($event, columns.indexOf(column))" @keydown.stop="resizeColumnKey($event, columns.indexOf(column))" @click.stop /></th></tr></thead>
          <tbody><tr v-for="(line, index) in items" :key="line.id" :style="{ height: design.tableStyle?.rowHeight ? `${design.tableStyle.rowHeight}mm` : undefined }"><td v-for="column in columns" :key="column.field" :style="{ textAlign: column.align, verticalAlign: design.tableStyle?.verticalAlign, fontSize: design.tableStyle?.fontSize ? `${design.tableStyle.fontSize}pt` : undefined }"><div v-if="column.field === 'name'" class="quote-item-content"><QuoteLayer v-if="design.showItemImages" :section="section" layer-key="item-image" :row-values="rowValues(line, index)" :row-condition-values="rowRuleValues(line, index)" :source="quoteDocumentImage(line.image)" class="quote-item-image"><img v-if="layerImage(section, 'item-image', quoteDocumentImage(line.image))" :src="layerImage(section, 'item-image', quoteDocumentImage(line.image))" :alt="line.name" referrerpolicy="no-referrer" /><span v-else>Image</span></QuoteLayer><QuoteLayer :section="section" layer-key="item-details" :row-values="rowValues(line, index)" :row-condition-values="rowRuleValues(line, index)"><QuoteLayer tag="strong" :section="section" layer-key="item-name">{{ line.name }}</QuoteLayer><QuoteLayer v-if="line.description || hasContentOverride(section, 'item-description')" tag="p" :section="section" layer-key="item-description" class="preserve-lines">{{ line.description }}</QuoteLayer><QuoteLayer v-if="line.size || hasContentOverride(section, 'item-size')" tag="p" :section="section" layer-key="item-size">Size: {{ line.size }}</QuoteLayer></QuoteLayer></div><QuoteLayer v-else tag="span" :row-values="rowValues(line, index)" :row-condition-values="rowRuleValues(line, index)" :section="section" :layer-key="`column-value-${column.field}`">{{ cell(line, column.field, index) }}</QuoteLayer></td></tr></tbody>
        </table>
        <QuoteLayer v-else-if="section.kind === 'totals'" :section="section" layer-key="totals-box" class="quote-totals">
          <QuoteLayer :section="section" layer-key="subtotal-row"><QuoteLayer tag="span" :section="section" layer-key="subtotal-label">{{ professional ? 'Gross total' : 'Subtotal' }}</QuoteLayer><QuoteLayer tag="span" :section="section" layer-key="subtotal-value">{{ money(quote.subTotal ?? totals.subTotal) }}</QuoteLayer></QuoteLayer>
          <QuoteLayer :section="section" layer-key="discount-row"><QuoteLayer tag="span" :section="section" layer-key="discount-label">Discount<template v-if="professional && quote.discountType === 'percent'"> ({{ quote.discount }}%)</template></QuoteLayer><QuoteLayer tag="span" :section="section" layer-key="discount-value">− {{ money(totals.discountAmount) }}</QuoteLayer></QuoteLayer>
          <QuoteLayer v-if="quote.adjustment || professional" :section="section" layer-key="adjustment-row"><QuoteLayer tag="span" :section="section" layer-key="adjustment-label">{{ professional ? 'Other' : 'Adjustment' }}</QuoteLayer><QuoteLayer tag="span" :section="section" layer-key="adjustment-value">{{ money(quote.adjustment) }}</QuoteLayer></QuoteLayer>
          <QuoteLayer v-if="!professional || totals.includedTax" :section="section" layer-key="tax-row"><QuoteLayer tag="span" :section="section" layer-key="tax-label">Tax included</QuoteLayer><QuoteLayer tag="span" :section="section" layer-key="tax-value">{{ money(totals.includedTax) }}</QuoteLayer></QuoteLayer>
          <QuoteLayer :section="section" layer-key="grand-row" class="quote-grand-total"><QuoteLayer tag="strong" :section="section" layer-key="grand-label">{{ professional ? 'Net total' : 'Total' }}</QuoteLayer><QuoteLayer tag="strong" :section="section" layer-key="grand-value">{{ money(quote.total ?? totals.total) }}</QuoteLayer></QuoteLayer>
        </QuoteLayer>
        <template v-else-if="heading(section.kind)"><QuoteLayer v-if="content(section) || hasContentOverride(section, 'section-body')" tag="h3" :section="section" layer-key="section-heading" class="section-heading">{{ section.text || heading(section.kind) }}</QuoteLayer><QuoteLayer tag="p" :section="section" layer-key="section-body" class="preserve-lines">{{ content(section) }}</QuoteLayer></template>
        <template v-else-if="section.kind === 'text'"><QuoteLayer v-if="textTitle(section) || hasContentOverride(section, 'text-heading')" tag="h3" :section="section" layer-key="text-heading" class="section-heading">{{ textTitle(section) }}</QuoteLayer><QuoteLayer tag="p" :section="section" layer-key="text-body" class="preserve-lines">{{ textBody(section) }}</QuoteLayer></template>
        <QuoteLayer v-else-if="section.kind === 'field' && section.role === 'signature'" :section="section" layer-key="field-frame" class="quote-signature"><div><QuoteLayer tag="p" :section="section" layer-key="field-label">{{ section.text || 'With best regards,' }}</QuoteLayer><QuoteLayer tag="strong" :section="section" layer-key="field-value">{{ field(section.field) || companyName }}</QuoteLayer></div><QuoteLayer :section="section" layer-key="signature-line" class="signature-line">Authorised signature</QuoteLayer></QuoteLayer>
        <QuoteLayer v-else-if="section.kind === 'field' && section.role === 'contact'" tag="p" :section="section" layer-key="field-frame" class="quote-contact"><QuoteLayer tag="span" :section="section" layer-key="field-label">{{ section.text || 'Customer care' }}</QuoteLayer><QuoteLayer tag="strong" :section="section" layer-key="field-value">{{ field(section.field) || (editable ? 'Company contact' : '') }}</QuoteLayer></QuoteLayer>
        <QuoteLayer v-else-if="section.kind === 'field'" tag="p" :section="section" layer-key="field-value" class="preserve-lines">{{ field(section.field) || (editable ? 'Choose a live field' : '') }}</QuoteLayer>
        <template v-else-if="section.kind === 'image'"><img v-if="sectionImage(section)" :src="sectionImage(section)" :alt="section.text" draggable="false" :style="{ width: '100%', height: `${section.frameHeight ?? section.imageHeight}mm`, objectFit: section.imageFit || 'contain', transform: undefined }" /><p v-else-if="editable" class="image-placeholder">Upload a header, footer or logo image</p></template>
        <hr v-else-if="section.kind === 'line'" />
        <div v-else-if="section.kind === 'shape'" aria-hidden="true" />
      </QuoteLayer>
    </template>
    </div>
  </article>
</template>
<style scoped>
.quote-paper { position: relative; box-sizing: border-box; width: var(--quote-paper-width, 210mm); min-height: var(--quote-paper-height, 297mm); margin: auto; background: white; color: #111827; line-height: 1.5; box-shadow: 0 2px 10px #0001; }
.editable-section[style*="absolute"] { touch-action: none; cursor: move; }
.section-border { border: 1px solid var(--quote-accent); padding: 2mm; }
.quote-design-section { position: relative; box-sizing: border-box; overflow-wrap: anywhere; min-height: 1px; }
.editable-section { cursor: pointer; outline: 1px dashed transparent; }
.editable-section:hover { outline-color: #94a3b8; }
.selected-section { outline: 2px solid #f97316 !important; outline-offset: 2px; }
.hidden-section { opacity: .35; }
.managed-section { touch-action: none; cursor: move; }
.managed-section:hover { outline-color: transparent; }
.managed-section.hidden-section { visibility: hidden; }
.styled-text :is(h1, h2, h3, p, strong, span) { color: inherit; }
.quote-paper .quote-design-section > .quote-totals { width: 100%; }
.quote-design-section > img { border-radius: inherit; }
.quote-heading { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid var(--quote-accent); padding-bottom: 5mm; }
.quote-heading h1 { font-size: 24px; letter-spacing: 2px; color: var(--quote-accent); }
.quote-heading h2 { font-size: 20px; font-weight: 700; }
.quote-heading-right { text-align: right; }
.quote-brand { display: flex; align-items: flex-start; gap: 4mm; min-width: 0; }
.company-logo { width: 19mm; height: 19mm; flex: none; }
.quote-item-content { display: flex; gap: 3mm; }
.quote-item-content > div:last-child { min-width: 0; }
.quote-item-image { box-sizing: border-box; display: flex; width: var(--table-image-width, 13mm); height: var(--table-image-height, 13mm); min-width: 0; max-width: 100%; flex: none; align-items: center; justify-content: center; border: 1px solid #e2e8f0; border-radius: 3px; color: #94a3b8; font-size: 9px; }
.quote-item-image img { object-fit: var(--quote-layer-image-fit, var(--table-image-fit, contain)); width: 100%; height: 100%; }
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
