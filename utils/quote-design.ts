import { designerPresentationFields, designerFonts } from './designer-presentation'
import { quoteRulesProtected } from './quote-rule-guards'
import { z } from 'zod'
import { sheetDimensions } from './document-designer'
import { documentTableStyleSchema } from './document-table'
import { quoteLayerDefinitions, quoteLayerHasRowData } from './quote-layer-definitions'
import { quoteBindingFields, quoteBindingOptions } from './quote-bindings'

export const quoteDesignFields = [
  ...quoteBindingOptions('text').map(field => [field.key, field.label] as const),
]
export const quoteColumnFields = ['number', 'name', 'quantity', 'rate', 'discount', 'tax', 'amount'] as const
export const quoteSectionKinds = ['header', 'customer', 'subject', 'items', 'totals', 'paymentTerms', 'deliveryEstimate', 'notes', 'terms', 'text', 'field', 'image', 'line', 'shape'] as const
export type QuoteSectionKind = typeof quoteSectionKinds[number]
export const quoteSectionLabels: Record<QuoteSectionKind, string> = {
  header: 'Company and quote details', customer: 'Customer details', subject: 'Subject', items: 'Item table', totals: 'Totals',
  paymentTerms: 'Payment terms', deliveryEstimate: 'Delivery estimate', notes: 'Customer notes', terms: 'Terms and conditions',
  text: 'Text', field: 'Live field', image: 'Image', line: 'Divider', shape: 'Shape',
}
const columnSchema = z.object({ field: z.enum(quoteColumnFields), label: z.string().max(60), visible: z.boolean(), width: z.number().min(3).max(100), align: z.enum(['left', 'center', 'right']) })
const elementSchema = z.object({
  ...designerPresentationFields,
  key: z.string().min(1).max(80), name: z.string().max(80).optional(),
  kind: z.enum(['frame', 'text', 'image', 'shape']).optional(), parent: z.string().max(80).optional(),
  binding: z.string().refine(value => !value || value === 'field' || quoteBindingFields.some(field => field.key === value), 'Select a supported data field').optional(),
  shape: z.enum(['rectangle', 'ellipse']).optional(),
  x: z.number().min(-216).max(216).optional(), y: z.number().min(-5000).max(5000).optional(),
  frameWidth: z.number().min(1).max(216).optional(), frameHeight: z.number().min(1).max(5000).optional(),
  slotWidth: z.number().min(0).max(216).optional(), slotHeight: z.number().min(0).max(5000).optional(),
  visible: z.boolean().optional(), locked: z.boolean().optional(), groupId: z.string().max(80).optional(),
  rotation: z.number().min(-180).max(180).optional(), opacity: z.number().min(0).max(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), background: z.string().regex(/^(transparent|#[0-9a-fA-F]{6})$/).optional(),
  borderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), borderWidth: z.number().min(0).max(5).optional(), radius: z.number().min(0).max(100).optional(),
  fontFamily: z.enum(designerFonts).optional(), fontSize: z.number().min(8).max(120).optional(),
  bold: z.boolean().optional(), italic: z.boolean().optional(), underline: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right']).optional(), lineHeight: z.number().min(.5).max(4).optional(), letterSpacing: z.number().min(-50).max(200).optional(),
  imageFit: z.enum(['contain', 'cover']).optional(), flipX: z.boolean().optional(), flipY: z.boolean().optional(),
  image: z.string().max(350000).regex(/^(data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+)?$/).optional(),
  text: z.string().max(5000).optional(), zIndex: z.number().int().min(0).max(9999).optional(),
})
export type QuoteDesignElement = z.infer<typeof elementSchema>
const sectionSchema = z.object({
  ...designerPresentationFields,
  id: z.string().min(1).max(80), kind: z.enum(quoteSectionKinds), visible: z.boolean(),
  text: z.string().max(5000), field: z.string().refine(v => !v || quoteDesignFields.some(([key]) => key === v), 'Select a supported quote field'),
  binding: z.string().max(80).optional(),
  image: z.string().max(350000).regex(/^(data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+)?$/, 'Use a PNG or JPEG image'),
  align: z.enum(['left', 'center', 'right']), bold: z.boolean(), fontSize: z.number().min(8).max(120),
  gapBefore: z.number().min(0).max(80), gapAfter: z.number().min(0).max(80),
  width: z.number().min(10).max(100), imageHeight: z.number().min(5).max(100),
  placement: z.enum(['flow', 'absolute']).optional(), x: z.number().min(0).max(216).optional(), y: z.number().min(0).max(5000).optional(),
  // Optional editor frames preserve legacy flow layouts. All measurements are millimetres.
  frameWidth: z.number().min(1).max(216).optional(), frameHeight: z.number().min(1).max(5000).optional(),
  flowHeight: z.number().min(0).max(5000).optional(),
  name: z.string().max(80).optional(), locked: z.boolean().optional(), groupId: z.string().max(80).optional(),
  zIndex: z.number().int().min(0).max(9999).optional(), rotation: z.number().min(-180).max(180).optional(),
  opacity: z.number().min(0).max(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  background: z.string().regex(/^(transparent|#[0-9a-fA-F]{6})$/).optional(),
  borderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), borderWidth: z.number().min(0).max(5).optional(),
  radius: z.number().min(0).max(100).optional(), shape: z.enum(['rectangle', 'ellipse']).optional(),
  italic: z.boolean().optional(), underline: z.boolean().optional(),
  fontFamily: z.enum(designerFonts).optional(),
  lineHeight: z.number().min(.5).max(4).optional(), letterSpacing: z.number().min(-50).max(200).optional(),
  imageFit: z.enum(['contain', 'cover']).optional(), flipX: z.boolean().optional(), flipY: z.boolean().optional(),
  border: z.boolean().optional(),
  column: z.enum(['left', 'right']).optional(), heading: z.boolean().optional(),
  role: z.enum(['signature', 'contact']).optional(),
  elements: z.array(elementSchema).max(100).optional(),
})
export const quoteDesignSchema = z.object({
  version: z.literal(1), accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontFamily: z.enum(designerFonts), fontSize: z.number().min(9).max(18),
  padding: z.number().min(6).max(25), tableBorders: z.boolean(), tablePadding: z.number().min(1).max(6),
  layout: z.enum(['standard', 'professional']).optional(), showItemImages: z.boolean().optional(),
  paperSize: z.enum(['A4', 'A5', 'Letter']).optional(),
  tableStyle: documentTableStyleSchema.optional(),
  columns: z.array(columnSchema).min(1).max(7), sections: z.array(sectionSchema).min(2).max(30),
}).superRefine((design, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
  if (new Set(design.sections.map(s => s.id)).size !== design.sections.length) fail('Section IDs must be unique')
  const paper = sheetDimensions(design.paperSize)
  if (design.sections.reduce((count, section) => count + (section.elements?.length || 0), 0) > 300) fail('A design can contain up to 300 nested layer edits')
  for (const section of design.sections) {
    if (quoteRulesProtected(section) && section.rules?.some(rule => ['show','hide'].includes(rule.action))) fail('Keep required document values visible; use formatting rules instead')
    const definitions = quoteLayerDefinitions(section.kind, section.role), elements = section.elements || []
    if (section.binding && (!['text', 'image'].includes(section.kind) || !quoteBindingOptions(section.kind === 'image' ? 'image' : 'text').some(field => field.key === section.binding))) fail('Select a compatible data field for this section')
    if (new Set(elements.map(e => e.key)).size !== elements.length) fail('Layer keys must be unique within a section')
    for (const element of elements) {
      if (quoteRulesProtected(section, element.key) && element.rules?.some(rule => ['show','hide'].includes(rule.action))) fail('Keep required document values visible; use formatting rules instead')
      const native = definitions.find(n => n.key === element.key)
      if (!native && !element.kind) fail('Select a supported nested layer')
      if (native && (element.kind || element.parent !== undefined)) fail('Built-in layers retain their type and parent')
      const kind = native?.kind || element.kind
      if (element.binding) {
        const field = quoteBindingFields.find(field => field.key === element.binding)
        if (element.binding !== 'field' && (!field || field.kind !== kind || field.row && !quoteLayerHasRowData(section, element.key))) fail('Select a compatible data field for this layer')
        if (element.binding === 'field' && native?.binding !== 'field') fail('Select a supported data field')
      }
      if (native?.binding && element.text !== undefined && element.binding !== '') fail('Live values remain linked to the document')
      if (native?.protected && native.binding && (element.binding !== undefined && element.binding !== native.binding || element.text !== undefined)) fail('Keep required document values linked to their original data')
      if (native?.protected && element.visible === false) fail('Keep required document values visible')
      let parent = element.parent, depth = 0
      const seen = new Set([element.key])
      while (parent) {
        if (seen.has(parent) || ++depth > 7) { fail('Layer nesting must be a tree with at most eight levels'); break }
        seen.add(parent)
        const builtin = definitions.find(n => n.key === parent), custom = elements.find(n => n.key === parent && n.kind)
        if (!builtin && !custom || (builtin ? builtin.kind !== 'frame' : custom?.kind !== 'frame')) { fail('Place layers inside a frame'); break }
        parent = builtin?.parent || custom?.parent
      }
    }
  }
  for (const section of design.sections) if (section.placement === 'absolute') {
    const width = ['text','field'].includes(section.kind) && section.resizeMode === 'auto-width' ? 0 : section.frameWidth ?? section.width / 100 * paper.width
    if ((section.x || 0) + width > paper.width + .01) fail('Place elements inside the selected page width')
    // Preserve the original single-sheet contract for legacy freely placed images.
    if (section.kind === 'image' && !section.frameWidth && (section.y || 0) + section.imageHeight > paper.height) fail('Place images inside the selected page')
  }
  for (const kind of ['items', 'totals']) if (design.sections.filter(s => s.kind === kind && s.visible).length !== 1 || design.sections.filter(s => s.kind === kind).length !== 1) fail('Keep one visible item table and totals section')
  if (new Set(design.columns.map(c => c.field)).size !== design.columns.length) fail('Table columns must be unique')
  if (!design.columns.some(c => c.field === 'name' && c.visible) || !design.columns.some(c => c.field === 'amount' && c.visible)) fail('Keep the item name and amount columns visible')
  if (JSON.stringify(design).length > 1500000) fail('The design is too large. Use smaller images.')
})
export type QuoteDesign = z.infer<typeof quoteDesignSchema>
export type QuoteDesignSection = QuoteDesign['sections'][number]
export function newQuoteDesignSection(kind: QuoteSectionKind, id: string): QuoteDesignSection {
  return { id, kind, visible: true, text: kind === 'text' ? 'Your text here' : '', field: '', image: '', align: 'left', bold: false,
    fontSize: 12, gapBefore: 0, gapAfter: 4, width: 100, imageHeight: 25,
    ...(kind === 'shape' ? { shape: 'rectangle' as const, background: '#e2e8f0', frameWidth: 60, frameHeight: 25 } : {}) }
}
export function defaultQuoteDesign(): QuoteDesign {
  const kinds: QuoteSectionKind[] = ['header', 'customer', 'subject', 'items', 'totals', 'paymentTerms', 'deliveryEstimate', 'notes', 'terms', 'text']
  const sections = kinds.map((kind, index) => newQuoteDesignSection(kind, `quote-${index}`))
  sections[0].gapAfter = 8
  sections.at(-1)!.text = 'Rates include tax. This quotation is an offer of pricing and does not confirm a sale or payment.'
  sections.at(-1)!.fontSize = 10
  return { version: 1, accentColor: '#111827', fontFamily: 'Arial', fontSize: 12, padding: 16, tableBorders: false, tablePadding: 2.5, sections,
    columns: quoteColumnFields.map((field, i) => ({ field, label: ['#', 'Item', 'Qty / unit', 'Rate', 'Disc. %', 'Tax %', 'Amount'][i],
      visible: true, width: [5, 30, 13, 14, 10, 10, 18][i], align: i > 2 ? 'right' : 'left' })) }
}
export function normalizeQuoteDesign(value: unknown): QuoteDesign {
  const result = quoteDesignSchema.safeParse(value)
  if (!result.success) throw Error(result.error.issues[0]?.message || 'Enter a valid quote design.')
  return result.data
}

export function quoteDesignTemplate(name: string): QuoteDesign {
  const design = defaultQuoteDesign()
  if (name === 'professional') {
    design.layout = 'professional'; design.accentColor = '#18364b'; design.padding = 14; design.showItemImages = true
    const section = newQuoteDesignSection('text', 'template-features')
    Object.assign(section, { text: 'Features and benefits\n• Add your product features here.\n• Describe the benefits for your customer.', heading: true })
    design.sections.splice(design.sections.length - 1, 0, section)
  } else if (name === 'compact') {
    design.fontSize = 10; design.padding = 10; design.tablePadding = 1.5
    design.sections.forEach(section => { section.gapAfter = 2 })
  }
  return design
}
