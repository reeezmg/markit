import { newQuoteDesignSection, defaultQuoteDesign, type QuoteDesignSection } from './quote-design'
import type { QuoteLayerNode } from './quote-layers'
import { labelFields, receiptFields, printElementRules, printElementValue, printElementMargins, type PrintTemplate, type PrintElement } from './print-templates'
import { labelVariables, type LabelVariable } from './label-variables'
import type { QuoteBindingField } from './quote-bindings'
import { compositeFills, transformLayerVector } from './designer-presentation'
import type { DesignerBox } from './designer-geometry'

/** Depth relative to the roots of this collection, including a copied subtree. */
export function printTreeDepth(elements: Pick<PrintElement, 'id' | 'parentId'>[]): number {
  const byId = new Map(elements.map(element => [element.id, element]))
  return Math.max(0, ...elements.map(element => {
    let depth = 1, parent = element.parentId && byId.get(element.parentId)
    const seen = new Set([element.id])
    while (parent) {
      if (seen.has(parent.id)) return Infinity
      seen.add(parent.id); depth++; parent = parent.parentId && byId.get(parent.parentId)
    }
    return depth
  }))
}

/** Keep printer geometry in millimetres instead of quantized DOM offsetWidth/offsetHeight. */
export function printLayerLocalBox(template: PrintTemplate, element: PrintElement, measured: Record<string, DesignerBox>): DesignerBox | undefined {
  const box = measured[element.id], parent = template.elements.find(e => e.id === element.parentId)
  if (!box || !parent) return box && { ...box }
  const parentBox = measured[parent.id]
  if (!parentBox) return undefined
  const ancestors: PrintElement[] = []
  for (let node: PrintElement | undefined = parent; node; node = template.elements.find(e => e.id === node!.parentId)) ancestors.unshift(node)
  const delta = transformLayerVector(ancestors, box.x + box.width / 2 - parentBox.x - parentBox.width / 2, box.y + box.height / 2 - parentBox.y - parentBox.height / 2, true)
  // Printer frames use their border box as the child origin; only content layers inset padding.
  return { ...box, x: parentBox.width / 2 + delta.x - box.width / 2, y: parentBox.height / 2 + delta.y - box.height / 2 }
}

/** Recover only sub-pixel undersizing left by older grouping, without relaxing containment. */
export function printFrameMoveSize(template: PrintTemplate, frame: PrintElement) {
  let width = frame.width, height = frame.height
  for (const child of template.elements.filter(e => e.parentId === frame.id)) {
    const [top, right, bottom, left] = printElementMargins(child)
    const autoText = ['text', 'field'].includes(child.type) && ['auto-width', 'auto-height'].includes(child.resizeMode || '')
    const requiredWidth = child.x + left + (autoText && child.resizeMode === 'auto-width' ? 0 : child.width) + Math.max(0, right)
    const requiredHeight = child.y + top + (autoText ? 0 : child.height) + Math.max(0, bottom)
    if (requiredWidth > width && requiredWidth - frame.width <= .5) width = Math.ceil(requiredWidth * 100) / 100
    if (requiredHeight > height && requiredHeight - frame.height <= .5) height = Math.ceil(requiredHeight * 100) / 100
  }
  return { width, height }
}

/** Expose effective printer colours without changing the saved layer on open. */
export function printElementPresentation(element: PrintElement): Partial<PrintElement> {
  if (element.type === 'line') return { background: element.background ?? element.color ?? '#000000' }
  if (!element.inverse || !['text', 'field'].includes(element.type)) return {}
  const fill = element.fills ? compositeFills(element.fills) : { opacity: element.fillOpacity ?? 1, visible: element.fillVisible !== false }
  return { color: '#ffffff', fills: element.fills ? [{ color: '#ffffff', opacity: fill.opacity, visible: fill.visible }] : undefined,
    fillOpacity: element.fillOpacity ?? 1, fillVisible: element.fillVisible !== false,
    background: '#000000', backgroundOpacity: fill.opacity, backgroundVisible: fill.visible }
}
export function patchPrintPresentation(element: PrintElement, values: Partial<PrintElement>) {
  const paintKeys = ['color', 'fills', 'fillOpacity', 'fillVisible', 'background', 'backgroundOpacity', 'backgroundVisible']
  if (element.inverse && paintKeys.some(key => Object.prototype.hasOwnProperty.call(values, key))) Object.assign(element, printElementPresentation(element), { inverse: false })
  if ("rules" in values || "strike" in values) {
    element.rules = values.rules ?? printElementRules(element); element.strike = values.strike ?? element.strike ?? element.strikeThrough === "always"
    delete element.whenField; delete element.visibility; delete element.strikeThrough
  }
  Object.assign(element, values)
}

