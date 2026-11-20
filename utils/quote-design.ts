import { z } from 'zod'
import { sheetDimensions } from './document-designer'
import { documentTableStyleSchema } from './document-table'

export const quoteDesignFields = [
  ['companyName', 'Company name'], ['companyPhone', 'Company phone'], ['gstin', 'GST number'],
  ['quoteNumber', 'Quote number'], ['quoteDate', 'Quote date'], ['expiryDate', 'Valid until'],
  ['clientName', 'Customer name'], ['clientPhone', 'Customer phone'], ['referenceNumber', 'Customer reference'],
  ['salesperson', 'Prepared by'], ['subject', 'Subject'], ['total', 'Quote total'],
] as const
export const quoteColumnFields = ['number', 'name', 'quantity', 'rate', 'discount', 'tax', 'amount'] as const
export const quoteSectionKinds = ['header', 'customer', 'subject', 'items', 'totals', 'paymentTerms', 'deliveryEstimate', 'notes', 'terms', 'text', 'field', 'image', 'line'] as const
export type QuoteSectionKind = typeof quoteSectionKinds[number]
export const quoteSectionLabels: Record<QuoteSectionKind, string> = {
  header: 'Company and quote details', customer: 'Customer details', subject: 'Subject', items: 'Item table', totals: 'Totals',
  paymentTerms: 'Payment terms', deliveryEstimate: 'Delivery estimate', notes: 'Customer notes', terms: 'Terms and conditions',
  text: 'Text', field: 'Live field', image: 'Image', line: 'Divider',
}
const columnSchema = z.object({ field: z.enum(quoteColumnFields), label: z.string().max(60), visible: z.boolean(), width: z.number().min(3).max(100), align: z.enum(['left', 'center', 'right']) })
const sectionSchema = z.object({
  id: z.string().min(1).max(80), kind: z.enum(quoteSectionKinds), visible: z.boolean(),
  text: z.string().max(5000), field: z.string().refine(v => !v || quoteDesignFields.some(([key]) => key === v), 'Select a supported quote field'),
  image: z.string().max(350000).regex(/^(data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+)?$/, 'Use a PNG or JPEG image'),
  align: z.enum(['left', 'center', 'right']), bold: z.boolean(), fontSize: z.number().min(8).max(40),
  gapBefore: z.number().min(0).max(80), gapAfter: z.number().min(0).max(80),
  width: z.number().min(10).max(100), imageHeight: z.number().min(5).max(100),
  placement: z.enum(['flow', 'absolute']).optional(), x: z.number().min(0).max(216).optional(), y: z.number().min(0).max(297).optional(),
  border: z.boolean().optional(),
  column: z.enum(['left', 'right']).optional(), heading: z.boolean().optional(),
  role: z.enum(['signature', 'contact']).optional(),
})
export const quoteDesignSchema = z.object({
  version: z.literal(1), accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontFamily: z.enum(['Arial', 'Georgia', 'Verdana']), fontSize: z.number().min(9).max(18),
  padding: z.number().min(6).max(25), tableBorders: z.boolean(), tablePadding: z.number().min(1).max(6),
  layout: z.enum(['standard', 'professional']).optional(), showItemImages: z.boolean().optional(),
  paperSize: z.enum(['A4', 'A5', 'Letter']).optional(),
  tableStyle: documentTableStyleSchema.optional(),
  columns: z.array(columnSchema).min(1).max(7), sections: z.array(sectionSchema).min(2).max(30),
}).superRefine((design, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
  if (new Set(design.sections.map(s => s.id)).size !== design.sections.length) fail('Section IDs must be unique')
  const paper = sheetDimensions(design.paperSize)
  for (const section of design.sections) if (section.placement === 'absolute' && (section.kind !== 'image' || (section.x || 0) + section.width / 100 * paper.width > paper.width || (section.y || 0) + section.imageHeight > paper.height)) fail('Place images inside the selected page')
  for (const kind of ['items', 'totals']) if (design.sections.filter(s => s.kind === kind && s.visible).length !== 1 || design.sections.filter(s => s.kind === kind).length !== 1) fail('Keep one visible item table and totals section')
  if (new Set(design.columns.map(c => c.field)).size !== design.columns.length) fail('Table columns must be unique')
  if (!design.columns.some(c => c.field === 'name' && c.visible) || !design.columns.some(c => c.field === 'amount' && c.visible)) fail('Keep the item name and amount columns visible')
  if (JSON.stringify(design).length > 1500000) fail('The design is too large. Use smaller images.')
})
export type QuoteDesign = z.infer<typeof quoteDesignSchema>
export type QuoteDesignSection = QuoteDesign['sections'][number]
export function newQuoteDesignSection(kind: QuoteSectionKind, id: string): QuoteDesignSection {
  return { id, kind, visible: true, text: kind === 'text' ? 'Your text here' : '', field: '', image: '', align: 'left', bold: false,
    fontSize: 12, gapBefore: 0, gapAfter: 4, width: 100, imageHeight: 25 }
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
