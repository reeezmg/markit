/** Barcode identity can arrive as a flat product-print payload or an enriched item. */
export function labelBarcode(data: any): string {
  const value = [data?.barcode, data?.item?.barcode].find(v => v != null && String(v).trim() !== '');
  return value == null ? '' : String(value).trim();
}
export class MissingLabelBarcodeError extends Error {
  constructor() {
    super('This product has no barcode. Reload the saved product and try again. No label was printed.');
    this.name = 'MissingLabelBarcodeError';
  }
}
export function requireLabelBarcode(value: unknown): string {
  const barcode = value == null ? '' : String(value).trim();
  if (!barcode) throw new MissingLabelBarcodeError();
  return barcode;
}
