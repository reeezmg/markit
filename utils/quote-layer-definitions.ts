/** Stable template nodes. Keys describe presentation, never a particular quote/item record. */
export interface QuoteLayerDefinition {
  key: string; name: string; kind: 'frame' | 'text' | 'image' | 'shape'; parent?: string
  binding?: string; protected?: boolean
}
const node = (key: string, name: string, kind: QuoteLayerDefinition['kind'] = 'text', parent?: string, binding?: string): QuoteLayerDefinition => ({ key, name, kind, parent, binding })
export function quoteLayerDefinitions(kind: string, role?: string): QuoteLayerDefinition[] {
  if (kind === 'header') return [
    node('brand', 'Company', 'frame'), node('logo', 'Company logo', 'image', 'brand', 'companyLogo'),
    node('company-info', 'Company details', 'frame', 'brand'), node('company-name', 'Company name', 'text', 'company-info', 'companyName'),
    node('company-address', 'Address', 'text', 'company-info', 'companyAddress'), node('company-phone', 'Phone', 'text', 'company-info', 'companyPhone'),
    node('company-email', 'Email', 'text', 'company-info', 'companyEmail'), node('company-gstin', 'GST number', 'text', 'company-info', 'gstin'),
    node('document-info', 'Document details', 'frame'), node('document-title', 'Document title', 'text', 'document-info'),
    node('document-number', 'Document number', 'text', 'document-info', 'quoteNumber'), node('document-date', 'Date', 'text', 'document-info', 'quoteDate'),
    node('document-expiry', 'Valid until / shipment', 'text', 'document-info', 'expiryDate'),
  ]
  if (kind === 'customer') return [node('customer-box', 'Customer card', 'frame'),
    node('customer-label', 'Heading', 'text', 'customer-box'), node('customer-name', 'Customer name', 'text', 'customer-box', 'clientName'),
    node('customer-phone', 'Phone', 'text', 'customer-box', 'clientPhone'), node('customer-address', 'Address', 'text', 'customer-box', 'clientAddress'),
    node('customer-reference', 'Reference', 'text', 'customer-box', 'referenceNumber'), node('customer-salesperson', 'Prepared by', 'text', 'customer-box', 'salesperson')]
  if (kind === 'totals') return [{ ...node('totals-box', 'Summary', 'frame'), protected: true }, ...['subtotal', 'discount', 'adjustment', 'tax', 'grand'].flatMap(key => [
    { ...node(`${key}-row`, key === 'grand' ? 'Total' : key[0].toUpperCase() + key.slice(1), 'frame', 'totals-box'), protected: true },
    node(`${key}-label`, 'Label', 'text', `${key}-row`), { ...node(`${key}-value`, 'Amount', 'text', `${key}-row`, `total-${key}`), protected: true },
  ])]
  // Table nodes are the reusable row template, so editing a product image affects every row.
  if (kind === 'items') return [node('item-image', 'Product image', 'image', undefined, 'productImage'), node('item-details', 'Product details · each row', 'frame'), node('item-name', 'Product name', 'text', 'item-details', 'itemName'), node('item-description', 'Description', 'text', 'item-details', 'itemDescription'), node('item-size', 'Size', 'text', 'item-details', 'itemSize'),
    ...['number', 'name', 'quantity', 'rate', 'discount', 'tax', 'amount'].map(field => node(`column-heading-${field}`, `${field} heading`)),
    ...['number', 'quantity', 'rate', 'discount', 'tax', 'amount'].map(field => node(`column-value-${field}`, `${field} value`, 'text', undefined, `row-${field}`)),
  ].map(n => ({ ...n, protected: ['item-details', 'item-name', 'column-value-amount'].includes(n.key) }))
  if (kind === 'text') return [node('text-heading', 'Heading'), node('text-body', 'Text')]
  if (['paymentTerms', 'deliveryEstimate', 'notes', 'terms'].includes(kind)) return [node('section-heading', 'Heading'), node('section-body', 'Text', 'text', undefined, kind)]
  if (kind === 'subject') return [node('subject-text', 'Subject', 'text', undefined, 'subject')]
  if (kind === 'field' && role) return [node('field-frame', role === 'signature' ? 'Signature' : 'Contact', 'frame'), node('field-label', 'Label', 'text', 'field-frame'), node('field-value', 'Live value', 'text', 'field-frame', 'field'), ...(role === 'signature' ? [node('signature-line', 'Signature line', 'shape', 'field-frame')] : [])]
  if (kind === 'field') return [node('field-value', 'Live value', 'text', undefined, 'field')]
  return []
}

/** Row fields must only be used where the renderer repeats a layer for each item. */
export function quoteLayerHasRowData(section: { kind: string; role?: string; elements?: { key: string; parent?: string }[] }, key: string): boolean {
  if (section.kind !== 'items') return false
  const native = quoteLayerDefinitions(section.kind, section.role)
  const parents = [...native, ...(section.elements || []).filter(e => !native.some(d => d.key === e.key))]
  const seen = new Set<string>()
  while (key && !seen.has(key)) {
    if (key === 'item-details' || key === 'item-image' || key.startsWith('column-value-')) return true
    seen.add(key); key = parents.find(n => n.key === key)?.parent || ''
  }
  return false
}
