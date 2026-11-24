/** A slash requests the numeric part of a company-owned barcode. */
export function billingBarcodeShortcut(value: unknown): string | null {
  const input = String(value ?? '').trim()
  if (!input.startsWith('/')) return null
  const match = /^\/(\d{1,6})$/.exec(input)
  if (!match) throw new Error('Enter / followed by 1 to 6 digits, for example /123.')
  return match[1].padStart(6, '0')
}
