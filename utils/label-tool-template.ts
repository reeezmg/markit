import { newElement, originalLabelTemplate, templateSchema, type PrintElement, type PrintTemplate } from './print-templates'

/** Refresh only untouched legacy starters, as an undoable editor draft; never restyle custom labels. */
export function upgradeLabelToolTemplate(template: PrintTemplate): PrintTemplate {
  if (template.kind !== 'label' || template.width !== 50 || template.height !== 38 || template.dpi !== '203' || template.fontFamily !== 'thermal' || template.elements.length !== 8) return template
  if (Object.keys(template).some(key => !['id', 'name', 'kind', 'width', 'height', 'dpi', 'fontFamily', 'elements'].includes(key))) return template
  const make = (type: PrintElement['type'], field: string, text: string, y: number, height: number, fontSize = 8, bold = false): PrintElement => ({ ...newElement(type, 50), field, text, y, height, fontSize, bold, align: 'left' })
  const legacy = templateSchema.parse({ ...template, elements: [
    make('field', 'shopname', '', 1, 5, 11, true), make('line', '', '', 5, 2),
    make('field', 'productName', '', 7, 3.5), make('field', 'labelVariantSize', '', 11, 3.5),
    { ...make('field', 'sprice', 'MRP Rs.', 15, 3.5), strikeThrough: 'discount' },
    { ...make('field', 'dprice', 'Discount Rs.', 19, 3.5), visibility: 'discount' },
    make('field', 'code', '', 23, 3, 7), make('barcode', 'barcode', '', 26, 10),
  ] })
  const properties = (element: PrintElement) => JSON.stringify(Object.entries(element).filter(([key]) => key !== 'id').sort(([a], [b]) => a.localeCompare(b)))
  if (template.elements.some((element, index) => properties(element) !== properties(legacy.elements[index]))) return template
  const updated = originalLabelTemplate()
  updated.elements.slice(0, 8).forEach((element, index) => { element.id = template.elements[index].id })
  return { ...template, fontFamily: updated.fontFamily, elements: updated.elements }
}
