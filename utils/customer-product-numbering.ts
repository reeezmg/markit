export const defaultProductReferencePrefix = 'PR'
export function productReferencePrefix(value: unknown): string {
  if (typeof value !== 'string') throw Error('Enter a product reference prefix.')
  const prefix = value.trim().toUpperCase().replace(/-+$/, '')
  if (!/^[A-Z0-9][A-Z0-9_-]{0,15}$/.test(prefix)) throw Error('Use 1–16 letters, numbers, hyphens or underscores for the prefix.')
  return prefix
}
export function customerProductReference(prefix: string, number: bigint | string) {
  return `${prefix}-${String(number).padStart(6, '0')}`
}
