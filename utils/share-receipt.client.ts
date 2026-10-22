import { createThermalReceiptPDF } from './thermal-receipt.client';

/** Store the image-based receipt PDF before creating a link or sending it. */
export async function shareReceiptPDF(data: any, billId: string) {
  const pdf = await createThermalReceiptPDF(data);
  return $fetch<{ path: string; receiptId: string; expiresInDays: number }>('/api/billSale/share-receipt', {
    method: 'POST',
    body: { billId, companyId: data.companyId, pdf: pdf.output('datauristring') },
  });
}
