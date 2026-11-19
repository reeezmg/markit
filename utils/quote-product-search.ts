export const quoteProductSearchFields = [
  { value: 'all', label: 'All fields' },
  { value: 'barcode', label: 'Barcode' },
  { value: 'product', label: 'Product name' },
  { value: 'variant', label: 'Variant name' },
  { value: 'brand', label: 'Brand name' },
  { value: 'category', label: 'Category name' },
  { value: 'subcategory', label: 'Subcategory name' },
  { value: 'collection', label: 'Collection name' },
] as const

export type QuoteProductSearchField = typeof quoteProductSearchFields[number]['value']
export const quoteProductSearchStorageKey = 'erp:quote-product-search-field:v1'
export function isQuoteProductSearchField(value: unknown): value is QuoteProductSearchField {
  return quoteProductSearchFields.some(field => field.value === value)
}
