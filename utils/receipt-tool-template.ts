import { defaultTaxTableColumns, newElement, printElementMargins, type PrintTemplate, type PrintElement } from './print-templates'
import { printElementPresentation } from './print-designer'

/** Upgrade an editable copy of the old starter, retaining the draft's identity and user edits. */
export function upgradeReceiptToolTemplate(template: PrintTemplate): PrintTemplate {
  if (template.kind !== 'receipt' || !template.elements.some(e => e.id === 'classic-0' && e.field === 'companyName')) return template
  const legacyTax = template.elements.filter(e => e.type === 'taxsummary' && !e.taxColumns)
  if (legacyTax.some(e => e.parentId || e.placement === 'absolute') || template.elements.length + legacyTax.length * 3 > 40) return template
  if (!legacyTax.length && !template.elements.some(e => e.type === 'spacer' || e.inverse)) return template
  const result: PrintTemplate = JSON.parse(JSON.stringify(template)), ids = new Set(result.elements.map(e => e.id))
  const id = (base: string, suffix: string) => {
    let value = `${base.slice(0, 55)}-${suffix}`, n = 1
    while (ids.has(value)) value = `${base.slice(0, 50)}-${suffix}-${n++}`
    ids.add(value); return value
  }
  result.elements = result.elements.flatMap(element => {
    if (element.inverse && ['text', 'field'].includes(element.type)) { Object.assign(element, printElementPresentation(element)); delete element.inverse }
    if (element.type === 'spacer') { element.type = 'frame'; element.name ||= 'Spacing'; return [element] }
    if (element.type !== 'taxsummary' || element.taxColumns) return [element]
    const condition = element.whenField || 'receiptTaxGroups'
    const [topMargin, right, bottomMargin, left] = printElementMargins(element, true)
    const part = (type: PrintElement['type'], suffix: string, options: Partial<PrintElement>) => ({ ...newElement(type, result.width),
      id: id(element.id, suffix), x: element.x, width: element.width, fontSize: element.fontSize, gapBefore: 0, gapAfter: 0,
      visible: element.visible, locked: element.locked, opacity: element.opacity, whenField: condition, marginSides: { top: 0, right, bottom: 0, left }, ...options })
    const top = part('line', 'top-rule', { name: 'Tax summary top rule', height: 2, doubleLine: true, background: '#000000',
      marginSides: { top: topMargin, right, bottom: 0, left } })
    const title = part('text', 'heading', { name: 'Tax summary heading', text: 'TAX SUMMARY', align: 'center', height: 5, color: '#ffffff', background: '#000000', padding: .3, resizeMode: 'auto-height' })
    const bottom = part('line', 'bottom-rule', { name: 'Tax summary bottom rule', height: 2, doubleLine: true, background: '#000000', marginSides: { top: 0, right, bottom: bottomMargin, left } })
    element.taxColumns = defaultTaxTableColumns(); element.tablePadding ??= .25; element.tableBorders ??= false; element.tableRules ??= true
    element.tableHeaderBold ??= false; element.whenField = condition; element.gapBefore = 0; element.gapAfter = 0
    element.marginSides = { top: 0, right, bottom: 0, left }; delete element.margin
    return [top, title, element, bottom]
  })
  for (const element of result.elements) {
    if (element.parentId || element.placement === 'absolute') continue
    const [top, right, bottom, left] = printElementMargins(element, true)
    element.marginSides = { top, right, bottom, left }; delete element.margin; delete element.gapBefore; delete element.gapAfter
  }
  return result
}