export const printElementId = (id: string) => id.split('::').at(-1)!
export function printElementName(element: PrintElement) {
  return element.name || (element.type === 'text' ? element.text.slice(0, 24) || 'Text' : element.type === 'field' ? labelVariables.find(v => v.key === element.field)?.label || friendlyPrintField(element.field || 'Linked data') : ({ logo: 'Image', qrcode: 'QR code', items: 'Table / Items', taxsummary: 'Table / Tax summary' } as Record<string, string>)[element.type] || friendlyPrintField(element.type))
}
export const friendlyPrintField = (value: string) => ({ shopname: 'Shop name', sprice: 'MRP', dprice: 'Discounted price', labelVariantSize: 'Variant name and size', code: 'SKU / code', gstin: 'GST number', tqty: 'Total quantity', tdiscount: 'Total discount', receiptDiscount: 'Discount / round off', receiptSavings: 'Savings', receiptDate: 'Receipt date', receiptUpiPayment: 'UPI payment link', receiptTaxGroups: 'Tax group count' } as Record<string, string>)[value] || value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._]/g, ' ').replace(/^./, s => s.toUpperCase())
export function printLayerTree(template: PrintTemplate): QuoteLayerNode[] {
  function build(element: PrintElement, rootId: string, parent?: QuoteLayerNode): QuoteLayerNode {
    const kind = element.type === 'frame' || ['items', 'taxsummary', 'spacer'].includes(element.type) ? 'frame' : element.type === 'logo' || ['barcode', 'qrcode'].includes(element.type) ? 'image' : ['line', 'shape'].includes(element.type) ? 'shape' : 'text'
    const id = parent ? `${rootId}::${element.id}` : element.id
    const model: QuoteDesignSection = { ...newQuoteDesignSection(kind === 'frame' ? 'header' : kind === 'image' && element.type !== 'logo' ? 'header' : kind, id),
      ...element, ...printElementPresentation(element), rules: printElementRules(element), strike: element.strike ?? element.strikeThrough === 'always', id, kind: kind === 'frame' ? 'header' : kind === 'image' && element.type !== 'logo' ? 'header' : kind, name: printElementName(element), visible: element.visible !== false,
      frameWidth: element.width, frameHeight: element.height, fontSize: element.fontSize, field: element.field, image: element.image }
    const node: QuoteLayerNode = { id, key: parent ? element.id : '', name: printElementName(element), kind, model, section: parent?.section || model,
      element: parent ? { ...element, key: element.id, kind } : undefined, binding: element.field || undefined, parentId: parent?.id,
      locked: !!element.locked || !!parent?.locked, visible: element.visible !== false && parent?.visible !== false, children: [] }
    node.children = template.elements.filter(e => e.parentId === element.id).map(e => build(e, rootId, node))
    return node
  }
  return template.elements.filter(e => !e.parentId).map(e => build(e, e.id))
}
export function printCanvasDesign(template: PrintTemplate) {
  return { ...defaultQuoteDesign(), padding: 0, sections: printLayerTree(template).map(n => n.model) }
}
export function printBindingFields(template: PrintTemplate, custom: LabelVariable[], element: PrintElement): QuoteBindingField[] {
  if (element.type === 'logo') return []
  const variables = template.kind === 'label' ? [...labelVariables, ...custom] : []
  const fields: QuoteBindingField[] = variables.map(v => ({ ...v, kind: 'text' }))
  for (const key of template.kind === 'label' ? labelFields : receiptFields) if (!fields.some(v => v.key === key)) fields.push({ key, label: friendlyPrintField(key), group: template.kind === 'label' ? 'Label' : /^(company|phone|gstin|upi)/.test(key) ? 'Company' : /^(client)/.test(key) ? 'Customer' : /total|discount|savings|qty/i.test(key) ? 'Totals' : 'Receipt', kind: 'text' })
  if (element.field && !fields.some(v => v.key === element.field)) fields.push({ key: element.field, label: friendlyPrintField(element.field), group: 'Saved fields', kind: 'text' })
  return fields
}
export function setPrintBinding(element: PrintElement, binding: string, data: any) {
  if (!['text', 'field', 'barcode', 'qrcode', 'logo'].includes(element.type)) return
  const wasText = element.type === 'text', wasLinked = !!element.field
  const old = printElementValue(element, data)
  element.field = binding
  if (element.type === 'logo') { if (binding) element.image = ''; return }
  if (element.type === 'text' || element.type === 'field') {
    element.type = binding ? 'field' : 'text'
    element.text = binding ? wasText ? '' : element.text : old.slice(0, 2000)
  } else if (!binding) element.text = old.slice(0, 2000)
  else if (!wasLinked) element.text = ''
  if (!binding || wasText || !wasLinked) delete element.suffix
}
