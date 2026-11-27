export const barcodeFormats = ['CODE128', 'CODE39', 'EAN13', 'EAN8', 'UPC', 'ITF14'] as const
export type BarcodeFormat = typeof barcodeFormats[number]

export const barcodeFormatOptions: { value: BarcodeFormat; label: string; hint: string; example: string }[] = [
  { value: 'CODE128', label: 'Code 128', hint: 'Latin letters, numbers and standard symbols.', example: 'TEST-001' },
  { value: 'CODE39', label: 'Code 39', hint: 'Letters, numbers and - . space $ / + %. Letters are encoded in uppercase.', example: 'TEST-001' },
  { value: 'EAN13', label: 'EAN-13', hint: '12 digits, or 13 digits with a valid check digit.', example: '5901234123457' },
  { value: 'EAN8', label: 'EAN-8', hint: '7 digits, or 8 digits with a valid check digit.', example: '96385074' },
  { value: 'UPC', label: 'UPC-A', hint: '11 digits, or 12 digits with a valid check digit.', example: '036000291452' },
  { value: 'ITF14', label: 'ITF-14', hint: '13 digits, or 14 digits with a valid check digit.', example: '10012345000017' },
]

export function barcodeFormatInfo(format: BarcodeFormat = 'CODE128') {
  return barcodeFormatOptions.find(option => option.value === format)!
}
