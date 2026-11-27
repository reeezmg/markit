import { classicReceiptTemplate, newElement, type PrintElement } from '../utils/print-templates'

/** The old starter's persisted constructs, independent of the new tool-based defaults. */
export function legacyReceiptFixture() {
  const template = classicReceiptTemplate()
  template.id = 'legacy-tax-copy'; template.name = 'Existing Tax Receipt'
  template.elements = template.elements.filter(e => e.type === 'taxsummary' || e.whenField !== 'receiptTaxGroups')
  const tax = template.elements.find(e => e.type === 'taxsummary')!
  delete tax.taxColumns; delete tax.tableStyle; delete tax.whenField; tax.height = 15
  const savings = template.elements.find(e => e.field === 'receiptSavings')!
  savings.inverse = true; delete savings.color; delete savings.background; delete savings.padding
  const spacer: PrintElement = { ...newElement('spacer',72), id:'classic-space',height:6 }
  template.elements.splice(template.elements.indexOf(tax),0,spacer)
  return template
}
