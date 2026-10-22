export interface ReceiptFinishing { bottomLines: number; autoCut: boolean }
export const RECEIPT_FINISHING_KEY = 'markit-receipt-finishing';
export const DEFAULT_RECEIPT_FINISHING: ReceiptFinishing = { bottomLines: 7, autoCut: true };
export function normalizeReceiptFinishing(value: any): ReceiptFinishing {
  return {
    bottomLines: Number.isInteger(value?.bottomLines) && value.bottomLines >= 0 && value.bottomLines <= 30 ? value.bottomLines : 7,
    autoCut: typeof value?.autoCut === 'boolean' ? value.autoCut : true,
  };
}
export function getReceiptFinishing(): ReceiptFinishing {
  try { return normalizeReceiptFinishing(JSON.parse(localStorage.getItem(RECEIPT_FINISHING_KEY) || 'null')); }
  catch { return { ...DEFAULT_RECEIPT_FINISHING }; }
}
export function saveReceiptFinishing(value: ReceiptFinishing) {
  if (!Number.isInteger(value.bottomLines) || value.bottomLines < 0 || value.bottomLines > 30) throw new Error('Enter a whole number from 0 to 30.');
  localStorage.setItem(RECEIPT_FINISHING_KEY, JSON.stringify(normalizeReceiptFinishing(value)));
}
export function receiptFeedBytes(settings = getReceiptFinishing()): number[] {
  // Default ESC/POS line spacing is 1/6 inch.
  return settings.bottomLines ? [0x1b, 0x32, 0x1b, 0x64, settings.bottomLines] : [];
}
export function receiptFinishBytes(settings = getReceiptFinishing()): number[] {
  return [...receiptFeedBytes(settings), ...(settings.autoCut ? [0x1d, 0x56, 0] : [])];
}
export function receiptBottomMarginMm(settings = getReceiptFinishing()) { return settings.bottomLines * 25.4 / 6; }
